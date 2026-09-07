// Selects the persistence driver from config.properties (DATA_STORE=json|postgres).
import * as jsonStore from "./store/jsonStore.js";
import { configValue } from "./config.js";

const driver = configValue("DATA_STORE", "json").toLowerCase() === "postgres" ? "postgres" : "json";
let storePromise = null;

async function createStore() {
  if (driver === "json") return jsonStore;
  const postgresStore = await import("./store/postgresStore.js");
  await postgresStore.initialize();
  return postgresStore;
}

function store() {
  if (!storePromise) storePromise = createStore().catch((error) => { storePromise = null; throw error; });
  return storePromise;
}

export function dataStoreDriver() {
  return driver;
}

export async function dataStoreInfo() {
  return (await store()).info();
}

export async function readHospitals() {
  return (await store()).readHospitals();
}

export async function saveHospitals(hospitals) {
  return (await store()).saveHospitals(hospitals);
}

export async function addHospital(hospital) {
  return (await store()).addHospital(hospital);
}

export async function saveHospital(hospital) {
  return (await store()).saveHospital(hospital);
}

export async function saveHospitalUser(hospitalId, user) { return (await store()).saveHospitalUser(hospitalId, user); }
export async function deleteHospitalUserRecord(hospitalId, userId) { return (await store()).deleteHospitalUserRecord(hospitalId, userId); }
export async function saveHospitalRole(hospitalId, role) { return (await store()).saveHospitalRole(hospitalId, role); }
export async function deleteHospitalRoleRecord(hospitalId, roleId) { return (await store()).deleteHospitalRoleRecord(hospitalId, roleId); }
export async function deleteHospitalRecord(hospitalId) { return (await store()).deleteHospitalRecord(hospitalId); }

export async function readDocumentMatches() {
  return (await store()).readDocumentMatches();
}

export async function saveDocumentMatches(departments) {
  return (await store()).saveDocumentMatches(departments);
}

export async function readDocumentAudit() {
  return (await store()).readDocumentAudit();
}

export async function saveDocumentAudit(entries) {
  return (await store()).saveDocumentAudit(entries);
}

export async function readDocumentStatus() {
  return (await store()).readDocumentStatus();
}

export async function saveDocumentStatus(statusByHospital) {
  return (await store()).saveDocumentStatus(statusByHospital);
}

export async function readDocumentDrafts() {
  return (await store()).readDocumentDrafts();
}

export async function saveDocumentDrafts(draftsByHospital) {
  return (await store()).saveDocumentDrafts(draftsByHospital);
}

export async function readBookings() {
  return (await store()).readBookings();
}

export async function saveBookings(bookings) {
  return (await store()).saveBookings(bookings);
}

export async function closeDataStore() {
  if (!storePromise) return;
  const active = await storePromise;
  storePromise = null;
  await active.close();
}
