// Per-hospital NABH readiness pipeline: tracks each document's progress from
// "not started" through "evidence available", independent of the global master list.
import { readDocumentStatus, readDocumentStatusByHospital, saveDocumentStatusRecord } from "./dataStore.js";

export const DOCUMENT_STATUSES = [
  "not_started",
  "information_required",
  "draft_generated",
  "under_review",
  "approved",
  "implemented",
  "evidence_available"
];

export const DOCUMENT_STATUS_LABELS = {
  not_started: "Not Started",
  information_required: "Information Required",
  draft_generated: "Draft Generated",
  under_review: "Under Review",
  approved: "Approved",
  implemented: "Implemented",
  evidence_available: "Evidence Available"
};

const STATUS_SET = new Set(DOCUMENT_STATUSES);

export const DOCUMENT_STATUS_TRANSITIONS = {
  not_started: ["information_required", "draft_generated"],
  information_required: ["draft_generated"],
  draft_generated: ["under_review"],
  under_review: ["draft_generated", "approved"],
  approved: ["implemented"],
  implemented: ["evidence_available"],
  evidence_available: []
};

export function isValidDocumentStatus(value) {
  return STATUS_SET.has(value);
}

export function getDocumentStatusLabel(status) {
  return DOCUMENT_STATUS_LABELS[status] || status || "Not Started";
}

export function getAllowedDocumentStatusTransitions(currentStatus) {
  const normalizedStatus = isValidDocumentStatus(currentStatus) ? currentStatus : "not_started";
  return [normalizedStatus, ...DOCUMENT_STATUS_TRANSITIONS[normalizedStatus]];
}

export function canTransitionDocumentStatus(currentStatus, nextStatus) {
  if (!isValidDocumentStatus(nextStatus)) return false;
  const normalizedStatus = isValidDocumentStatus(currentStatus) ? currentStatus : "not_started";
  return normalizedStatus === nextStatus || DOCUMENT_STATUS_TRANSITIONS[normalizedStatus].includes(nextStatus);
}

export async function getHospitalDocumentStatus(hospitalId) {
  const all = await readDocumentStatusByHospital(hospitalId);
  return all[hospitalId] || {};
}

export async function setHospitalDocumentStatus(hospitalId, documentId, status, updatedBy, note, currentStatus, allowControlledReopen = false) {
  if (!documentId || typeof documentId !== "string") throw new Error("documentId is required.");
  if (!isValidDocumentStatus(status)) throw new Error(`Choose a valid document status. Available statuses: ${DOCUMENT_STATUSES.map(getDocumentStatusLabel).join(", ")}.`);
  const isControlledReopen = allowControlledReopen && currentStatus === "approved" && status === "under_review";
  if (currentStatus !== undefined && !isControlledReopen && !canTransitionDocumentStatus(currentStatus, status)) {
    const nextStatuses = DOCUMENT_STATUS_TRANSITIONS[currentStatus] || [];
    const nextStepMessage = nextStatuses.length
      ? `The next available step${nextStatuses.length === 1 ? " is" : "s are"} ${nextStatuses.map(getDocumentStatusLabel).join(" or ")}.`
      : "This document has reached the end of its current workflow.";
    throw new Error(`This document is currently "${getDocumentStatusLabel(currentStatus)}" and cannot be moved directly to "${getDocumentStatusLabel(status)}". ${nextStepMessage}`);
  }
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
