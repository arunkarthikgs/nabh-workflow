// PostgreSQL-backed data store. Mirrors the JSON store contract so both drivers stay interchangeable.
import { readFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { configValue } from "../config.js";

const outputDirectory = fileURLToPath(new URL("../../../output", import.meta.url));
const profileFields = ["dateOfBirth", "gender", "mobileNumber", "address", "employeeId", "department", "dateOfJoining", "employmentType", "passwordHash", "passwordSalt", "passwordSet", "passwordSetupToken", "passwordSetupExpiresAt"];

let pool = null;
let ready = null;
let initializing = false;

function sslOption() {
  const mode = configValue("POSTGRES_SSL", "").toLowerCase();
  if (!mode || /^(0|false|no|off|disable)$/.test(mode)) return undefined;
  if (mode === "no-verify") return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

function connectionStringWithoutSslOptions(value) {
  try {
    const url = new URL(value);
    for (const option of ["ssl", "sslmode", "sslrootcert", "sslcert", "sslkey"]) url.searchParams.delete(option);
    return url.toString();
  } catch {
    return value;
  }
}

function poolConfig() {
  const connectionString = configValue("POSTGRES_URL") || configValue("DATABASE_URL");
  const ssl = sslOption();
  // node-postgres lets URL sslmode settings overwrite config.ssl; remove them so POSTGRES_SSL
  // is the single source of truth for local migrations and Worker runtime configuration.
  if (connectionString) return { connectionString: connectionStringWithoutSslOptions(connectionString), ssl };
  return {
    host: configValue("POSTGRES_HOST", "127.0.0.1"),
    port: Number(configValue("POSTGRES_PORT", "5432")),
    database: configValue("POSTGRES_DATABASE", "nabh_docs"),
    user: configValue("POSTGRES_USER", "postgres"),
    password: configValue("POSTGRES_PASSWORD", ""),
    ssl
  };
}

const schemaStatements = [
  `create table if not exists schema_migrations (
     version integer primary key,
     applied_at timestamptz not null default now()
   )`,
  `create table if not exists hospitals (
     id uuid primary key,
     ordinal integer not null default 0,
     name text not null,
     code text not null,
     location text not null default '',
     status text not null default 'active',
     logo_data_url text not null default '',
     logo_path text not null default '',
     repository jsonb not null default '{}'::jsonb,
     details jsonb not null default '{}'::jsonb,
     roles_seeded boolean not null default false,
     registration_status text not null default '',
     accreditation jsonb not null default '{}'::jsonb,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now(),
     constraint hospitals_code_key unique (code) deferrable initially deferred
   )`,
  `create table if not exists hospital_users (
     id uuid primary key,
     hospital_id uuid not null references hospitals (id) on delete cascade,
     ordinal integer not null default 0,
     name text not null,
     email text not null,
     role text not null,
     active boolean not null default true,
     profile jsonb not null default '{}'::jsonb,
     created_at timestamptz not null default now(),
     constraint hospital_users_email_key unique (hospital_id, email) deferrable initially deferred
   )`,
  `create table if not exists hospital_roles (
     id uuid primary key,
     hospital_id uuid not null references hospitals (id) on delete cascade,
     ordinal integer not null default 0,
     name text not null,
     reports jsonb not null default '[]'::jsonb,
     document_access jsonb not null default '{}'::jsonb,
     permissions jsonb not null default '[]'::jsonb,
     default_access_applied boolean not null default false
   )`,
  `create table if not exists document_matches (
     department text not null,
     department_ordinal integer not null default 0,
     ordinal integer not null,
     document jsonb not null,
     primary key (department, ordinal)
   )`,
  `create table if not exists document_audit (
     seq bigserial primary key,
     entry jsonb not null
   )`,
  `create table if not exists document_status (
     hospital_id uuid not null references hospitals (id) on delete cascade,
     document_id text not null,
     status text not null default 'not_started',
     updated_at timestamptz not null default now(),
     updated_by text not null default 'system',
     note text not null default '',
     primary key (hospital_id, document_id)
   )`,
  `create table if not exists document_drafts (
     hospital_id uuid not null references hospitals (id) on delete cascade,
     document_id text not null,
     draft jsonb not null,
     primary key (hospital_id, document_id)
   )`,
  `create table if not exists service_bookings (
     id uuid primary key,
     hospital_id uuid not null references hospitals (id) on delete cascade,
     ordinal integer not null default 0,
      booking jsonb not null,
      category text not null default '',
      service_id text not null default '',
      service_name text not null default '',
      mode text not null default 'virtual',
      preferred_date date,
      status text not null default 'requested',
      notes text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
   )`,
  `create table if not exists template_questionnaires (
     id uuid primary key,
     programme text not null,
     template_path text not null,
     updated_at timestamptz not null default now(),
     unique (programme, template_path)
   )`,
  `create table if not exists template_questions (
     id uuid primary key,
     questionnaire_id uuid not null references template_questionnaires (id) on delete cascade,
     question_key text not null,
     label text not null,
     question_type text not null,
     required boolean not null default true,
     options jsonb not null default '[]'::jsonb,
     prefill_field text not null default '',
     ordinal integer not null default 0,
     unique (questionnaire_id, question_key)
   )`,
  `create table if not exists hospital_document_answers (
     hospital_id uuid not null references hospitals (id) on delete cascade,
     document_id text not null,
     question_id uuid not null references template_questions (id) on delete cascade,
     answer text not null default '',
     updated_at timestamptz not null default now(),
     primary key (hospital_id, document_id, question_id)
   )`,
  `create index if not exists hospital_users_hospital_idx on hospital_users (hospital_id)`,
  `create index if not exists hospital_roles_hospital_idx on hospital_roles (hospital_id)`,
    `create index if not exists hospital_users_email_idx on hospital_users (lower(email))`,
    `create index if not exists document_status_hospital_idx on document_status (hospital_id)`,
    `create index if not exists document_drafts_hospital_idx on document_drafts (hospital_id)`,
    `create index if not exists template_questions_questionnaire_idx on template_questions (questionnaire_id, ordinal)`,
    `create index if not exists hospital_document_answers_document_idx on hospital_document_answers (hospital_id, document_id)`,
    `create index if not exists document_audit_timestamp_idx on document_audit ((entry->>'timestamp'))`,
  // ADD COLUMN IF NOT EXISTS handles upgrading a database created before these columns existed;
  // "create table if not exists" above alone would skip them on an already-existing table.
  `alter table hospitals add column if not exists registration_status text not null default ''`,
  `alter table hospitals add column if not exists accreditation jsonb not null default '{}'::jsonb`,
  `alter table service_bookings add column if not exists category text not null default ''`,
  `alter table service_bookings add column if not exists service_id text not null default ''`,
  `alter table service_bookings add column if not exists service_name text not null default ''`,
  `alter table service_bookings add column if not exists mode text not null default 'virtual'`,
  `alter table service_bookings add column if not exists preferred_date date`,
  `alter table service_bookings add column if not exists status text not null default 'requested'`,
  `alter table service_bookings add column if not exists notes text not null default ''`,
  `alter table service_bookings add column if not exists created_at timestamptz not null default now()`,
  `alter table service_bookings add column if not exists updated_at timestamptz not null default now()`,
  `update service_bookings set category = coalesce(nullif(category, ''), booking->>'category'), service_id = coalesce(nullif(service_id, ''), booking->>'serviceId'), service_name = coalesce(nullif(service_name, ''), booking->>'serviceName'), mode = coalesce(nullif(mode, ''), booking->>'mode', 'virtual'), preferred_date = case when booking->>'preferredDate' ~ '^\\d{4}-\\d{2}-\\d{2}$' then (booking->>'preferredDate')::date else preferred_date end, status = coalesce(nullif(status, ''), booking->>'status', 'requested'), notes = coalesce(nullif(notes, ''), booking->>'notes', '') where category = '' or service_id = '' or service_name = ''`,
  `create index if not exists service_bookings_hospital_created_idx on service_bookings (hospital_id, created_at desc)`,
  `create index if not exists service_bookings_status_idx on service_bookings (status)`,
  `do $$ begin
     if not exists (select 1 from pg_constraint where conname = 'hospitals_status_check') then
       alter table hospitals add constraint hospitals_status_check check (status in ('pending', 'active', 'inactive')) not valid;
     end if;
     if not exists (select 1 from pg_constraint where conname = 'service_bookings_mode_check') then
       alter table service_bookings add constraint service_bookings_mode_check check (mode in ('virtual', 'onsite')) not valid;
     end if;
     if not exists (select 1 from pg_constraint where conname = 'service_bookings_status_check') then
       alter table service_bookings add constraint service_bookings_status_check check (status in ('requested', 'confirmed', 'completed', 'cancelled')) not valid;
     end if;
   end $$`,
  `insert into schema_migrations (version) values (1) on conflict (version) do nothing`
];

async function createPool() {
  let pg;
  try { ({ default: pg } = await import("pg")); }
  catch { throw new Error("DATA_STORE=postgres requires the 'pg' package. Run: npm install pg"); }
  return new pg.Pool({
    ...poolConfig(),
    max: Number(configValue("POSTGRES_POOL_MAX", "10")),
    connectionTimeoutMillis: Number(configValue("POSTGRES_CONNECTION_TIMEOUT_MS", "10000"))
  });
}

async function connect() {
  if (initializing && pool) return pool; // seeding runs through the public save helpers
  if (!ready) ready = (async () => {
    initializing = true;
    try {
      pool = await createPool();
      for (const statement of schemaStatements) await pool.query(statement);
      await seedFromJsonFiles();
    } catch (error) {
      ready = null;
      throw error;
    } finally {
      initializing = false;
    }
  })();
  await ready;
  return pool;
}

async function readJsonFile(fileName) {
  try { return JSON.parse(await readFile(path.join(outputDirectory, fileName), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

// One-time import so an existing file-based deployment keeps its data when switching to PostgreSQL.
async function seedFromJsonFiles() {
  const { rows: [counts] } = await pool.query(
    `select (select count(*) from hospitals) as hospitals, (select count(*) from document_matches) as matches, (select count(*) from document_audit) as audit`
  );
  if (Number(counts.hospitals) === 0) {
    const hospitals = await readJsonFile("hospitals.json");
    if (Array.isArray(hospitals) && hospitals.length) await saveHospitals(hospitals);
  }
  if (Number(counts.matches) === 0) {
    const matches = await readJsonFile("documentMatches.json");
    if (matches && Object.keys(matches).length) await saveDocumentMatches(matches);
  }
  if (Number(counts.audit) === 0) {
    const audit = await readJsonFile("documentAudit.json");
    if (Array.isArray(audit) && audit.length) await saveDocumentAudit(audit);
  }
  const { rows: [statusCount] } = await pool.query(`select count(*) as count from document_status`);
  if (Number(statusCount.count) === 0) {
    const status = await readJsonFile("documentStatus.json");
    if (status && Object.keys(status).length) await saveDocumentStatus(status);
  }
  const { rows: [draftCount] } = await pool.query(`select count(*) as count from document_drafts`);
  if (Number(draftCount.count) === 0) {
    const drafts = await readJsonFile("documentDrafts.json");
    if (drafts && Object.keys(drafts).length) await saveDocumentDrafts(drafts);
  }
  const { rows: [bookingCount] } = await pool.query(`select count(*) as count from service_bookings`);
  if (Number(bookingCount.count) === 0) {
    const bookings = await readJsonFile("bookings.json");
    if (Array.isArray(bookings) && bookings.length) await saveBookings(bookings);
  }
}

export async function initialize() {
  await connect();
}

export async function resetHospitalDomain() {
  const client = await (await connect()).connect();
  try {
    await client.query("begin");
    await client.query("truncate table hospitals cascade");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export function info() {
  const config = poolConfig();
  if (config.connectionString) {
    let target = "configured connection string";
    try { const url = new URL(config.connectionString); target = `${url.hostname}${url.pathname}`; } catch { /* keep generic label */ }
    return { driver: "postgres", target };
  }
  return { driver: "postgres", target: `${config.host}:${config.port}/${config.database}` };
}

function isoDate(value) {
  return value instanceof Date ? value.toISOString() : value || new Date().toISOString();
}

function toUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, active: row.active, ...(row.profile || {}), createdAt: isoDate(row.created_at) };
}

function toRole(row) {
  const role = { id: row.id, name: row.name, reports: row.reports || [], documentAccess: row.document_access || {}, permissions: row.permissions || [] };
  if (row.default_access_applied) role.defaultAccessApplied = true;
  return role;
}

function toHospital(row, users, roles) {
  const hospital = {
    id: row.id,
    name: row.name,
    code: row.code,
    location: row.location,
    status: row.status,
    logoDataUrl: row.logo_data_url,
    logoPath: row.logo_path,
    repository: row.repository || {},
    details: row.details || {},
    users,
    createdAt: isoDate(row.created_at),
    updatedAt: isoDate(row.updated_at)
  };
  if (row.registration_status) hospital.registrationStatus = row.registration_status;
  if (row.accreditation && Object.keys(row.accreditation).length) hospital.accreditation = row.accreditation;
  if (row.roles_seeded) hospital.roles = roles;
  return hospital;
}

export async function readHospitals() {
  const client = await connect();
  const [hospitals, users, roles] = await Promise.all([
    client.query(`select * from hospitals order by ordinal, created_at`),
    client.query(`select * from hospital_users order by ordinal, created_at`),
    client.query(`select * from hospital_roles order by ordinal`)
  ]);
  const usersByHospital = new Map();
  for (const row of users.rows) usersByHospital.set(row.hospital_id, [...(usersByHospital.get(row.hospital_id) || []), toUser(row)]);
  const rolesByHospital = new Map();
  for (const row of roles.rows) rolesByHospital.set(row.hospital_id, [...(rolesByHospital.get(row.hospital_id) || []), toRole(row)]);
  return hospitals.rows.map((row) => toHospital(row, usersByHospital.get(row.id) || [], rolesByHospital.get(row.id) || []));
}

function profileOf(user) {
  return Object.fromEntries(profileFields.filter((field) => user[field] !== undefined).map((field) => [field, user[field]]));
}

export async function saveHospitals(hospitals) {
  const client = await (await connect()).connect();
  try {
    await client.query("begin");
    await client.query(`delete from hospitals where not (id = any ($1::uuid[]))`, [hospitals.map((hospital) => hospital.id)]);
    for (const [index, hospital] of hospitals.entries()) {
      await client.query(
        `insert into hospitals (id, ordinal, name, code, location, status, logo_data_url, logo_path, repository, details, roles_seeded, registration_status, accreditation, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13::jsonb, $14, $15)
         on conflict (id) do update set ordinal = excluded.ordinal, name = excluded.name, code = excluded.code, location = excluded.location,
           status = excluded.status, logo_data_url = excluded.logo_data_url, logo_path = excluded.logo_path, repository = excluded.repository,
           details = excluded.details, roles_seeded = excluded.roles_seeded, registration_status = excluded.registration_status,
           accreditation = excluded.accreditation, updated_at = excluded.updated_at`,
        [
          hospital.id, index, hospital.name, hospital.code, hospital.location || "", hospital.status || "active",
          hospital.logoDataUrl || "", hospital.logoPath || "", JSON.stringify(hospital.repository || {}), JSON.stringify(hospital.details || {}),
          Array.isArray(hospital.roles), hospital.registrationStatus || "", JSON.stringify(hospital.accreditation || {}), isoDate(hospital.createdAt), isoDate(hospital.updatedAt)
        ]
      );

      const users = Array.isArray(hospital.users) ? hospital.users : [];
      await client.query(`delete from hospital_users where hospital_id = $1 and not (id = any ($2::uuid[]))`, [hospital.id, users.map((user) => user.id)]);
      for (const [userIndex, user] of users.entries()) {
        await client.query(
          `insert into hospital_users (id, hospital_id, ordinal, name, email, role, active, profile, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
           on conflict (id) do update set ordinal = excluded.ordinal, name = excluded.name, email = excluded.email,
             role = excluded.role, active = excluded.active, profile = excluded.profile`,
          [user.id, hospital.id, userIndex, user.name, user.email, user.role, user.active !== false, JSON.stringify(profileOf(user)), isoDate(user.createdAt)]
        );
      }

      const roles = Array.isArray(hospital.roles) ? hospital.roles : [];
      await client.query(`delete from hospital_roles where hospital_id = $1 and not (id = any ($2::uuid[]))`, [hospital.id, roles.map((role) => role.id)]);
      for (const [roleIndex, role] of roles.entries()) {
        await client.query(
          `insert into hospital_roles (id, hospital_id, ordinal, name, reports, document_access, permissions, default_access_applied)
           values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
           on conflict (id) do update set ordinal = excluded.ordinal, name = excluded.name, reports = excluded.reports,
             document_access = excluded.document_access, permissions = excluded.permissions, default_access_applied = excluded.default_access_applied`,
          [role.id, hospital.id, roleIndex, role.name, JSON.stringify(role.reports || []), JSON.stringify(role.documentAccess || {}), JSON.stringify(role.permissions || []), Boolean(role.defaultAccessApplied)]
        );
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function addHospital(hospital) {
  const client = await (await connect()).connect();
  try {
    await client.query("begin");
    const { rows: [position] } = await client.query(`select coalesce(max(ordinal), -1) + 1 as ordinal from hospitals`);
    await client.query(
      `insert into hospitals (id, ordinal, name, code, location, status, logo_data_url, logo_path, repository, details, roles_seeded, registration_status, accreditation, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13::jsonb, $14, $15)`,
      [hospital.id, position.ordinal, hospital.name, hospital.code, hospital.location || "", hospital.status || "pending", hospital.logoDataUrl || "", hospital.logoPath || "", JSON.stringify(hospital.repository || {}), JSON.stringify(hospital.details || {}), Array.isArray(hospital.roles), hospital.registrationStatus || "", JSON.stringify(hospital.accreditation || {}), isoDate(hospital.createdAt), isoDate(hospital.updatedAt)]
    );
    for (const [index, user] of (hospital.users || []).entries()) {
      await client.query(
        `insert into hospital_users (id, hospital_id, ordinal, name, email, role, active, profile, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [user.id, hospital.id, index, user.name, user.email, user.role, user.active !== false, JSON.stringify(profileOf(user)), isoDate(user.createdAt)]
      );
    }
    await client.query("commit");
    return hospital;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveHospital(hospital) {
  const client = await connect();
  const result = await client.query(
    `update hospitals set name = $2, code = $3, location = $4, status = $5, logo_data_url = $6, logo_path = $7,
       repository = $8::jsonb, details = $9::jsonb, registration_status = $10, accreditation = $11::jsonb, updated_at = $12 where id = $1`,
    [hospital.id, hospital.name, hospital.code, hospital.location || "", hospital.status || "active", hospital.logoDataUrl || "", hospital.logoPath || "", JSON.stringify(hospital.repository || {}), JSON.stringify(hospital.details || {}), hospital.registrationStatus || "", JSON.stringify(hospital.accreditation || {}), isoDate(hospital.updatedAt)]
  );
  return result.rowCount ? hospital : null;
}

export async function saveHospitalUser(hospitalId, user) { const client = await connect(); await client.query(`insert into hospital_users (id, hospital_id, ordinal, name, email, role, active, profile, created_at) values ($1,$2,coalesce((select max(ordinal)+1 from hospital_users where hospital_id=$2),0),$3,$4,$5,$6,$7::jsonb,$8) on conflict (id) do update set name=excluded.name,email=excluded.email,role=excluded.role,active=excluded.active,profile=excluded.profile`, [user.id, hospitalId, user.name, user.email, user.role, user.active !== false, JSON.stringify(profileOf(user)), isoDate(user.createdAt)]); return user; }
export async function deleteHospitalUserRecord(hospitalId, userId) { const client = await connect(); return Boolean((await client.query(`delete from hospital_users where hospital_id=$1 and id=$2`, [hospitalId, userId])).rowCount); }
export async function saveHospitalRole(hospitalId, role) { const client = await connect(); await client.query(`insert into hospital_roles (id,hospital_id,ordinal,name,reports,document_access,permissions,default_access_applied) values ($1,$2,coalesce((select max(ordinal)+1 from hospital_roles where hospital_id=$2),0),$3,$4::jsonb,$5::jsonb,$6::jsonb,$7) on conflict (id) do update set name=excluded.name,reports=excluded.reports,document_access=excluded.document_access,permissions=excluded.permissions,default_access_applied=excluded.default_access_applied`, [role.id,hospitalId,role.name,JSON.stringify(role.reports || []),JSON.stringify(role.documentAccess || {}),JSON.stringify(role.permissions || []),Boolean(role.defaultAccessApplied)]); return role; }
export async function deleteHospitalRoleRecord(hospitalId, roleId) { const client = await connect(); return Boolean((await client.query(`delete from hospital_roles where hospital_id=$1 and id=$2`, [hospitalId, roleId])).rowCount); }
export async function deleteHospitalRecord(hospitalId) { const client = await connect(); return Boolean((await client.query(`delete from hospitals where id=$1`, [hospitalId])).rowCount); }

export async function readDocumentMatches() {
  const client = await connect();
  const { rows } = await client.query(`select department, document from document_matches order by department_ordinal, ordinal`);
  if (!rows.length) return null;
  const departments = {};
  for (const row of rows) (departments[row.department] ||= []).push(row.document);
  return departments;
}

export async function saveDocumentMatches(departments) {
  const client = await (await connect()).connect();
  try {
    await client.query("begin");
    await client.query(`delete from document_matches`);
    for (const [departmentIndex, [department, documents]] of Object.entries(departments).entries()) {
      for (const [index, document] of documents.entries()) {
        await client.query(
          `insert into document_matches (department, department_ordinal, ordinal, document) values ($1, $2, $3, $4::jsonb)`,
          [department, departmentIndex, index, JSON.stringify(document)]
        );
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function readDocumentAudit() {
  const client = await connect();
  const { rows } = await client.query(`select entry from document_audit order by seq desc`);
  return rows.map((row) => row.entry);
}

export async function saveDocumentAudit(entries) {
  const client = await (await connect()).connect();
  try {
    await client.query("begin");
    await client.query(`delete from document_audit`);
    for (const entry of [...entries].reverse()) await client.query(`insert into document_audit (entry) values ($1::jsonb)`, [JSON.stringify(entry)]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function appendDocumentAudit(entry) {
  const client = await connect();
  await client.query(`insert into document_audit (entry) values ($1::jsonb)`, [JSON.stringify(entry)]);
  return entry;
}

export async function readDocumentStatus() {
  const client = await connect();
  const { rows } = await client.query(`select hospital_id, document_id, status, updated_at, updated_by, note from document_status`);
  const byHospital = {};
  for (const row of rows) {
    (byHospital[row.hospital_id] ||= {})[row.document_id] = { status: row.status, updatedAt: isoDate(row.updated_at), updatedBy: row.updated_by, note: row.note };
  }
  return byHospital;
}

export async function saveDocumentStatus(statusByHospital) {
  const client = await (await connect()).connect();
  try {
    await client.query("begin");
    await client.query(`delete from document_status`);
    for (const [hospitalId, documents] of Object.entries(statusByHospital)) {
      for (const [documentId, entry] of Object.entries(documents)) {
        await client.query(
          `insert into document_status (hospital_id, document_id, status, updated_at, updated_by, note) values ($1, $2, $3, $4, $5, $6)`,
          [hospitalId, documentId, entry.status, isoDate(entry.updatedAt), entry.updatedBy || "system", entry.note || ""]
        );
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveDocumentStatusRecord(hospitalId, documentId, entry) {
  const client = await connect();
  await client.query(
    `insert into document_status (hospital_id, document_id, status, updated_at, updated_by, note)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (hospital_id, document_id) do update set
       status = excluded.status,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by,
       note = excluded.note`,
    [hospitalId, documentId, entry.status, isoDate(entry.updatedAt), entry.updatedBy || "system", entry.note || ""]
  );
  return entry;
}

export async function readDocumentDrafts() {
  const client = await connect();
  const { rows } = await client.query(`select hospital_id, document_id, draft from document_drafts`);
  const byHospital = {};
  for (const row of rows) (byHospital[row.hospital_id] ||= {})[row.document_id] = row.draft;
  return byHospital;
}

export async function saveDocumentDrafts(draftsByHospital) {
  const client = await (await connect()).connect();
  try {
    await client.query("begin");
    await client.query(`delete from document_drafts`);
    for (const [hospitalId, documents] of Object.entries(draftsByHospital)) {
      for (const [documentId, draft] of Object.entries(documents)) {
        await client.query(`insert into document_drafts (hospital_id, document_id, draft) values ($1, $2, $3::jsonb)`, [hospitalId, documentId, JSON.stringify(draft)]);
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function readBookings() {
  const client = await connect();
  const { rows } = await client.query(`select booking from service_bookings order by ordinal, (booking->>'createdAt')`);
  return rows.map((row) => row.booking);
}

export async function readBookingsByHospital(hospitalId) {
  const client = await connect();
  const { rows } = await client.query(`select booking from service_bookings where hospital_id = $1 order by created_at desc`, [hospitalId]);
  return rows.map((row) => row.booking);
}

export async function readBookingById(bookingId) {
  const client = await connect();
  const { rows } = await client.query(`select booking from service_bookings where id = $1`, [bookingId]);
  return rows[0]?.booking || null;
}

export async function readTemplateQuestionnaire(programme, templatePath) {
  const client = await connect();
  const { rows } = await client.query(`select q.id, q.question_key, q.label, q.question_type, q.required, q.options, q.prefill_field, q.ordinal from template_questionnaires t left join template_questions q on q.questionnaire_id = t.id where t.programme = $1 and t.template_path = $2 order by q.ordinal`, [programme, templatePath]);
  if (!rows.length || !rows[0].question_key) return null;
  return { programme, templatePath, questions: rows.map((row) => ({ id: row.question_key, label: row.label, type: row.question_type, required: row.required, options: row.options || [], prefillField: row.prefill_field || "" })) };
}

export async function readTemplateQuestionnaireSummaries(programme) {
  const client = await connect();
  const { rows } = await client.query(`select t.programme, t.template_path, count(q.id)::int as question_count, t.updated_at from template_questionnaires t left join template_questions q on q.questionnaire_id = t.id where ($1::text is null or t.programme = $1) group by t.id order by t.programme, t.template_path`, [programme || null]);
  return rows.map((row) => ({ programme: row.programme, templatePath: row.template_path, questionCount: row.question_count, updatedAt: row.updated_at?.toISOString?.() || row.updated_at }));
}

export async function saveTemplateQuestionnaire(programme, templatePath, questions) {
  const client = await (await connect()).connect();
  try {
    await client.query("begin");
    const { rows: [questionnaire] } = await client.query(`insert into template_questionnaires (id, programme, template_path) values ($1, $2, $3) on conflict (programme, template_path) do update set updated_at = now() returning id`, [randomUUID(), programme, templatePath]);
    await client.query(`delete from template_questions where questionnaire_id = $1`, [questionnaire.id]);
    for (const [ordinal, question] of questions.entries()) await client.query(`insert into template_questions (id, questionnaire_id, question_key, label, question_type, required, options, prefill_field, ordinal) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`, [randomUUID(), questionnaire.id, question.id, question.label, question.type, question.required !== false, JSON.stringify(question.options || []), question.prefillField || "", ordinal]);
    await client.query("commit");
    return { programme, templatePath, questions };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function saveDocumentAnswers(hospitalId, documentId, answers, questionnaire) {
  const client = await connect();
  for (const question of questionnaire.questions || []) await client.query(`insert into hospital_document_answers (hospital_id, document_id, question_id, answer) select $1, $2, id, $3 from template_questions where questionnaire_id = (select id from template_questionnaires where programme = $4 and template_path = $5) and question_key = $6 on conflict (hospital_id, document_id, question_id) do update set answer = excluded.answer, updated_at = now()`, [hospitalId, documentId, answers[question.id] || "", questionnaire.programme, questionnaire.templatePath, question.id]);
}

export async function readDocumentAnswers(hospitalId) {
  const client = await connect();
  const { rows } = await client.query(`select a.document_id, q.question_key, a.answer, a.updated_at from hospital_document_answers a join template_questions q on q.id = a.question_id where a.hospital_id = $1 order by a.document_id, a.updated_at`, [hospitalId]);
  const result = {};
  for (const row of rows) {
    const entry = result[row.document_id] ||= { answers: {}, updatedAt: null };
    entry.answers[row.question_key] = row.answer;
    entry.updatedAt = row.updated_at?.toISOString?.() || row.updated_at;
  }
  return result;
}

function bookingColumns(booking) {
  return [booking.category || "", booking.serviceId || "", booking.serviceName || "", booking.mode || "virtual", booking.preferredDate || null, booking.status || "requested", booking.notes || "", isoDate(booking.createdAt), isoDate(booking.updatedAt)];
}

export async function addBooking(booking) {
  const client = await connect();
  await client.query(
    `insert into service_bookings (id, hospital_id, ordinal, booking, category, service_id, service_name, mode, preferred_date, status, notes, created_at, updated_at)
     values ($1, $2, coalesce((select max(ordinal) + 1 from service_bookings where hospital_id = $2), 0), $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [booking.id, booking.hospitalId, JSON.stringify(booking), ...bookingColumns(booking)]
  );
  return booking;
}

export async function updateBooking(booking) {
  const client = await connect();
  const result = await client.query(
    `update service_bookings set booking = $2::jsonb, category = $3, service_id = $4, service_name = $5, mode = $6, preferred_date = $7, status = $8, notes = $9, updated_at = $10 where id = $1`,
    [booking.id, JSON.stringify(booking), ...bookingColumns(booking).slice(0, 7), bookingColumns(booking)[8]]
  );
  return result.rowCount ? booking : null;
}

export async function saveBookings(bookings) {
  const client = await (await connect()).connect();
  try {
    await client.query("begin");
    await client.query(`delete from service_bookings`);
    for (const [index, booking] of bookings.entries()) {
      await client.query(`insert into service_bookings (id, hospital_id, ordinal, booking) values ($1, $2, $3, $4::jsonb)`, [booking.id, booking.hospitalId, index, JSON.stringify(booking)]);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function close() {
  if (pool) await pool.end();
  pool = null;
  ready = null;
}
