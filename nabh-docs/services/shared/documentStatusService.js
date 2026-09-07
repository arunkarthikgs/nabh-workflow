// Per-hospital NABH readiness pipeline: tracks each document's progress from
// "not started" through "evidence available", independent of the global master list.
import { readDocumentStatus, saveDocumentStatusRecord } from "./dataStore.js";

export const DOCUMENT_STATUSES = [
  "not_started",
  "information_required",
  "draft_generated",
  "under_review",
  "approved",
  "implemented",
  "evidence_available"
];

const STATUS_SET = new Set(DOCUMENT_STATUSES);

export function isValidDocumentStatus(value) {
  return STATUS_SET.has(value);
}

export async function getHospitalDocumentStatus(hospitalId) {
  const all = await readDocumentStatus();
  return all[hospitalId] || {};
}

export async function setHospitalDocumentStatus(hospitalId, documentId, status, updatedBy, note) {
  if (!documentId || typeof documentId !== "string") throw new Error("documentId is required.");
  if (!isValidDocumentStatus(status)) throw new Error(`status must be one of: ${DOCUMENT_STATUSES.join(", ")}`);
  const entry = { status, updatedAt: new Date().toISOString(), updatedBy: typeof updatedBy === "string" && updatedBy.trim() ? updatedBy.trim() : "system", note: typeof note === "string" ? note.trim() : "" };
  await saveDocumentStatusRecord(hospitalId, documentId, entry);
  return entry;
}

export function summarizeDocumentStatus(documentIds, hospitalStatus) {
  const counts = Object.fromEntries(DOCUMENT_STATUSES.map((status) => [status, 0]));
  for (const documentId of documentIds) {
    const status = hospitalStatus[documentId]?.status;
    counts[isValidDocumentStatus(status) ? status : "not_started"]++;
  }
  return counts;
}
