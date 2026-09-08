import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { addEvidence, deleteEvidence, readEvidenceByDocument, readEvidenceById } from "./dataStore.js";
import { getHospitalDocumentStatus, setHospitalDocumentStatus } from "./documentStatusService.js";
import { deleteR2EvidenceFile, getR2EvidenceFile, r2TemplateStorageEnabled, saveR2EvidenceFile } from "./r2TemplateService.js";

const evidenceDirectory = fileURLToPath(new URL("../../output/evidence", import.meta.url));
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

function safeFileName(fileName) {
  const value = path.basename(String(fileName || "evidence")).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return value || "evidence";
}

function decodeEvidenceData(data, mimeType) {
  const value = String(data || "");
  const match = value.match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
  const contentType = String(match?.[1] || mimeType || "").toLowerCase();
  const encoded = match?.[2] || value;
  if (!ALLOWED_MIME_TYPES.has(contentType)) throw new Error("Unsupported evidence file type. Upload a PDF, image, CSV, text, spreadsheet, or Word file.");
  let buffer;
  try { buffer = Buffer.from(encoded.replace(/\s/g, ""), "base64"); }
  catch { throw new Error("Evidence file could not be read."); }
  if (!buffer.length) throw new Error("Evidence file cannot be empty.");
  if (buffer.length > MAX_EVIDENCE_BYTES) throw new Error("Evidence file must be 5 MB or smaller.");
  return { buffer, contentType };
}

function localFilePath(storageKey) {
  const resolved = path.resolve(evidenceDirectory, storageKey.replace(/^evidence\//, ""));
  if (!resolved.startsWith(`${path.resolve(evidenceDirectory)}${path.sep}`)) throw new Error("Invalid evidence storage path.");
  return resolved;
}

async function removeStoredEvidence(hospital, evidence) {
  if (evidence.storageType === "r2") {
    await deleteR2EvidenceFile(hospital.code, hospital.accreditation?.programme, evidence.storageKey);
    return;
  }
  try { await unlink(localFilePath(evidence.storageKey)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}

export async function listDocumentEvidence(hospitalId, documentId) {
  return readEvidenceByDocument(hospitalId, documentId);
}

export async function getEvidenceFile(hospital, evidenceId) {
  const evidence = await readEvidenceById(hospital.id, evidenceId);
  if (!evidence) return null;
  const buffer = evidence.storageType === "r2"
    ? await getR2EvidenceFile(hospital.code, hospital.accreditation?.programme, evidence.storageKey)
    : await readFile(localFilePath(evidence.storageKey));
  return { evidence, buffer };
}

export async function createEvidence(hospital, documentId, payload, uploadedBy, currentStatusOverride) {
  const currentStatus = currentStatusOverride || (await getHospitalDocumentStatus(hospital.id))[documentId]?.status || "not_started";
  if (!["implemented", "evidence_available"].includes(currentStatus)) {
    throw new Error(`Evidence can be uploaded only after the document is Implemented. The document is currently ${currentStatus.replace(/_/g, " ")}.`);
  }
  const { buffer, contentType } = decodeEvidenceData(payload?.data, payload?.mimeType);
  const evidenceId = randomUUID();
  const fileName = safeFileName(payload?.fileName);
  const storageKey = `evidence/${hospital.id}/${evidenceId}-${fileName}`;
  const evidence = {
    id: evidenceId,
    hospitalId: hospital.id,
    documentId,
    storageType: r2TemplateStorageEnabled() ? "r2" : "local",
    storageKey,
    fileName,
    mimeType: contentType,
    sizeBytes: buffer.length,
    evidenceType: String(payload?.evidenceType || "implementation evidence").trim().slice(0, 120),
    description: String(payload?.description || "").trim().slice(0, 2000),
    uploadedBy: String(uploadedBy || "system").trim().slice(0, 160) || "system",
    uploadedAt: new Date().toISOString(),
    reviewStatus: "submitted",
    reviewedBy: null,
    reviewedAt: null,
    metadata: { originalFileName: String(payload?.fileName || fileName).slice(0, 255) }
  };

  try {
    if (evidence.storageType === "r2") {
      await saveR2EvidenceFile(hospital.code, hospital.accreditation?.programme, storageKey, buffer, contentType);
    } else {
      const filePath = localFilePath(storageKey);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, buffer);
    }
    await addEvidence(evidence);
    const entry = await setHospitalDocumentStatus(hospital.id, documentId, "evidence_available", uploadedBy, `Evidence uploaded: ${fileName}`, currentStatus);
    return { evidence, entry, previousStatus: currentStatus };
  } catch (error) {
    await deleteEvidence(hospital.id, evidence.id).catch(() => {});
    await removeStoredEvidence(hospital, evidence).catch(() => {});
    throw error;
  }
}
