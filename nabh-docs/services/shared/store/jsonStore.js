// File-backed data store: keeps the original output/*.json behaviour used before PostgreSQL support.
import { mkdir, readFile, writeFile } from "fs/promises";
import { createHash, randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const dataDirectory = fileURLToPath(new URL("../../../output", import.meta.url));
const hospitalsPath = path.join(dataDirectory, "hospitals.json");
const documentMatchesPath = path.join(dataDirectory, "documentMatches.json");
const documentAuditPath = path.join(dataDirectory, "documentAudit.json");
const documentStatusPath = path.join(dataDirectory, "documentStatus.json");
const documentDraftsPath = path.join(dataDirectory, "documentDrafts.json");
const bookingsPath = path.join(dataDirectory, "bookings.json");
const evidencePath = path.join(dataDirectory, "evidence.json");

async function readJson(filePath, fallback) {
  try { return JSON.parse(await readFile(filePath, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

export async function initialize() {}

export function info() {
  return { driver: "json", hospitalsPath, documentMatchesPath, documentAuditPath };
}

export async function readHospitals() {
  return readJson(hospitalsPath, []);
}

export async function readHospitalRegistry() {
  return (await readHospitals()).map(({ users, roles, ...hospital }) => hospital);
}

export async function readHospitalSummaries() {
  const hospitals = await readHospitals();
  return { total: hospitals.length, pending: hospitals.filter((hospital) => hospital.status === "pending").length, active: hospitals.filter((hospital) => hospital.status === "active").length, users: hospitals.reduce((total, hospital) => total + (hospital.users || []).length, 0) };
}

export async function saveHospitals(hospitals) {
  await writeJson(hospitalsPath, hospitals);
}

export async function addHospital(hospital) {
  const hospitals = await readHospitals();
  hospitals.push(hospital);
  await saveHospitals(hospitals);
  return hospital;
}

export async function saveHospital(hospital) {
  const hospitals = await readHospitals();
  const index = hospitals.findIndex((item) => item.id === hospital.id);
  if (index === -1) return null;
  hospitals[index] = hospital;
  await saveHospitals(hospitals);
  return hospital;
}

async function mutateHospital(hospitalId, mutate) { const hospitals = await readHospitals(); const hospital = hospitals.find((item) => item.id === hospitalId); if (!hospital) return null; const result = mutate(hospital); await saveHospitals(hospitals); return result; }
export async function saveHospitalUser(hospitalId, user) { return mutateHospital(hospitalId, (hospital) => { const index = (hospital.users || []).findIndex((item) => item.id === user.id); if (index === -1) hospital.users.push(user); else hospital.users[index] = user; hospital.updatedAt = new Date().toISOString(); return user; }); }
export async function deleteHospitalUserRecord(hospitalId, userId) { return mutateHospital(hospitalId, (hospital) => { const before = hospital.users.length; hospital.users = hospital.users.filter((user) => user.id !== userId); return hospital.users.length !== before; }); }
export async function saveHospitalRole(hospitalId, role) { return mutateHospital(hospitalId, (hospital) => { hospital.roles ||= []; const index = hospital.roles.findIndex((item) => item.id === role.id); if (index === -1) hospital.roles.push(role); else hospital.roles[index] = role; return role; }); }
export async function deleteHospitalRoleRecord(hospitalId, roleId) { return mutateHospital(hospitalId, (hospital) => { const before = hospital.roles.length; hospital.roles = hospital.roles.filter((role) => role.id !== roleId); return hospital.roles.length !== before; }); }
export async function deleteHospitalRecord(hospitalId) { const hospitals = await readHospitals(); const remaining = hospitals.filter((hospital) => hospital.id !== hospitalId); if (remaining.length === hospitals.length) return false; await saveHospitals(remaining); return true; }

export async function readDocumentMatches() {
  return readJson(documentMatchesPath, null);
}

export async function saveDocumentMatches(departments) {
  await writeJson(documentMatchesPath, departments);
}

export async function readDocumentAudit() {
  return readJson(documentAuditPath, []);
}

export async function readDocumentAuditByHospital(hospitalId, limit, offset = 0) {
  const entries = (await readDocumentAudit()).filter((entry) => entry.hospitalId === hospitalId);
  const start = Math.max(Number(offset) || 0, 0);
  return Number(limit) > 0 ? entries.slice(start, start + Number(limit)) : entries.slice(start);
}

export async function saveDocumentAudit(entries) {
  await writeJson(documentAuditPath, entries);
}

export async function appendDocumentAudit(entry) {
  const entries = await readDocumentAudit();
  await writeJson(documentAuditPath, [entry, ...entries]);
  return entry;
}

export async function readDocumentStatus() {
  return readJson(documentStatusPath, {});
}

export async function readDocumentStatusByHospital(hospitalId) {
  const all = await readDocumentStatus();
  return { [hospitalId]: all[hospitalId] || {} };
}

export async function saveDocumentStatus(statusByHospital) {
  await writeJson(documentStatusPath, statusByHospital);
}

export async function saveDocumentStatusRecord(hospitalId, documentId, entry) {
  const statusByHospital = await readDocumentStatus();
  statusByHospital[hospitalId] = { ...(statusByHospital[hospitalId] || {}), [documentId]: entry };
  await writeJson(documentStatusPath, statusByHospital);
  return entry;
}

export async function readEvidenceByDocument(hospitalId, documentId) {
  return (await readJson(evidencePath, [])).filter((item) => item.hospitalId === hospitalId && item.documentId === documentId);
}

export async function readEvidenceById(hospitalId, evidenceId) {
  return (await readJson(evidencePath, [])).find((item) => item.hospitalId === hospitalId && item.id === evidenceId) || null;
}

export async function addEvidence(evidence) {
  const entries = await readJson(evidencePath, []);
  entries.unshift(evidence);
  await writeJson(evidencePath, entries);
  return evidence;
}

export async function deleteEvidence(hospitalId, evidenceId) {
  const entries = await readJson(evidencePath, []);
  const remaining = entries.filter((item) => !(item.hospitalId === hospitalId && item.id === evidenceId));
  if (remaining.length === entries.length) return false;
  await writeJson(evidencePath, remaining);
  return true;
}

export async function readDocumentDrafts() {
  return readJson(documentDraftsPath, {});
}

export async function saveDocumentDrafts(draftsByHospital) {
  await writeJson(documentDraftsPath, draftsByHospital);
}

export async function readBookings() {
  return readJson(bookingsPath, []);
}

export async function readBookingsByHospital(hospitalId) {
  return (await readBookings()).filter((booking) => booking.hospitalId === hospitalId);
}

export async function readBookingById(bookingId) {
  return (await readBookings()).find((booking) => booking.id === bookingId) || null;
}

export async function addBooking(booking) {
  const bookings = await readBookings();
  bookings.push(booking);
  await writeJson(bookingsPath, bookings);
  return booking;
}

export async function updateBooking(booking) {
  const bookings = await readBookings();
  const index = bookings.findIndex((item) => item.id === booking.id);
  if (index === -1) return null;
  bookings[index] = booking;
  await writeJson(bookingsPath, bookings);
  return booking;
}

const templateQuestionnairesPath = path.join(dataDirectory, "templateQuestionnaires.json");
const documentAnswersPath = path.join(dataDirectory, "documentAnswers.json");
const authSessionsPath = path.join(dataDirectory, "authSessions.json");
const registrationTokensPath = path.join(dataDirectory, "registrationTokens.json");

export async function readTemplateQuestionnaire(programme, templatePath) {
  const all = await readJson(templateQuestionnairesPath, {});
  return all[programme]?.[templatePath] || null;
}

export async function readTemplateQuestionnaireSummaries(programme) {
  const all = await readJson(templateQuestionnairesPath, {});
  return Object.entries(all)
    .filter(([key]) => !programme || key === programme)
    .flatMap(([key, templates]) => Object.entries(templates || {}).map(([templatePath, questionnaire]) => ({ programme: key, templatePath, questionCount: questionnaire.questions?.length || 0, updatedAt: questionnaire.updatedAt || null })));
}

export async function saveTemplateQuestionnaire(programme, templatePath, questions) {
  const all = await readJson(templateQuestionnairesPath, {});
  all[programme] = { ...(all[programme] || {}), [templatePath]: { programme, templatePath, questions, updatedAt: new Date().toISOString() } };
  await writeJson(templateQuestionnairesPath, all);
  return all[programme][templatePath];
}

export async function saveDocumentAnswers(hospitalId, documentId, answers, questionnaire) {
  const all = await readJson(documentAnswersPath, {});
  const key = `${hospitalId}:${documentId}`;
  all[key] = { hospitalId, documentId, questionnaire, answers, updatedAt: new Date().toISOString() };
  await writeJson(documentAnswersPath, all);
  return all[key];
}

export async function readDocumentAnswers(hospitalId) {
  const all = await readJson(documentAnswersPath, {});
  return Object.values(all).filter((record) => record.hospitalId === hospitalId).reduce((result, record) => {
    result[record.documentId] = { answers: record.answers || {}, updatedAt: record.updatedAt || null };
    return result;
  }, {});
}

export async function createRegistrationToken(hospitalId, email, rawToken, expiresAt) { const tokens = await readJson(registrationTokensPath, []); tokens.forEach((item) => { if (item.hospitalId === hospitalId && item.email === email.toLowerCase() && !item.usedAt && !item.revokedAt) item.revokedAt = new Date().toISOString(); }); const token = { id: randomUUID(), hospitalId, email: email.toLowerCase(), tokenHash: createHash("sha256").update(rawToken).digest("hex"), expiresAt }; tokens.push(token); await writeJson(registrationTokensPath, tokens); return true; }
export async function findRegistrationToken(rawToken) { const tokens = await readJson(registrationTokensPath, []); const hash = createHash("sha256").update(rawToken).digest("hex"); const token = tokens.find((item) => item.tokenHash === hash && !item.usedAt && !item.revokedAt && new Date(item.expiresAt).getTime() > Date.now()); if (!token) return null; const hospitals = await readJson(hospitalsPath, []); const hospital = hospitals.find((item) => item.id === token.hospitalId); const user = hospital?.users?.find((item) => item.email?.toLowerCase() === token.email); return hospital && user ? { tokenId: token.id, hospitalId: hospital.id, hospital, user } : null; }
export async function consumeRegistrationToken(tokenId) { const tokens = await readJson(registrationTokensPath, []); const token = tokens.find((item) => item.id === tokenId && !item.usedAt && !item.revokedAt && new Date(item.expiresAt).getTime() > Date.now()); if (!token) return false; token.usedAt = new Date().toISOString(); await writeJson(registrationTokensPath, tokens); return true; }
export async function appendUserAuditEvent() { return null; }

export async function createAuthSession(session) { const sessions = await readJson(authSessionsPath, []); sessions.push(session); await writeJson(authSessionsPath, sessions); return session; }
export async function readAuthSession(tokenHash) { const sessions = await readJson(authSessionsPath, []); const session = sessions.find((item) => item.tokenHash === tokenHash && !item.revokedAt && new Date(item.expiresAt).getTime() > Date.now()); return session || null; }
export async function revokeAuthSession(tokenHash) { const sessions = await readJson(authSessionsPath, []); const session = sessions.find((item) => item.tokenHash === tokenHash && !item.revokedAt); if (!session) return false; session.revokedAt = new Date().toISOString(); await writeJson(authSessionsPath, sessions); return true; }

export async function saveBookings(bookings) {
  await writeJson(bookingsPath, bookings);
}

export async function close() {}
