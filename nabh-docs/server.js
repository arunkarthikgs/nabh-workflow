// Small viewer server: serves the parsed department -> document match data for the web UI.
// Run: node server.js
import express from "express";
import ExcelJS from "exceljs";
import { createHash } from "crypto";
import { execFile } from "child_process";
import { access, mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import { promisify } from "util";
import { fileURLToPath } from "url";
import path from "path";
import { addHospitalUser, approveHospitalOnboarding, completePasswordSetup, createHospital, createHospitalRole, deleteHospital, deleteHospitalRole, deleteHospitalUser, findUserBySetupToken, isProfileComplete, listHospitalRoles, listHospitals, missingProfileFields, registerHospital, resetHospitalUserPassword, setHospitalLogoPath, submitHospitalProfile, updateHospital, updateHospitalRole, updateHospitalUser, verifyHospitalAdminPassword } from "./services/shared/hospitalAdminService.js";
import { buildWelcomeEmail, sendEmail } from "./services/shared/emailService.js";
import { loadConfig } from "./services/shared/config.js";
import { dataStoreDriver, dataStoreInfo, readDocumentAudit, readDocumentMatches, saveDocumentAudit, saveDocumentMatches } from "./services/shared/dataStore.js";
import { createOnlyOfficeService } from "./services/shared/onlyOfficeService.js";
import { DOCUMENT_STATUSES, getHospitalDocumentStatus, setHospitalDocumentStatus } from "./services/shared/documentStatusService.js";
import { NABH_ACCREDITATION_PROGRAMMES, accreditationProgrammeSlug, getAccreditationState, hasAcceptedAccreditation, selectAccreditationProgramme } from "./services/shared/accreditationService.js";
import { NABH_WORKSPACE_CATEGORIES, classifyDocument } from "./services/shared/documentCategoryService.js";
import { performDocumentAction } from "./services/shared/draftGenerationService.js";
import { TRAINING_TOPICS, generateTrainingPack } from "./services/shared/trainingContentService.js";
import { CONSULTING_CATALOG, TRAINING_CATALOG, attachBookingRecording, createBooking, generateTrainingMaterial, listBookings, updateBookingStatus } from "./services/shared/servicesMarketplace.js";
import { getDepartmentBoost } from "./services/shared/departmentAliases.js";
import { similarity } from "./services/shared/textSimilarity.js";
import { customizeDocumentTemplate } from "./services/shared/documentCustomizer.js";
import { approveR2ClientDocumentVersion, approveR2TemplateDocumentVersion, getDocumentKey, getR2ClientDocumentStatuses, getR2ClientFile, getR2ClientRepositoryStatus, getR2ClientVersionFile, getR2ClientVersionManifests, getR2HospitalLogo, getR2ProgrammeTemplateFile, getR2TemplateFile, getR2TemplateVersionManifest, listR2ClientAuditEvents, listR2ClientFiles, listR2ProgrammeTemplateFiles, listR2TemplateAuditEvents, listR2TemplateFiles, provisionR2ClientRepository, r2TemplateStorageEnabled, r2TemplateStorageInfo, recordR2ClientAuditEvent, saveR2ClientDocumentStatuses, saveR2HospitalLogo } from "./services/shared/r2TemplateService.js";

const app = express();
const webBuildDir = fileURLToPath(new URL("./web/dist", import.meta.url));
const prototypeDir = fileURLToPath(new URL("./prototype", import.meta.url));
const logosDir = fileURLToPath(new URL("./logos", import.meta.url));
const aacPolicyPdfPath = fileURLToPath(new URL("./output/AAC_Policy_Presentation.pdf", import.meta.url));
const aacPolicyWordPath = fileURLToPath(new URL("./output/AAC_Policy_Modified.docx", import.meta.url));
const templateRoot = process.env.TEMPLATE_LIBRARY_DIR || "/Users/vkartsu/SFTPConfig/output_office_templates";
const masterListTemplateFile = "Master list of documents_TEMPLATE.xlsx";
const masterListTemplatePath = path.join(templateRoot, masterListTemplateFile);
const previewCacheRoot = path.join("/tmp", "nabh-template-previews");
const execFileAsync = promisify(execFile);
const repositorySyncJobs = new Map();

function usesPostgresDataStore() {
  return dataStoreDriver() === "postgres";
}

async function persistHospitalLogo(hospital) {
  if (!hospital?.logoDataUrl) return hospital;
  if (r2TemplateStorageEnabled()) await saveR2HospitalLogo(hospital.code, hospital.logoDataUrl);
  return setHospitalLogoPath(hospital.id, `/api/admin/hospitals/${encodeURIComponent(hospital.id)}/logo`);
}

async function backfillHospitalLogos(hospitals) {
  return Promise.all(hospitals.map((hospital) => hospital.logoDataUrl && !hospital.logoPath ? persistHospitalLogo(hospital) : hospital));
}

// Kicks off (or reuses) a background repository-provisioning job for a hospital, since copying
// programme templates into R2 can take minutes. Callers read progress via repositorySyncJobs.
function startRepositoryProvisioning(hospital, { syncNewTemplates = false } = {}) {
  const existingJob = repositorySyncJobs.get(hospital.id);
  if (existingJob?.status === "running") return existingJob;
  const job = { status: "running", hospitalCode: hospital.code, startedAt: new Date().toISOString(), copied: 0, skipped: 0 };
  repositorySyncJobs.set(hospital.id, job);
  provisionR2ClientRepository(hospital, { syncNewTemplates })
    .then((repository) => Object.assign(job, repository.provisioned === false
      ? { status: "failed", completedAt: new Date().toISOString(), error: repository.error || "No templates found.", ...repository }
      : { status: "complete", completedAt: new Date().toISOString(), ...repository }))
    .catch((error) => Object.assign(job, { status: "failed", completedAt: new Date().toISOString(), error: error.message }));
  return job;
}

loadConfig();
const onlyOffice = createOnlyOfficeService({
  readDocumentMatches,
  saveDocumentMatches,
  readDocumentAudit,
  saveDocumentAudit,
  storageDir: fileURLToPath(new URL("./output/controlled-documents", import.meta.url)),
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
  documentServerUrl: process.env.ONLYOFFICE_DOCUMENT_SERVER_URL,
  jwtSecret: process.env.ONLYOFFICE_JWT_SECRET
});

app.use(express.static(webBuildDir, { etag: false, lastModified: false, setHeaders: (response) => response.set("Cache-Control", "no-store") }));
app.use("/prototype", express.static(prototypeDir));
app.use("/logos", express.static(logosDir));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", async (_request, response) => {
  let store = { driver: dataStoreDriver(), ok: false };
  try { store = { ...await dataStoreInfo(), ok: true }; } catch (error) { store.error = error.message; }
  response.json({
    ok: true,
    store,
    r2: {
      enabled: process.env.R2_ENABLED?.toLowerCase() === "true",
      accountId: Boolean(process.env.R2_ACCOUNT_ID),
      accessKeyId: Boolean(process.env.R2_ACCESS_KEY_ID),
      secretAccessKey: Boolean(process.env.R2_SECRET_ACCESS_KEY),
      bucket: process.env.R2_BUCKET_NAME || null
    }
  });
});

