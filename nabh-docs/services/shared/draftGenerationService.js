// Structured Q&A -> personalised draft document generation, plus the review/approve state machine
// layered on top of documentStatusService's readiness pipeline.
import { readDocumentDrafts, saveDocumentAnswers, saveDocumentDrafts } from "./dataStore.js";
import { getHospitalDocumentStatus, isValidDocumentStatus, setHospitalDocumentStatus } from "./documentStatusService.js";
import { getDocumentQuestions, validateDocumentAnswers } from "./documentQuestionnaireService.js";

// Which readiness statuses a guided action may move a document from -> to.
export const ACTION_TRANSITIONS = {
  "submit-for-review": { from: ["draft_generated"], to: "under_review" },
  "approve": { from: ["under_review"], to: "approved" },
  "request-changes": { from: ["under_review"], to: "draft_generated" },
  "reopen-for-revision": { from: ["approved"], to: "under_review" },
  "mark-implemented": { from: ["approved"], to: "implemented" },
  "mark-evidence-available": { from: ["implemented"], to: "evidence_available" }
};

export async function generateDocumentDraft(hospital, documentId, documentName, answers) {
  if (!documentId) throw new Error("documentId is required.");
  const currentStatus = (await getHospitalDocumentStatus(hospital.id))[documentId]?.status || "not_started";
  if (["approved", "implemented", "evidence_available"].includes(currentStatus)) {
    throw new Error(`This document is ${currentStatus.replace(/_/g, " ")} and locked. Reopen it for revision before generating another draft.`);
  }
  const details = hospital.details || {};
  const address = [details.addressLine1, details.city, details.state, details.pinCode].filter(Boolean).join(", ");
  const lines = [
    documentName || documentId,
    `Prepared for: ${hospital.name}`,
    `Address: ${address || "Not provided"}`,
    `Ownership: ${details.ownershipType || "Not provided"}`,
    `Operational beds: ${details.operationalBeds || "Not provided"}`,
    "",
    "This draft was generated from the structured responses below and must be reviewed by the Quality Manager before approval.",
    ""
  ];
  for (const [question, answer] of Object.entries(answers || {})) lines.push(`Q: ${question}`, `A: ${answer || "Not answered"}`, "");
  const draft = { content: lines.join("\n"), answers: answers || {}, generatedAt: new Date().toISOString() };
  const all = await readDocumentDrafts();
  const hospitalDrafts = { ...(all[hospital.id] || {}), [documentId]: draft };
  await saveDocumentDrafts({ ...all, [hospital.id]: hospitalDrafts });
  await setHospitalDocumentStatus(hospital.id, documentId, "draft_generated", "AI Draft Generator");
  return draft;
}

export async function prepareDocumentDraft(hospital, documentId, documentName, answers, templatePath) {
  const questionnaire = await getDocumentQuestions(hospital, documentId, documentName, templatePath);
  return { questionnaire, answers: validateDocumentAnswers(questionnaire, answers) };
}

export async function getDocumentDraft(hospitalId, documentId) {
  const all = await readDocumentDrafts();
  return all[hospitalId]?.[documentId] || null;
}

export async function performDocumentAction(hospitalId, documentId, action, updatedBy, note, currentStatusOverride) {
  const transition = ACTION_TRANSITIONS[action];
  if (!transition) throw new Error(`Unknown action: ${action}`);
  const hospitalStatus = currentStatusOverride ? null : await getHospitalDocumentStatus(hospitalId);
  const current = currentStatusOverride || hospitalStatus[documentId]?.status || "not_started";
  if (!transition.from.includes(current)) throw new Error(`Cannot ${action.replace(/-/g, " ")} from status "${current}".`);
  if (["approve", "mark-implemented", "request-changes"].includes(action) && !String(updatedBy || "").trim()) throw new Error("Enter the user name before approving, implementing, or requesting changes for this document.");
  if (["approve", "mark-implemented", "request-changes"].includes(action) && !String(note || "").trim()) throw new Error("Enter notes for the audit log before approving, implementing, or requesting changes for this document.");
  if (action === "reopen-for-revision" && !String(note || "").trim()) throw new Error("Enter a reason before reopening an approved document for revision.");
  if (!isValidDocumentStatus(transition.to)) throw new Error("Invalid target status.");
  return setHospitalDocumentStatus(hospitalId, documentId, transition.to, updatedBy, note, current, action === "reopen-for-revision");
}
