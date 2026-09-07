// File-backed data store: keeps the original output/*.json behaviour used before PostgreSQL support.
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const dataDirectory = fileURLToPath(new URL("../../../output", import.meta.url));
const hospitalsPath = path.join(dataDirectory, "hospitals.json");
const documentMatchesPath = path.join(dataDirectory, "documentMatches.json");
const documentAuditPath = path.join(dataDirectory, "documentAudit.json");
const documentStatusPath = path.join(dataDirectory, "documentStatus.json");
const documentDraftsPath = path.join(dataDirectory, "documentDrafts.json");
const bookingsPath = path.join(dataDirectory, "bookings.json");

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

export async function saveDocumentAudit(entries) {
  await writeJson(documentAuditPath, entries);
}

export async function readDocumentStatus() {
  return readJson(documentStatusPath, {});
}

export async function saveDocumentStatus(statusByHospital) {
  await writeJson(documentStatusPath, statusByHospital);
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

export async function saveBookings(bookings) {
  await writeJson(bookingsPath, bookings);
}

export async function close() {}