app.get("/api/admin/hospitals", async (_request, response, next) => {
  try { response.json({ hospitals: await backfillHospitalLogos(await listHospitals()) }); } catch (error) { next(error); }
});

app.post("/api/admin/hospitals", async (request, response, next) => {
  try {
    const hospital = await persistHospitalLogo(await createHospital(request.body || {}));
    response.status(201).json({ hospital, repository: { mode: r2TemplateStorageEnabled() ? "r2" : "local", provisioned: false, pending: "accreditation" } });
  }
  catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/client-repository", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    response.json({ repository: await provisionR2ClientRepository(hospital) });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/client-repository/sync", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    if (!hasAcceptedAccreditation(hospital)) return response.status(400).json({ error: "Select and accept an NABH accreditation programme before syncing the document workspace.", reason: "accreditation_required" });
    response.status(202).json({ job: startRepositoryProvisioning(hospital, { syncNewTemplates: true }) });
  } catch (error) { next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/client-repository/status", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    const job = repositorySyncJobs.get(hospital.id);
    const repository = await getR2ClientRepositoryStatus(hospital.code, hospital.accreditation?.programme);
    response.json({ repository, job: job || null });
  } catch (error) { next(error); }
});

app.patch("/api/admin/hospitals/:hospitalId", async (request, response, next) => {
  try { const hospital = await updateHospital(request.params.hospitalId, request.body || {}); if (!hospital) return response.status(404).json({ error: "Hospital not found." }); response.json({ hospital: await persistHospitalLogo(hospital) }); }
  catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/approve-onboarding", async (request, response, next) => {
  try {
    const hospital = await approveHospitalOnboarding(request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    response.json({ hospital });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.delete("/api/admin/hospitals/:hospitalId", async (request, response, next) => {
  try { if (!await deleteHospital(request.params.hospitalId)) return response.status(404).json({ error: "Hospital not found." }); response.status(204).end(); } catch (error) { next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/users", async (request, response, next) => {
  try { const user = await addHospitalUser(request.params.hospitalId, request.body || {}); if (!user) return response.status(404).json({ error: "Hospital not found." }); response.status(201).json({ user }); }
  catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.patch("/api/admin/hospitals/:hospitalId/users/:userId", async (request, response, next) => {
  try { const user = await updateHospitalUser(request.params.hospitalId, request.params.userId, request.body || {}); if (user === undefined) return response.status(404).json({ error: "Hospital not found." }); if (!user) return response.status(404).json({ error: "User not found." }); response.json({ user }); }
  catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.delete("/api/admin/hospitals/:hospitalId/users/:userId", async (request, response, next) => {
  try { const deleted = await deleteHospitalUser(request.params.hospitalId, request.params.userId); if (deleted === undefined) return response.status(404).json({ error: "Hospital not found." }); if (!deleted) return response.status(404).json({ error: "User not found." }); response.status(204).end(); } catch (error) { next(error); }
});

app.get("/api/admin/users", async (_request, response, next) => {
  try {
    const hospitals = await listHospitals();
    response.json({ users: hospitals.flatMap((hospital) => (hospital.users || []).map(({ passwordSetupToken, passwordSetupExpiresAt, ...user }) => ({ ...user, hospitalId: hospital.id, hospitalName: hospital.name, hospitalCode: hospital.code }))) });
  } catch (error) { next(error); }
});

app.post("/api/admin/users/:userId/reset-password", async (request, response, next) => {
  try {
    const found = await resetHospitalUserPassword(request.params.userId);
    if (!found) return response.status(404).json({ error: "User not found." });
    const origin = process.env.PUBLIC_BASE_URL || `${request.protocol}://${request.get("host")}`;
    const setupLink = `${origin}/?setPasswordToken=${found.user.passwordSetupToken}`;
    const email = await sendEmail(buildWelcomeEmail(found.hospital, found.user, setupLink));
    response.json({ user: { id: found.user.id, name: found.user.name, email: found.user.email }, email });
  } catch (error) { next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/users/:userId/reset-password", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital || !hospital.users?.some((user) => user.id === request.params.userId)) return response.status(404).json({ error: "User not found for this hospital." });
    const found = await resetHospitalUserPassword(request.params.userId);
    const origin = process.env.PUBLIC_BASE_URL || `${request.protocol}://${request.get("host")}`;
    const email = await sendEmail(buildWelcomeEmail(found.hospital, found.user, `${origin}/?setPasswordToken=${found.user.passwordSetupToken}`));
    response.json({ user: { id: found.user.id, name: found.user.name, email: found.user.email }, email });
  } catch (error) { next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/roles", async (request, response, next) => {
  try { const roles = await listHospitalRoles(request.params.hospitalId); if (!roles) return response.status(404).json({ error: "Hospital not found." }); response.json({ roles }); } catch (error) { next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/roles", async (request, response, next) => {
  try { const role = await createHospitalRole(request.params.hospitalId, request.body || {}); if (!role) return response.status(404).json({ error: "Hospital not found." }); response.status(201).json({ role }); } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.patch("/api/admin/hospitals/:hospitalId/roles/:roleId", async (request, response, next) => {
  try { const role = await updateHospitalRole(request.params.hospitalId, request.params.roleId, request.body || {}); if (role === undefined) return response.status(404).json({ error: "Hospital not found." }); if (!role) return response.status(404).json({ error: "Role not found." }); response.json({ role }); } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.delete("/api/admin/hospitals/:hospitalId/roles/:roleId", async (request, response, next) => {
  try { const deleted = await deleteHospitalRole(request.params.hospitalId, request.params.roleId); if (deleted === undefined) return response.status(404).json({ error: "Hospital not found." }); if (!deleted) return response.status(404).json({ error: "Role not found." }); response.status(204).end(); } catch (error) { next(error); }
});

app.get("/api/document-matches", async (_request, response, next) => {
  try {
    const departments = await readDocumentMatches();
    if (!departments) {
      response.status(404).json({ error: "No document match data found yet. Run the documentMatchingWorkflow first." });
      return;
    }
    response.json(departments);
  } catch (error) {
    next(error);
  }
});

async function listTemplateFiles(directory = templateRoot, relativePath = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "metadata") continue;
    const relative = path.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...await listTemplateFiles(path.join(directory, entry.name), relative));
    else if (/\.(docx|xlsx|pptx)$/i.test(entry.name) && relative !== path.basename(masterListTemplatePath)) files.push(relative);
  }
  return files;
}

async function getTemplateFiles(programme) {
  if (r2TemplateStorageEnabled()) return programme ? listR2ProgrammeTemplateFiles(programme) : listR2TemplateFiles();
  const root = programme ? path.join(templateRoot, accreditationProgrammeSlug(programme)) : templateRoot;
  try { return await listTemplateFiles(root); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
}

async function getTemplateBuffer(relativePath) {
  return r2TemplateStorageEnabled() ? getR2TemplateFile(relativePath) : readFile(resolveTemplatePath(relativePath));
}

function normalizeTemplateName(value) {
  return path.basename(value || "")
    .replace(/_TEMPLATE\.[^.]+$/i, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

async function readTemplateMasterList(programme) {
  const workbook = new ExcelJS.Workbook();
  if (r2TemplateStorageEnabled()) {
    const buffer = programme ? await getR2ProgrammeTemplateFile(programme, masterListTemplateFile) : await getR2TemplateFile(masterListTemplateFile);
    await workbook.xlsx.load(buffer);
  } else {
    const root = programme ? path.join(templateRoot, accreditationProgrammeSlug(programme)) : templateRoot;
    await workbook.xlsx.readFile(path.join(root, masterListTemplateFile));
  }
  return extractMasterListDepartments(workbook);
}

function extractMasterListDepartments(workbook) {
  const departments = {};
  workbook.eachSheet((worksheet) => {
    const documents = [];
    worksheet.eachRow((row) => {
      const documentName = String(row.getCell(2).value || "").trim();
      const documentId = String(row.getCell(3).value || "").trim();
      if (documentName && documentId.includes("/")) documents.push({ documentName, documentId });
    });
    if (documents.length) departments[worksheet.name] = documents;
  });
  return departments;
}

function matchTemplate(document, department, templateFiles) {
  let best = null;
  for (const templatePath of templateFiles) {
    const templateName = normalizeTemplateName(templatePath);
    const score = similarity(document.documentName, templateName) + getDepartmentBoost(templatePath, department);
    if (!best || score > best.score) best = { templatePath, score };
  }
  return best;
}

function programmeTemplateDepartments(templateFiles) {
  const departments = Object.fromEntries(NABH_WORKSPACE_CATEGORIES.map((category) => [category, []]));
  for (const templatePath of templateFiles) {
    if (path.basename(templatePath) === masterListTemplateFile) continue;
    const [folder] = templatePath.split("/");
    const category = NABH_WORKSPACE_CATEGORIES.includes(folder) ? folder : classifyDocument(path.basename(templatePath));
    departments[category].push({
      documentName: path.basename(templatePath).replace(/_TEMPLATE\.[^.]+$/i, "").replace(/\.[^.]+$/, ""),
      documentId: "",
      templatePath,
      fileName: path.basename(templatePath),
      fileType: path.extname(templatePath).slice(1).toUpperCase(),
      matchScore: 1
    });
  }
  for (const documents of Object.values(departments)) documents.sort((left, right) => left.documentName.localeCompare(right.documentName));
  return departments;
}

app.get("/api/admin/template-library", async (request, response, next) => {
  const programme = typeof request.query.programme === "string" && request.query.programme.trim() ? request.query.programme.trim() : "";
  try {
    if (programme && !NABH_ACCREDITATION_PROGRAMMES.includes(programme)) return response.status(400).json({ error: "Unknown NABH accreditation programme." });
    const templateFiles = await getTemplateFiles(programme || undefined);
    if (programme && !templateFiles.length) {
      return response.json({ departments: {}, programmes: NABH_ACCREDITATION_PROGRAMMES, programme, storage: r2TemplateStorageInfo(), unmatchedTemplateCount: 0, error: `No templates found yet for the "${programme}" programme. Ask an administrator to upload templates for this programme.` });
    }
    if (programme) {
      const departments = programmeTemplateDepartments(templateFiles);
      return response.json({ departments, programmes: NABH_ACCREDITATION_PROGRAMMES, programme, storage: r2TemplateStorageInfo(), unmatchedTemplateCount: 0 });
    }
    const masterList = await readTemplateMasterList();
    const matchedFiles = new Set();
    const departments = Object.fromEntries(Object.entries(masterList).map(([department, documents]) => [department, documents.map((document) => {
      const match = matchTemplate(document, department, templateFiles);
      const templatePath = match?.templatePath || null;
      if (templatePath) matchedFiles.add(templatePath);
      return { ...document, templatePath, fileName: templatePath ? path.basename(templatePath) : null, fileType: templatePath ? path.extname(templatePath).slice(1).toUpperCase() : null, matchScore: match ? Number(match.score.toFixed(3)) : 0 };
    })]));
    response.json({ departments, programmes: NABH_ACCREDITATION_PROGRAMMES, programme: programme || null, masterListPath: r2TemplateStorageEnabled() ? `${r2TemplateStorageInfo().prefix}${programme ? `${accreditationProgrammeSlug(programme)}/` : ""}${masterListTemplateFile}` : masterListTemplatePath, storage: r2TemplateStorageInfo(), unmatchedTemplateCount: templateFiles.length - matchedFiles.size });
  } catch (error) {
    if (error.code === "ENOENT" || error.name === "NoSuchKey" || error.name === "NotFound") {
      return response.json({ departments: {}, programmes: NABH_ACCREDITATION_PROGRAMMES, programme: programme || null, storage: r2TemplateStorageInfo(), unmatchedTemplateCount: 0, error: programme ? `No Master List template found yet for the "${programme}" programme.` : `Master List template not found: ${masterListTemplatePath}` });
    }
    next(error);
  }
});

function withDocumentStatus(departments, hospitalStatus) {
  return Object.fromEntries(Object.entries(departments).map(([department, documents]) => [
    department,
    documents.map((document) => ({ ...document, readinessStatus: hospitalStatus[document.id]?.status || "not_started", category: classifyDocument(document.documentName) }))
  ]));
}

async function loadHospitalDepartments(hospital) {
  if (!r2TemplateStorageEnabled()) return (await readDocumentMatches()) || {};
  const programme = hospital.accreditation?.programme;
  const [clientFiles, versionManifests] = await Promise.all([
    listR2ClientFiles(hospital.code, programme),
    getR2ClientVersionManifests(hospital.code, programme)
  ]);
  const departments = Object.fromEntries(NABH_WORKSPACE_CATEGORIES.map((category) => [category, []]));
  for (const templatePath of clientFiles) {
    if (path.basename(templatePath) === masterListTemplateFile) continue;
    const [folder] = templatePath.split("/");
    const department = NABH_WORKSPACE_CATEGORIES.includes(folder) ? folder : classifyDocument(path.basename(templatePath));
    const documentName = path.basename(templatePath).replace(/_TEMPLATE\.[^.]+$/i, "").replace(/\.[^.]+$/, "");
    const docKey = getDocumentKey("", documentName, templatePath);
    const versionManifest = versionManifests.get(docKey) || versionManifests.get(templatePath);
    const isApproved = Boolean(versionManifest && versionManifest.history && versionManifest.history.some((entry) => entry.action && entry.action !== "template baseline"));
    departments[department].push({
      documentName,
      documentId: "",
      id: `${department}:${docKey}`,
      active: true,
      confidence: "high",
      matchedFilePath: templatePath,
      relativeFilePath: templatePath,
      version: isApproved ? versionManifest.currentVersion : null,
      approved: isApproved,
      history: versionManifest?.history || []
    });
  }
  for (const documents of Object.values(departments)) documents.sort((left, right) => left.documentName.localeCompare(right.documentName));
  return departments;
}

async function recordDocumentStatusAudit(hospital, documentId, previousStatus, entry, action) {
  const departments = await loadHospitalDepartments(hospital);
  const document = Object.entries(departments).flatMap(([department, documents]) => documents.map((item) => ({ ...item, department }))).find((item) => item.id === documentId);
  const auditEntry = {
    documentId,
    documentName: document?.documentName || documentId,
    department: document?.department || "",
    action: action || "readiness status changed",
    approvedBy: entry.updatedBy,
    note: `${previousStatus.replace(/_/g, " ")} -> ${entry.status.replace(/_/g, " ")}${entry.note ? `: ${entry.note}` : ""}`,
    previousStatus,
    status: entry.status,
    timestamp: entry.updatedAt
  };
  if (r2TemplateStorageEnabled() && !usesPostgresDataStore()) return recordR2ClientAuditEvent(hospital, auditEntry);
  const audit = await readDocumentAudit();
  await saveDocumentAudit([auditEntry, ...audit]);
  return auditEntry;
}

async function getPersistentDocumentStatus(hospital) {
  return r2TemplateStorageEnabled() && !usesPostgresDataStore() ? getR2ClientDocumentStatuses(hospital.code, hospital.accreditation?.programme) : getHospitalDocumentStatus(hospital.id);
}

async function persistDocumentStatus(hospital, documentId, status, updatedBy, note) {
  const entry = await setHospitalDocumentStatus(hospital.id, documentId, status, updatedBy, note);
  if (r2TemplateStorageEnabled() && !usesPostgresDataStore()) await saveR2ClientDocumentStatuses(hospital.code, hospital.accreditation?.programme, { ...await getPersistentDocumentStatus(hospital), [documentId]: entry });
  return entry;
}

app.get("/api/admin/hospitals/:hospitalId/documents", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    if (!hasAcceptedAccreditation(hospital)) return response.status(400).json({ error: "Select and accept an NABH accreditation programme before the document workspace is available.", reason: "accreditation_required" });
    const repository = await getR2ClientRepositoryStatus(hospital.code, hospital.accreditation?.programme);
    if (!repository.exists) return response.status(404).json({ error: "Hospital document repository has not been initialized.", repository, job: repositorySyncJobs.get(hospital.id) || null });
    const hospitalStatus = await getPersistentDocumentStatus(hospital);
    const departments = await loadHospitalDepartments(hospital);
    response.json({ departments: withDocumentStatus(departments, hospitalStatus), repository });
  } catch (error) { next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/document-status", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    response.json({ status: await getPersistentDocumentStatus(hospital), statuses: DOCUMENT_STATUSES });
  } catch (error) { next(error); }
});

app.patch("/api/admin/hospitals/:hospitalId/document-status", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    const { documentId, status, updatedBy, note } = request.body || {};
    const previousStatus = (await getPersistentDocumentStatus(hospital))[documentId]?.status || "not_started";
    const entry = await persistDocumentStatus(hospital, documentId, status, updatedBy, note);
    await recordDocumentStatusAudit(hospital, documentId, previousStatus, entry);
    response.json({ documentId, entry });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/workspace-overview", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    if (!hasAcceptedAccreditation(hospital)) return response.status(400).json({ error: "Select and accept an NABH accreditation programme before the document workspace is available.", reason: "accreditation_required" });
    const repository = await getR2ClientRepositoryStatus(hospital.code, hospital.accreditation?.programme);
    if (!repository.exists) return response.status(404).json({ error: "Hospital document repository has not been initialized.", repository, job: repositorySyncJobs.get(hospital.id) || null });
    const [departments, hospitalStatus] = await Promise.all([loadHospitalDepartments(hospital), getPersistentDocumentStatus(hospital)]);
    const categories = Object.fromEntries(NABH_WORKSPACE_CATEGORIES.map((category) => [category, Object.fromEntries(DOCUMENT_STATUSES.map((status) => [status, 0]))]));
    let total = 0, ready = 0;
    for (const documents of Object.values(departments)) {
      for (const document of documents) {
        const category = classifyDocument(document.documentName);
        const status = hospitalStatus[document.id]?.status || "not_started";
        categories[category][status]++;
        total++;
        if (status === "approved" || status === "implemented" || status === "evidence_available") ready++;
      }
    }
    response.json({ categories, total, readinessPercent: total ? Math.round((ready / total) * 100) : 0, profileComplete: isProfileComplete(hospital), missingProfileFields: missingProfileFields(hospital) });
  } catch (error) { next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/accreditation", async (request, response, next) => {
  try {
    const state = await getAccreditationState(request.params.hospitalId);
    if (!state) return response.status(404).json({ error: "Hospital not found." });
    response.json(state);
  } catch (error) { next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/accreditation", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    const selection = await selectAccreditationProgramme(request.params.hospitalId, request.body?.programme, request.body?.decidedBy);
    // Force a full resync so switching programmes always overwrites any same-named files
    // left over from a previously selected programme, instead of skipping existing ones.
    const job = r2TemplateStorageEnabled() ? startRepositoryProvisioning({ ...hospital, accreditation: selection }, { syncNewTemplates: true }) : null;
    response.json({ selection, job });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.patch("/api/admin/hospitals/:hospitalId/profile", async (request, response, next) => {
  try {
    const hospital = await submitHospitalProfile(request.params.hospitalId, request.body?.details);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    response.json({ hospital, profileComplete: isProfileComplete(hospital), missingProfileFields: missingProfileFields(hospital) });
  } catch (error) { next(error); }
});

app.post("/api/register", async (request, response, next) => {
  try {
    const hospital = await persistHospitalLogo(await registerHospital(request.body || {}));
    const user = hospital.users[0];
    const origin = process.env.PUBLIC_BASE_URL || `${request.protocol}://${request.get("host")}`;
    const setupLink = `${origin}/?setPasswordToken=${user.passwordSetupToken}`;
    const email = await sendEmail(buildWelcomeEmail(hospital, user, setupLink)).catch((error) => ({ delivered: false, error: error.message }));
    const { passwordSetupToken, passwordSetupExpiresAt, ...safeUser } = user;
    // The document workspace is not provisioned yet: it requires an accepted accreditation
    // programme first (see POST /api/admin/hospitals/:hospitalId/accreditation).
    response.status(201).json({ hospital: { ...hospital, users: [safeUser] }, repository: { mode: r2TemplateStorageEnabled() ? "r2" : "local", provisioned: false, pending: "accreditation" }, email });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/logo", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).end();
    if (r2TemplateStorageEnabled()) {
      const logo = await getR2HospitalLogo(hospital.code);
      if (!logo) return response.status(404).end();
      return response.type(logo.contentType).send(logo.bytes);
    }
    const match = String(hospital.logoDataUrl || "").match(/^data:(image\/(png|jpeg|webp));base64,(.+)$/i);
    if (!match) return response.status(404).end();
    response.type(match[1]).send(Buffer.from(match[2], "base64"));
  } catch (error) { next(error); }
});

app.get("/api/set-password/:token", async (request, response, next) => {
  try {
    const found = await findUserBySetupToken(request.params.token);
    if (!found) return response.status(404).json({ error: "Invalid or expired setup link." });
    if (found.user.passwordSetupExpiresAt && new Date(found.user.passwordSetupExpiresAt).getTime() < Date.now()) return response.status(410).json({ error: "This setup link has expired." });
    response.json({ hospitalName: found.hospital.name, email: found.user.email });
  } catch (error) { next(error); }
});

app.post("/api/set-password", async (request, response, next) => {
  try {
    const { hospital, user } = await completePasswordSetup(request.body?.token, request.body?.password);
    const role = hospital.roles?.find((item) => item.name === user.role);
    response.json({ session: { role: user.role, permissions: role?.permissions || ["view"], hospitalId: hospital.id, hospitalName: hospital.name, hospitalLogoPath: hospital.logoPath } });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.post("/api/login", async (request, response, next) => {
  try {
    const userId = String(request.body?.userId || "").trim().toLowerCase();
    const password = String(request.body?.password || "");
    if (!userId.endsWith("-admin")) return response.status(401).json({ error: "Invalid credentials." });
    const hospital = await verifyHospitalAdminPassword(userId.slice(0, -6), password);
    if (!hospital) return response.status(401).json({ error: "Invalid credentials." });
    const hospitalWithLogo = await backfillHospitalLogos([hospital]);
    const role = hospital.roles?.find((item) => item.name === "Hospital Administrator");
    response.json({ session: { role: "Hospital Administrator", permissions: role?.permissions || ["view"], hospitalId: hospital.id, hospitalName: hospital.name, hospitalLogoPath: hospitalWithLogo[0].logoPath } });
  } catch (error) { next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/documents/action", async (request, response, next) => {
  try {
    const { documentId, action, updatedBy, note } = request.body || {};
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    const persistentStatus = await getPersistentDocumentStatus(hospital);
    const previousStatus = persistentStatus[documentId]?.status || "not_started";
    if (persistentStatus[documentId]) await setHospitalDocumentStatus(hospital.id, documentId, persistentStatus[documentId].status, persistentStatus[documentId].updatedBy, persistentStatus[documentId].note);
    const entry = await performDocumentAction(request.params.hospitalId, documentId, action, updatedBy, note);
    if (r2TemplateStorageEnabled() && !usesPostgresDataStore()) await saveR2ClientDocumentStatuses(hospital.code, hospital.accreditation?.programme, { ...persistentStatus, [documentId]: entry });
    await recordDocumentStatusAudit(hospital, documentId, previousStatus, entry, action.replace(/-/g, " "));
    response.json({ documentId, entry });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.get("/api/training/catalog", (_request, response) => {
  response.json({ topics: TRAINING_TOPICS, catalog: TRAINING_CATALOG });
});

app.get("/api/consulting/catalog", (_request, response) => {
  response.json({ catalog: CONSULTING_CATALOG });
});

app.post("/api/admin/hospitals/:hospitalId/training/generate", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    response.json({ pack: request.body?.serviceId ? generateTrainingMaterial(hospital, request.body.serviceId) : generateTrainingPack(hospital, request.body?.topic) });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/bookings", async (request, response, next) => {
  try { response.json({ bookings: await listBookings(request.params.hospitalId) }); } catch (error) { next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/bookings", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    response.status(201).json({ booking: await createBooking(hospital.id, request.body || {}) });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.patch("/api/admin/bookings/:bookingId", async (request, response, next) => {
  try {
    const booking = await updateBookingStatus(request.params.bookingId, request.body?.status, request.body?.updatedBy);
    if (!booking) return response.status(404).json({ error: "Booking not found." });
    response.json({ booking });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.post("/api/admin/bookings/:bookingId/recording", async (request, response, next) => {
  try {
    const booking = await attachBookingRecording(request.params.bookingId, request.body || {});
    if (!booking) return response.status(404).json({ error: "Booking not found." });
    response.json({ booking });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/documents/approve", express.raw({ type: "application/octet-stream", limit: "50mb" }), async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    const manifest = await approveR2ClientDocumentVersion({
      hospital,
      documentId: request.get("X-Document-Id"),
      documentName: request.get("X-Document-Name"),
      department: request.get("X-Department"),
      relativePath: request.get("X-Document-Path"),
      fileName: request.get("X-File-Name"),
      bytes: request.body,
      approvedBy: request.get("X-Approved-By"),
      note: request.get("X-Approval-Note")
    });
    response.status(201).json({ document: manifest });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.get("/api/admin/template-library/versions", async (request, response, next) => {
  try {
    const programme = String(request.query.programme || "").trim();
    const relativePath = String(request.query.path || "");
    if (!programme || !relativePath) return response.status(400).json({ error: "Programme and template path are required." });
    response.json({ document: await getR2TemplateVersionManifest(programme, relativePath) });
  } catch (error) { next(error); }
});

app.post("/api/admin/template-library/approve", express.raw({ type: "application/octet-stream", limit: "50mb" }), async (request, response, next) => {
  try {
    const manifest = await approveR2TemplateDocumentVersion({
      programme: request.get("X-Programme"), documentId: request.get("X-Document-Id"), documentName: request.get("X-Document-Name"), department: request.get("X-Department"), relativePath: request.get("X-Document-Path"), fileName: request.get("X-File-Name"), bytes: request.body, approvedBy: request.get("X-Approved-By"), note: request.get("X-Approval-Note")
    });
    response.status(201).json({ document: manifest });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

async function findHospital(request) {
  const hospitals = await listHospitals();
  let hospital = hospitals.find((item) => item.id === request.params.hospitalId || item.code === request.params.hospitalId);
  if (!hospital && (request.params.hospitalId === "undefined" || !request.params.hospitalId)) {
    hospital = hospitals[0];
  }
  if (!hospital) {
    const error = new Error("Hospital not found.");
    error.status = 404;
    throw error;
  }
  return hospital;
}

async function resolveMasterTemplateBuffer(relativePath, programme) {
  const norm = String(relativePath || "").replace(/\\/g, "/").trim();
  if (!norm) return null;

  const candidates = [
    norm,
    norm.replace(/\.doc$/i, ".docx"),
    norm.replace(/\.(docx|doc|xlsx|pptx)$/i, "") + "_TEMPLATE.docx",
    norm.replace(/\.(docx|doc|xlsx|pptx)$/i, "") + "_TEMPLATE.doc"
  ];

  const baseName = path.basename(norm.replace(/\.(docx|doc|xlsx|pptx)$/i, "")).replace(/_TEMPLATE$/i, "").toLowerCase();

  if (r2TemplateStorageEnabled()) {
    for (const cand of candidates) {
      try {
        const buffer = programme ? await getR2ProgrammeTemplateFile(programme, cand) : await getR2TemplateFile(cand);
        return { buffer, relativePath: cand };
      } catch {}
    }
    try {
      const templateFiles = programme ? await listR2ProgrammeTemplateFiles(programme) : await listR2TemplateFiles();
      const match = templateFiles.find((f) => path.basename(f, path.extname(f)).replace(/_TEMPLATE$/i, "").toLowerCase() === baseName);
      if (match) return { buffer: programme ? await getR2ProgrammeTemplateFile(programme, match) : await getR2TemplateFile(match), relativePath: match };
    } catch {}
  } else {
    const root = programme ? path.join(templateRoot, accreditationProgrammeSlug(programme)) : templateRoot;
    for (const cand of candidates) {
      const localPath = path.resolve(root, cand);
      try {
        await access(localPath);
        const buffer = await readFile(localPath);
        return { buffer, relativePath: cand };
      } catch {}
    }
  }

  return null;
}

async function resolveDocumentBuffer(hospital, relativePath) {
  const norm = String(relativePath || "").replace(/\\/g, "/").trim();
  if (!norm) return null;

  const candidates = [];
  candidates.push(norm);

  if (/\.doc$/i.test(norm)) {
    candidates.push(norm.replace(/\.doc$/i, ".docx"));
  }

  const baseNoExt = norm.replace(/\.(docx|doc|xlsx|pptx)$/i, "");
  if (!baseNoExt.endsWith("_TEMPLATE")) {
    candidates.push(baseNoExt + "_TEMPLATE.docx");
    candidates.push(baseNoExt + "_TEMPLATE.doc");
  }

  const baseName = path.basename(baseNoExt).replace(/_TEMPLATE$/i, "").toLowerCase();

  if (r2TemplateStorageEnabled()) {
    for (const cand of candidates) {
      try {
        const buffer = await getR2ClientFile(hospital.code, cand, hospital.accreditation?.programme);
        return { buffer, relativePath: cand, source: "client" };
      } catch {}
      try {
        const buffer = await getR2TemplateFile(cand);
        return { buffer, relativePath: cand, source: "template" };
      } catch {}
    }

    try {
      const clientFiles = await listR2ClientFiles(hospital.code, hospital.accreditation?.programme);
      const match = clientFiles.find((f) => path.basename(f, path.extname(f)).replace(/_TEMPLATE$/i, "").toLowerCase() === baseName);
      if (match) {
        return { buffer: await getR2ClientFile(hospital.code, match, hospital.accreditation?.programme), relativePath: match, source: "client" };
      }
    } catch {}

    try {
      const templateFiles = await listR2TemplateFiles();
      const match = templateFiles.find((f) => path.basename(f, path.extname(f)).replace(/_TEMPLATE$/i, "").toLowerCase() === baseName);
      if (match) {
        return { buffer: await getR2TemplateFile(match), relativePath: match, source: "template" };
      }
    } catch {}
  } else {
    for (const cand of candidates) {
      const localPath = path.resolve(templateRoot, cand);
      try {
        await access(localPath);
        const buffer = await readFile(localPath);
        return { buffer, relativePath: cand, source: "local" };
      } catch {}
    }

    if (norm === "NABH policies/AAC policy.doc" || norm.includes("AAC")) {
      try {
        const buffer = await readFile(aacPolicyWordPath);
        return { buffer, relativePath: "NABH policies/AAC_Policy_Modified.docx", source: "local" };
      } catch {}
    }
  }

  return null;
}

app.get("/api/admin/hospitals/:hospitalId/documents/download", async (request, response, next) => {
  try {
    const hospital = await findHospital(request);
    const relativePath = String(request.query.path || request.query.file || "");
    if (!relativePath) return response.status(400).json({ error: "Document path is required." });

    const resolved = await resolveDocumentBuffer(hospital, relativePath);
    if (!resolved) {
      return response.status(404).json({ error: `Document file not found for path: ${relativePath}` });
    }

    const customizedBuffer = await customizeDocumentTemplate(resolved.buffer, resolved.relativePath, hospital);
    let downloadFilename = path.basename(resolved.relativePath).replace(/_TEMPLATE(?=\.[^.]+$)/i, "");

    const ext = path.extname(downloadFilename).toLowerCase();
    if (ext !== ".docx" && ext !== ".xlsx" && ext !== ".pptx" && ext !== ".pdf") {
      downloadFilename = `${path.basename(downloadFilename, ext)}.docx`;
    }

    response.attachment(downloadFilename).send(customizedBuffer);
  } catch (error) {
    if (!response.headersSent) {
      response.status(500).json({ error: error.message || "Failed to download document." });
    } else {
      next(error);
    }
  }
});

app.get("/api/admin/hospitals/:hospitalId/documents/version/download", async (request, response) => {
  try {
    const hospital = await findHospital(request);
    const objectKey = String(request.query.key || "");
    response.attachment(path.basename(objectKey)).send(await getR2ClientVersionFile(hospital.code, objectKey, hospital.accreditation?.programme));
  } catch (error) { response.status(error.status || 400).json({ error: error.message }); }
});

app.get("/api/admin/hospitals/:hospitalId/documents/version/preview", async (request, response) => {
  try {
    const hospital = await findHospital(request);
    const objectKey = String(request.query.key || "");
    const cacheDirectory = path.join(previewCacheRoot, "client-versions", createHash("sha256").update(objectKey).digest("hex"));
    const sourcePath = path.join(cacheDirectory, path.basename(objectKey));
    const pdfPath = path.join(cacheDirectory, `${path.basename(sourcePath, path.extname(sourcePath))}.pdf`);
    await mkdir(cacheDirectory, { recursive: true });
    try { await access(pdfPath); } catch {
      await writeFile(sourcePath, await getR2ClientVersionFile(hospital.code, objectKey, hospital.accreditation?.programme));
      await execFileAsync(process.env.SOFFICE_PATH || "soffice", ["--headless", "--convert-to", "pdf", "--outdir", cacheDirectory, sourcePath]);
    }
    response.type("application/pdf").send(await readFile(pdfPath));
  } catch (error) { response.status(error.status || 400).json({ error: error.message }); }
});

app.get("/api/admin/hospitals/:hospitalId/documents/preview", async (request, response, next) => {
  try {
    const hospital = await findHospital(request);
    const relativePath = String(request.query.path || request.query.file || "");
    if (!relativePath) return response.status(400).json({ error: "Document path is required." });

    const cacheKey = createHash("sha256").update(`${hospital.code}:${relativePath}`).digest("hex");
    const cacheDirectory = path.join(previewCacheRoot, "client-docs", cacheKey);
    await mkdir(cacheDirectory, { recursive: true });

    const resolved = await resolveDocumentBuffer(hospital, relativePath);
    if (!resolved) {
      return response.status(404).json({ error: `Document source file not found for path: ${relativePath}` });
    }

    const sourcePath = path.join(cacheDirectory, path.basename(resolved.relativePath));
    const pdfPath = path.join(cacheDirectory, `${path.basename(sourcePath, path.extname(sourcePath))}.pdf`);

    let pdfInfo;
    try { pdfInfo = await stat(pdfPath); } catch { pdfInfo = null; }

    if (!pdfInfo) {
      const customizedBuffer = await customizeDocumentTemplate(resolved.buffer, resolved.relativePath, hospital);
      await writeFile(sourcePath, customizedBuffer);
      try {
        await execFileAsync(process.env.SOFFICE_PATH || "soffice", ["--headless", "--convert-to", "pdf", "--outdir", cacheDirectory, sourcePath]);
      } catch (error) {
        return response.status(503).json({ error: `Unable to create PDF preview. ${error.stderr || error.message}` });
      }
    }

    await access(pdfPath);
    response.type("application/pdf").send(await readFile(pdfPath));
  } catch (error) {
    if (!response.headersSent) {
      response.status(500).json({ error: error.message || "PDF preview failed." });
    } else {
      next(error);
    }
  }
});

app.get("/api/admin/hospitals/:hospitalId/document-audit", async (request, response, next) => {
  try {
    const hospital = await findHospital(request);
    const entries = r2TemplateStorageEnabled() && !usesPostgresDataStore() ? await listR2ClientAuditEvents(hospital.code, hospital.accreditation?.programme) : await readDocumentAudit();
    response.json({ entries });
  } catch (error) { next(error); }
});

app.get("/api/admin/template-library/download", async (request, response, next) => {
  try {
    const relativePath = String(request.query.path || "");
    const programme = typeof request.query.programme === "string" && request.query.programme.trim() ? request.query.programme.trim() : undefined;
    if (!relativePath) return response.status(400).json({ error: "Template path is required." });

    const resolved = await resolveMasterTemplateBuffer(relativePath, programme);
    if (!resolved) return response.status(404).json({ error: "Template not found." });

    response.attachment(path.basename(resolved.relativePath)).send(resolved.buffer);
  } catch (error) {
    if (!response.headersSent) {
      response.status(500).json({ error: error.message || "Template download failed." });
    } else {
      next(error);
    }
  }
});

function resolveTemplatePath(relativePath) {
  const filePath = path.resolve(templateRoot, relativePath);
  if (!relativePath || !filePath.startsWith(`${path.resolve(templateRoot)}${path.sep}`) || !/\.(docx|xlsx|pptx)$/i.test(filePath)) return null;
  return filePath;
}

app.get("/api/admin/template-library/preview", async (request, response, next) => {
  try {
    const relativePath = String(request.query.path || "");
    const programme = typeof request.query.programme === "string" && request.query.programme.trim() ? request.query.programme.trim() : undefined;
    if (!relativePath) return response.status(400).json({ error: "Template path is required." });

    const cacheKey = createHash("sha256").update(`template:${programme || ""}:${relativePath}`).digest("hex");
    const cacheDirectory = path.join(previewCacheRoot, "templates", cacheKey);
    await mkdir(cacheDirectory, { recursive: true });

    const resolved = await resolveMasterTemplateBuffer(relativePath, programme);
    if (!resolved) return response.status(404).json({ error: "Template not found." });

    const sourcePath = path.join(cacheDirectory, path.basename(resolved.relativePath));
    const pdfPath = path.join(cacheDirectory, `${path.basename(sourcePath, path.extname(sourcePath))}.pdf`);

    let pdfInfo;
    try { pdfInfo = await stat(pdfPath); } catch { pdfInfo = null; }

    if (!pdfInfo) {
      await writeFile(sourcePath, resolved.buffer);
      try {
        await execFileAsync(process.env.SOFFICE_PATH || "soffice", ["--headless", "--convert-to", "pdf", "--outdir", cacheDirectory, sourcePath]);
      } catch (error) {
        return response.status(503).json({ error: `Unable to create PDF preview. ${error.stderr || error.message}` });
      }
    }

    await access(pdfPath);
    response.type("application/pdf").send(await readFile(pdfPath));
  } catch (error) {
    if (!response.headersSent) {
      response.status(500).json({ error: error.message || "PDF preview failed." });
    } else {
      next(error);
    }
  }
});

app.get("/api/document-audit", async (_request, response, next) => {
  try {
    if (!r2TemplateStorageEnabled() || usesPostgresDataStore()) return response.json({ entries: await readDocumentAudit() });
    const hospitals = await listHospitals();
    const clientEntries = await Promise.all(hospitals.filter((hospital) => hospital.accreditation?.programme).map(async (hospital) => (await listR2ClientAuditEvents(hospital.code, hospital.accreditation.programme)).map((entry) => ({ ...entry, hospitalCode: hospital.code, hospitalName: hospital.name }))));
    response.json({ entries: [...await listR2TemplateAuditEvents(), ...clientEntries.flat()].sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp))) });
  } catch (error) { next(error); }
});

app.post("/api/documents/:department/:id/onlyoffice", async (request, response, next) => {
  try {
    const config = await onlyOffice.editorConfig({
      department: request.params.department,
      id: request.params.id,
      editor: request.body?.editor,
      checkInNote: request.body?.checkInNote,
      request
    });
    if (!config) return response.status(404).json({ error: "Document not found." });
    response.json(config);
  } catch (error) { response.status(503).json({ error: error.message }); }
});

app.get("/api/documents/:department/:id/content", async (request, response, next) => {
  try {
    const document = await onlyOffice.streamDocument(request.params.department, request.params.id);
    if (!document) return response.status(404).json({ error: "Document not found." });
    response.download(document.filePath, document.fileName);
  } catch (error) { next(error); }
});

app.post("/api/documents/onlyoffice/callback/:sessionId", async (request, response, next) => {
  try { response.json(await onlyOffice.saveCallback(request.params.sessionId, request.body || {})); }
  catch (error) { response.status(403).json({ error: 1, message: error.message }); }
});

app.get("/api/documents/aac-policy/preview", async (_request, response, next) => {
  try {
    await access(aacPolicyPdfPath);
    response.type("application/pdf").send(await readFile(aacPolicyPdfPath));
  } catch (error) {
    next(error);
  }
});

app.get("/api/documents/aac-policy/download", async (_request, response, next) => {
  try {
    await access(aacPolicyWordPath);
    response.download(aacPolicyWordPath, "AAC_Policy_Modified.docx");
  } catch (error) {
    next(error);
  }
});

app.patch("/api/document-matches/:department/active", async (request, response, next) => {
  try {
    const { department } = request.params;
    const { id, active } = request.body;

    const departments = await readDocumentMatches();
    const documents = departments?.[department];
    if (!documents) {
      response.status(404).json({ error: `Unknown department: ${department}` });
      return;
    }

    const doc = documents.find((d) => d.id === id);
    if (!doc) {
      response.status(404).json({ error: "Document not found." });
      return;
    }

    doc.active = Boolean(active);
    await saveDocumentMatches(departments);
    response.json({ ok: true, active: doc.active });  } catch (error) {
    next(error);
  }
});

const EDITABLE_FIELDS = ["documentName", "documentId", "matchedFilePath"];

app.patch("/api/document-matches/:department/edit", async (request, response, next) => {
  try {
    const { department } = request.params;
    const { id, editor, fields } = request.body;

    if (!editor || !editor.trim()) {
      response.status(400).json({ error: "Editor name is required to check in changes." });
      return;
    }

    const departments = await readDocumentMatches();
    const documents = departments?.[department];
    if (!documents) {
      response.status(404).json({ error: `Unknown department: ${department}` });
      return;
    }

    const doc = documents.find((d) => d.id === id);
    if (!doc) {
      response.status(404).json({ error: "Document not found." });
      return;
    }

    const changes = {};
    for (const field of EDITABLE_FIELDS) {
      if (fields[field] !== undefined && fields[field] !== doc[field]) {
        changes[field] = { from: doc[field], to: fields[field] };
        doc[field] = fields[field];
      }
    }

    if (Object.keys(changes).length === 0) {
      response.json({ ok: true, document: doc, unchanged: true });
      return;
    }

    if (changes.matchedFilePath) doc.relativeFilePath = null;

    const hasApprovedHistory = Array.isArray(doc.history) && doc.history.some((h) => h.action && h.action !== "matched");
    const isAlreadyApproved = Boolean(doc.approved || (doc.version && doc.version > 1) || hasApprovedHistory);
    doc.version = isAlreadyApproved ? (doc.version || 1) + 1 : 1;
    doc.approved = true;
    doc.history = doc.history || [];
    doc.history.push({ version: doc.version, timestamp: new Date().toISOString(), editor: editor.trim(), action: "edited", changes });

    await saveDocumentMatches(departments);
    response.json({ ok: true, document: doc });
  } catch (error) {
    next(error);
  }
});

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST || "127.0.0.1";
app.listen(port, host, async () => {
  console.log(`Master List viewer listening on http://${host}:${port}`);
  try {
    const info = await dataStoreInfo();
    console.log(`Data store: ${info.driver}${info.target ? ` (${info.target})` : ""}`);
  } catch (error) {
    console.error(`Data store (${dataStoreDriver()}) is unavailable: ${error.message}`);
  }
});
