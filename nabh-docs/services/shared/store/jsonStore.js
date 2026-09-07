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
