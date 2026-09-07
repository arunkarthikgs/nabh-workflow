// Structured Q&A -> personalised draft document generation, plus the review/approve state machine
// layered on top of documentStatusService's readiness pipeline.
import { readDocumentDrafts, saveDocumentDrafts } from "./dataStore.js";
import { getHospitalDocumentStatus, isValidDocumentStatus, setHospitalDocumentStatus } from "./documentStatusService.js";

// Which readiness statuses a guided action may move a document from -> to.
const ACTION_TRANSITIONS = {
  "submit-for-review": { from: ["draft_generated", "information_required"], to: "under_review" },
  "approve": { from: ["under_review"], to: "approved" },
  "request-changes": { from: ["under_review"], to: "draft_generated" },
  "mark-implemented": { from: ["approved"], to: "implemented" },
  "mark-evidence-available": { from: ["implemented"], to: "evidence_available" }
};

export async function generateDocumentDraft(hospital, documentId, documentName, answers) {
  if (!documentId) throw new Error("documentId is required.");
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

export async function getDocumentDraft(hospitalId, documentId) {
  const all = await readDocumentDrafts();
  return all[hospitalId]?.[documentId] || null;
}

export async function performDocumentAction(hospitalId, documentId, action, updatedBy, note) {
  const transition = ACTION_TRANSITIONS[action];
  if (!transition) throw new Error(`Unknown action: ${action}`);
  const hospitalStatus = await getHospitalDocumentStatus(hospitalId);
  const current = hospitalStatus[documentId]?.status || "not_started";
  if (!transition.from.includes(current)) throw new Error(`Cannot ${action.replace(/-/g, " ")} from status "${current}".`);
  if (!isValidDocumentStatus(transition.to)) throw new Error("Invalid target status.");
  return setHospitalDocumentStatus(hospitalId, documentId, transition.to, updatedBy, note);
}
