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

export async function readHospitalById(idOrCode, options) {
  return (await store()).readHospitalById(idOrCode, options);
}

export async function hospitalCodeExists(code, excludeId) {
  return (await store()).hospitalCodeExists(code, excludeId);
}

export async function findHospitalUserForLogin(identifier) {
  return (await store()).findHospitalUserForLogin(identifier);
}

export async function readHospitalSummaries() { return (await store()).readHospitalSummaries(); }
export async function readHospitalRegistry() { return (await store()).readHospitalRegistry(); }
export async function listRegistryMetadata() { return (await store()).listRegistryMetadata(); }
export async function listRoleMaster() { return (await store()).listRoleMaster(); }
export async function listHospitalDocumentCatalog(hospitalId) { return (await store()).listHospitalDocumentCatalog(hospitalId); }
export async function saveHospitalDocumentCatalog(hospitalId, programme, entries) { return (await store()).saveHospitalDocumentCatalog(hospitalId, programme, entries); }
export async function hospitalDocumentCatalogExists(hospitalId) { return (await store()).hospitalDocumentCatalogExists(hospitalId); }
export async function listTemplateCatalog(programme) { return (await store()).listTemplateCatalog(programme); }
export async function saveTemplateCatalog(programme, entries) { return (await store()).saveTemplateCatalog(programme, entries); }
export async function getDocumentVersionCache(scope, hospitalId, programme, documentKey) { return (await store()).getDocumentVersionCache(scope, hospitalId, programme, documentKey); }
export async function saveDocumentVersionCache(scope, hospitalId, programme, documentKey, manifest) { return (await store()).saveDocumentVersionCache(scope, hospitalId, programme, documentKey, manifest); }

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

export async function readDocumentAuditByHospital(hospitalId, limit, offset) { return (await store()).readDocumentAuditByHospital(hospitalId, limit, offset); }

export async function saveDocumentAudit(entries) {
  return (await store()).saveDocumentAudit(entries);
}

export async function appendDocumentAudit(entry) {
  return (await store()).appendDocumentAudit(entry);
}

export async function readDocumentStatus() {
  return (await store()).readDocumentStatus();
}

export async function readDocumentStatusByHospital(hospitalId) {
  return (await store()).readDocumentStatusByHospital(hospitalId);
}

export async function saveDocumentStatus(statusByHospital) {
  return (await store()).saveDocumentStatus(statusByHospital);
}

export async function saveDocumentStatusRecord(hospitalId, documentId, entry) {
  return (await store()).saveDocumentStatusRecord(hospitalId, documentId, entry);
}

export async function readEvidenceByDocument(hospitalId, documentId) {
  return (await store()).readEvidenceByDocument(hospitalId, documentId);
}

export async function readEvidenceById(hospitalId, evidenceId) {
  return (await store()).readEvidenceById(hospitalId, evidenceId);
}

export async function addEvidence(evidence) {
  return (await store()).addEvidence(evidence);
}

export async function deleteEvidence(hospitalId, evidenceId) {
  return (await store()).deleteEvidence(hospitalId, evidenceId);
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

export async function readBookingsByHospital(hospitalId) {
  return (await store()).readBookingsByHospital(hospitalId);
}

export async function readBookingById(bookingId) {
  return (await store()).readBookingById(bookingId);
}

export async function addBooking(booking) {
  return (await store()).addBooking(booking);
}

export async function updateBooking(booking) {
  return (await store()).updateBooking(booking);
}

export async function readTemplateQuestionnaire(programme, templatePath) {
  return (await store()).readTemplateQuestionnaire(programme, templatePath);
}

export async function readTemplateQuestionnaireSummaries(programme) {
  return (await store()).readTemplateQuestionnaireSummaries(programme);
}

export async function saveTemplateQuestionnaire(programme, templatePath, questions) {
  return (await store()).saveTemplateQuestionnaire(programme, templatePath, questions);
}

export async function saveDocumentAnswers(hospitalId, documentId, answers, questionnaire) {
  return (await store()).saveDocumentAnswers(hospitalId, documentId, answers, questionnaire);
}

export async function readDocumentAnswers(hospitalId) {
  return (await store()).readDocumentAnswers(hospitalId);
}

export async function createRegistrationToken(hospitalId, email, rawToken, expiresAt) {
  return (await store()).createRegistrationToken(hospitalId, email, rawToken, expiresAt);
}

export async function findRegistrationToken(rawToken) {
  return (await store()).findRegistrationToken(rawToken);
}

export async function consumeRegistrationToken(tokenId) {
  return (await store()).consumeRegistrationToken(tokenId);
}

export async function appendUserAuditEvent(event) {
  return (await store()).appendUserAuditEvent(event);
}

export async function createAuthSession(session) { return (await store()).createAuthSession(session); }
export async function readAuthSession(tokenHash) { return (await store()).readAuthSession(tokenHash); }
export async function revokeAuthSession(tokenHash) { return (await store()).revokeAuthSession(tokenHash); }

export async function saveBookings(bookings) {
  return (await store()).saveBookings(bookings);
}

export async function closeDataStore() {
  if (!storePromise) return;
  const active = await storePromise;
  storePromise = null;
  await active.close();
}
