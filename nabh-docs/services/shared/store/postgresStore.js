// PostgreSQL-backed data store. Mirrors the JSON store contract so both drivers stay interchangeable.
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { configValue } from "../config.js";

const outputDirectory = fileURLToPath(new URL("../../../output", import.meta.url));
const profileFields = ["dateOfBirth", "gender", "mobileNumber", "address", "employeeId", "department", "dateOfJoining", "employmentType"];

let pool = null;
let ready = null;
let initializing = false;

function sslOption() {
  const mode = configValue("POSTGRES_SSL", "").toLowerCase();
  if (!mode || /^(0|false|no|off|disable)$/.test(mode)) return undefined;
  if (mode === "no-verify") return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

function poolConfig() {
  const connectionString = configValue("POSTGRES_URL") || configValue("DATABASE_URL");
  const ssl = sslOption();
  if (connectionString) return { connectionString, ssl };
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
  `create index if not exists hospital_users_hospital_idx on hospital_users (hospital_id)`,
  `create index if not exists hospital_roles_hospital_idx on hospital_roles (hospital_id)`
];

async function createPool() {
  let pg;
  try { ({ default: pg } = await import("pg")); }
  catch { throw new Error("DATA_STORE=postgres requires the 'pg' package. Run: npm install pg"); }
  return new pg.Pool({ ...poolConfig(), max: Number(configValue("POSTGRES_POOL_MAX", "10")) });
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
}

export async function initialize() {
  await connect();
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
        `insert into hospitals (id, ordinal, name, code, location, status, logo_data_url, logo_path, repository, details, roles_seeded, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13)
         on conflict (id) do update set ordinal = excluded.ordinal, name = excluded.name, code = excluded.code, location = excluded.location,
           status = excluded.status, logo_data_url = excluded.logo_data_url, logo_path = excluded.logo_path, repository = excluded.repository,
           details = excluded.details, roles_seeded = excluded.roles_seeded, updated_at = excluded.updated_at`,
        [
          hospital.id, index, hospital.name, hospital.code, hospital.location || "", hospital.status || "active",
          hospital.logoDataUrl || "", hospital.logoPath || "", JSON.stringify(hospital.repository || {}), JSON.stringify(hospital.details || {}),
          Array.isArray(hospital.roles), isoDate(hospital.createdAt), isoDate(hospital.updatedAt)
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

export async function close() {
  if (pool) await pool.end();
  pool = null;
  ready = null;
}
