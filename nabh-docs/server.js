// Small viewer server: serves the parsed department -> document match data for the web UI.
// Run: node server.js
import express from "express";
import ExcelJS from "exceljs";
import { createHash, randomBytes, randomUUID } from "crypto";
import { execFile } from "child_process";
import { access, mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import { promisify } from "util";
import { fileURLToPath } from "url";
import path from "path";
import { addHospitalUser, approveHospitalOnboarding, completePasswordSetup, createHospital, createHospitalRole, deleteHospital, deleteHospitalRole, deleteHospitalUser, findUserBySetupToken, isProfileComplete, listHospitalRoles, listHospitals, missingProfileFields, registerHospital, resendRegistrationToken, resetHospitalUserPassword, roleActions, setHospitalLogoPath, submitHospitalProfile, updateHospital, updateHospitalRole, updateHospitalUser, verifyHospitalAdminPassword } from "./services/shared/hospitalAdminService.js";
import { buildOnboardingApprovalEmail, buildWelcomeEmail, sendEmail, verifySmtp } from "./services/shared/emailService.js";
import { configValue, loadConfig } from "./services/shared/config.js";
import { appendDocumentAudit, appendUserAuditEvent, createAuthSession, dataStoreDriver, dataStoreInfo, readAuthSession, readBookingById, readDocumentAnswers, readDocumentAudit, readDocumentAuditByHospital, readDocumentMatches, readHospitalRegistry, readHospitalSummaries, readTemplateQuestionnaire, readTemplateQuestionnaireSummaries, revokeAuthSession, saveDocumentAnswers, saveDocumentAudit, saveDocumentMatches, saveTemplateQuestionnaire } from "./services/shared/dataStore.js";
import { createOnlyOfficeService } from "./services/shared/onlyOfficeService.js";
import { DOCUMENT_STATUSES, getHospitalDocumentStatus, setHospitalDocumentStatus } from "./services/shared/documentStatusService.js";
import { NABH_ACCREDITATION_PROGRAMMES, accreditationProgrammeSlug, getAccreditationState, hasAcceptedAccreditation, selectAccreditationProgramme } from "./services/shared/accreditationService.js";
import { NABH_WORKSPACE_CATEGORIES, classifyDocument } from "./services/shared/documentCategoryService.js";
import { generateDocumentDraft, getDocumentDraft, performDocumentAction, prepareDocumentDraft } from "./services/shared/draftGenerationService.js";
import { getDocumentQuestions, validateDocumentAnswers, validateQuestionnaireDefinition } from "./services/shared/documentQuestionnaireService.js";
import { TRAINING_TOPICS, generateTrainingPack } from "./services/shared/trainingContentService.js";
import { CONSULTING_CATALOG, TRAINING_CATALOG, attachBookingRecording, createBooking, generateTrainingMaterial, listBookings, updateBookingStatus } from "./services/shared/servicesMarketplace.js";
import { getDepartmentBoost } from "./services/shared/departmentAliases.js";
import { createHospitalQuestionnaireReportPdf, createTemplateQuestionnaireReportPdf } from "./services/shared/questionnaireReportPdf.js";
import { createEvidence, getEvidenceFile, listDocumentEvidence } from "./services/shared/evidenceService.js";
import { similarity } from "./services/shared/textSimilarity.js";
import { customizeDocumentTemplate } from "./services/shared/documentCustomizer.js";
import { approveR2ClientDocumentVersion, approveR2TemplateDocumentVersion, getDocumentKey, getR2ClientDocumentStatuses, getR2ClientFile, getR2ClientRepositoryStatus, getR2ClientVersionFile, getR2ClientVersionManifest, getR2ClientVersionManifests, getR2HospitalAccreditation, getR2HospitalLogo, getR2ProgrammeTemplateFile, getR2TemplateFile, getR2TemplateVersionManifest, listR2ClientAuditEvents, listR2ClientFiles, listR2ProgrammeTemplateFiles, listR2TemplateAuditEvents, listR2TemplateFiles, provisionR2ClientRepository, r2TemplateStorageEnabled, r2TemplateStorageInfo, recordR2ClientAuditEvent, saveR2ClientDocumentStatuses, saveR2HospitalAccreditation, saveR2HospitalLogo } from "./services/shared/r2TemplateService.js";

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
const hospitalAccreditationCache = new Map();

function withTimeout(promise, milliseconds, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), milliseconds))
  ]);
}

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

async function hydrateHospitalAccreditation(hospital) {
  if (!hospital || !r2TemplateStorageEnabled() || usesPostgresDataStore()) return hospital;
  if (hospital.accreditation?.programme) return hospital;
  const cached = hospitalAccreditationCache.get(hospital.code);
  if (cached && cached.expiresAt > Date.now()) return cached.accreditation?.programme ? { ...hospital, accreditation: cached.accreditation } : hospital;
  const accreditation = await getR2HospitalAccreditation(hospital.code);
  hospitalAccreditationCache.set(hospital.code, { accreditation, expiresAt: Date.now() + 5 * 60 * 1000 });
  return accreditation?.programme ? { ...hospital, accreditation } : hospital;
}

function requireActiveHospital(hospital) {
  if (hospital?.status === "pending") throw new Error("Hospital is not yet onboarded. Changes are disabled until a Super Admin approves onboarding.");
  if (hospital?.status === "inactive") throw new Error("Hospital is inactive. Contact a Super Admin to restore access.");
}

function requireCompleteHospitalProfile(hospital) {
  if (isProfileComplete(hospital)) return;
  const error = new Error("Complete the institutional profile before viewing, downloading, generating, or finalising documents.");
  error.status = 409;
  error.reason = "profile_incomplete";
  error.missingProfileFields = missingProfileFields(hospital);
  throw error;
}

async function requireCompleteProfileMiddleware(request, response, next) {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    requireCompleteHospitalProfile(hospital);
    next();
  } catch (error) {
    if (error?.reason === "profile_incomplete") return response.status(error.status).json({ error: error.message, reason: error.reason, missingProfileFields: error.missingProfileFields });
    next(error);
  }
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
app.use(express.json({ limit: "25mb" }));

function requestCookies(request) {
  return Object.fromEntries(String(request.headers.cookie || "").split(";").map((part) => part.trim().split("=")).filter(([key, value]) => key && value).map(([key, ...value]) => [key, decodeURIComponent(value.join("="))]));
}

async function issueApplicationSession(response, session) {
  const rawToken = randomBytes(32).toString("hex");
  await createAuthSession({ id: randomUUID(), tokenHash: createHash("sha256").update(rawToken).digest("hex"), userId: session.accountId || null, hospitalId: session.hospitalId || null, role: session.role, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() });
  response.setHeader("Set-Cookie", `nabh_session=${encodeURIComponent(rawToken)}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}

async function requireApplicationSession(request, response, next) {
  try {
    const rawToken = requestCookies(request).nabh_session;
    if (!rawToken) return response.status(401).json({ error: "Authentication required." });
    const session = await readAuthSession(createHash("sha256").update(rawToken).digest("hex"));
    if (!session) return response.status(401).json({ error: "Authentication required." });
    request.appSession = session;
    next();
  } catch (error) { next(error); }
}

function requireHospitalAccess(request, response, next) {
  if (request.appSession?.role === "Super Admin" || request.appSession?.hospital_id === request.params.hospitalId || request.appSession?.hospitalId === request.params.hospitalId) return next();
  return response.status(403).json({ error: "You are not authorized to access this hospital." });
}

function requireSuperAdmin(request, response, next) {
  if (request.appSession?.role === "Super Admin") return next();
  return response.status(403).json({ error: "Super Admin access required." });
}

app.use("/api/admin", requireApplicationSession);
app.use("/api/admin/template-library", requireSuperAdmin);
app.use("/api/admin/smtp", requireSuperAdmin);
app.use("/api/admin/hospitals/:hospitalId", requireHospitalAccess);

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

app.get("/api/admin/hospitals", async (request, response, next) => {
  try {
    const targetHospitalId = request.appSession.hospital_id || request.appSession.hospitalId;
    if (request.query.view === "summary") {
      if (request.appSession.role === "Super Admin") return response.json(await readHospitalSummaries());
      const own = (await listHospitals()).find((item) => item.id === targetHospitalId);
      return response.json({ total: own ? 1 : 0, pending: own?.status === "pending" ? 1 : 0, active: own?.status === "active" ? 1 : 0, users: own?.users?.length || 0 });
    }
    if (request.query.view === "registry") {
      if (request.appSession.role === "Super Admin") {
        const registryHospitals = await readHospitalRegistry();
        return response.json({ hospitals: await Promise.all(registryHospitals.map(hydrateHospitalAccreditation)) });
      }
      const own = (await listHospitals()).find((item) => item.id === targetHospitalId);
      return response.json({ hospitals: own ? [own] : [] });
    }
    const allHospitals = await listHospitals();
    const visibleRaw = request.appSession.role === "Super Admin"
      ? allHospitals
      : allHospitals.filter((hospital) => hospital.id === targetHospitalId);
    const visible = await Promise.all((await backfillHospitalLogos(visibleRaw)).map(hydrateHospitalAccreditation));
    response.json({ hospitals: visible });
  } catch (error) { if (error instanceof Error && error.validationErrors) response.status(422).json({ error: error.message, fields: error.validationErrors }); else next(error); }
});

app.post("/api/admin/hospitals", async (request, response, next) => {
  try {
    if (request.appSession.role !== "Super Admin") return response.status(403).json({ error: "Super Admin access required." });
    const hospital = await persistHospitalLogo(await createHospital(request.body || {}));
    response.status(201).json({ hospital, repository: { mode: r2TemplateStorageEnabled() ? "r2" : "local", provisioned: false, pending: "accreditation" } });
  }
  catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/client-repository", async (request, response, next) => {
  try {
    const hospital = await hydrateHospitalAccreditation((await listHospitals()).find((item) => item.id === request.params.hospitalId));
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    requireActiveHospital(hospital);
    response.json({ repository: await provisionR2ClientRepository(hospital) });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/client-repository/sync", async (request, response, next) => {
  try {
    const hospital = await hydrateHospitalAccreditation((await listHospitals()).find((item) => item.id === request.params.hospitalId));
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    requireActiveHospital(hospital);
    if (!hasAcceptedAccreditation(hospital)) return response.status(400).json({ error: "Select and accept an NABH accreditation programme before syncing the document workspace.", reason: "accreditation_required" });
    response.status(202).json({ job: startRepositoryProvisioning(hospital, { syncNewTemplates: true }) });
  } catch (error) { next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/client-repository/status", async (request, response, next) => {
  try {
    const hospital = await hydrateHospitalAccreditation((await listHospitals()).find((item) => item.id === request.params.hospitalId));
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    const job = repositorySyncJobs.get(hospital.id);
    const repository = await getR2ClientRepositoryStatus(hospital.code, hospital.accreditation?.programme);
    response.json({ repository, job: job || null, profileComplete: isProfileComplete(hospital), missingProfileFields: missingProfileFields(hospital) });
  } catch (error) { next(error); }
});

app.patch("/api/admin/hospitals/:hospitalId", async (request, response, next) => {
  try { if (request.appSession?.role !== "Super Admin") return response.status(403).json({ error: "Super Admin access required." }); const hospital = await updateHospital(request.params.hospitalId, request.body || {}); if (!hospital) return response.status(404).json({ error: "Hospital not found." }); response.json({ hospital: await persistHospitalLogo(hospital) }); }
  catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/approve-onboarding", async (request, response, next) => {
  try {
    if (request.appSession?.role !== "Super Admin") return response.status(403).json({ error: "Super Admin access required." });
    const hospital = await approveHospitalOnboarding(request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    const creator = (hospital.users || []).find((user) => user.role === "Hospital Administrator") || hospital.users?.[0];
    if (creator?.email) {
      const approver = (await listHospitals()).flatMap((item) => item.users || []).find((user) => user.id === request.appSession.user_id);
      const configuredRecipient = configValue("ONBOARDING_APPROVAL_EMAIL_TO");
      const approverEmail = approver?.email || configValue("PLATFORM_ADMIN_EMAIL");
      const email = buildOnboardingApprovalEmail(hospital, creator, approverEmail);
      if (configuredRecipient && configuredRecipient.toLowerCase() !== creator.email.toLowerCase()) email.to = `${creator.email}, ${configuredRecipient}`;
      void withTimeout(sendEmail(email), 12000, "Onboarding approval email timed out.").catch((error) => console.error("Onboarding approval email failed:", error.message));
    }
    response.json({ hospital, email: { queued: Boolean(creator?.email) } });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.delete("/api/admin/hospitals/:hospitalId", async (request, response, next) => {
  try { if (request.appSession?.role !== "Super Admin") return response.status(403).json({ error: "Super Admin access required." }); if (!await deleteHospital(request.params.hospitalId)) return response.status(404).json({ error: "Hospital not found." }); response.status(204).end(); } catch (error) { next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/users", async (request, response, next) => {
  try { const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId); if (!hospital) return response.status(404).json({ error: "Hospital not found." }); requireActiveHospital(hospital); const user = await addHospitalUser(request.params.hospitalId, request.body || {}); response.status(201).json({ user }); }
  catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.patch("/api/admin/hospitals/:hospitalId/users/:userId", async (request, response, next) => {
  try { if (request.body?.role === "Super Admin" && request.appSession?.role !== "Super Admin") return response.status(403).json({ error: "Only a Super Admin can assign privileged roles." }); const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId); if (!hospital) return response.status(404).json({ error: "Hospital not found." }); requireActiveHospital(hospital); const user = await updateHospitalUser(request.params.hospitalId, request.params.userId, request.body || {}); if (!user) return response.status(404).json({ error: "User not found." }); response.json({ user }); }
  catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.delete("/api/admin/hospitals/:hospitalId/users/:userId", async (request, response, next) => {
  try { const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId); if (!hospital) return response.status(404).json({ error: "Hospital not found." }); requireActiveHospital(hospital); const deleted = await deleteHospitalUser(request.params.hospitalId, request.params.userId); if (!deleted) return response.status(404).json({ error: "User not found." }); response.status(204).end(); } catch (error) { next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/users", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    const users = (hospital.users || []).map(({ passwordSetupToken, passwordSetupExpiresAt, ...user }) => ({ ...user, hospitalId: hospital.id, hospitalName: hospital.name, hospitalCode: hospital.code }));
    response.json({ hospital: { id: hospital.id, name: hospital.name, code: hospital.code, status: hospital.status, logoPath: hospital.logoPath || "" }, users });
  } catch (error) { next(error); }
});

app.get("/api/admin/users", async (request, response, next) => {
  try {
    const allHospitals = await listHospitals();
    const hospitals = request.appSession.role === "Super Admin" ? allHospitals : allHospitals.filter((hospital) => hospital.id === request.appSession.hospital_id || hospital.id === request.appSession.hospitalId);
    response.json({ users: hospitals.flatMap((hospital) => (hospital.users || []).map(({ passwordSetupToken, passwordSetupExpiresAt, ...user }) => ({ ...user, hospitalId: hospital.id, hospitalName: hospital.name, hospitalCode: hospital.code }))) });
  } catch (error) { next(error); }
});

app.get("/api/admin/me/profile", async (request, response, next) => {
  try {
    const hospitalId = request.appSession?.hospital_id || request.appSession?.hospitalId;
    const userId = request.appSession?.user_id || request.appSession?.userId;
    const hospital = (await listHospitals()).find((item) => item.id === hospitalId);
    const user = hospital?.users?.find((item) => item.id === userId || String(item.userId) === String(userId));
    if (!hospital || !user) return response.status(404).json({ error: "Current user profile not found." });
    const { passwordHash, passwordSalt, passwordSetupToken, passwordSetupExpiresAt, ...profile } = user;
    response.json({ user: profile, hospital: { id: hospital.id, name: hospital.name, code: hospital.code, status: hospital.status } });
  } catch (error) { next(error); }
});

// Re-resolves the current user's role/permissions live so role edits take effect without a full re-login.
app.get("/api/admin/me/session", async (request, response, next) => {
  try {
    if (request.appSession?.role === "Super Admin") return response.json({ role: "Super Admin", permissions: [...roleActions] });
    const hospitalId = request.appSession?.hospital_id || request.appSession?.hospitalId;
    const userId = request.appSession?.user_id || request.appSession?.userId;
    const hospital = (await listHospitals()).find((item) => item.id === hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    const user = hospital.users?.find((item) => item.id === userId || String(item.userId) === String(userId));
    if (!user) return response.status(404).json({ error: "Session user not found." });
    const roles = await listHospitalRoles(hospital.id, hospital);
    const role = roles.find((item) => item.name === user.role);
    response.json({ role: user.role, permissions: role?.permissions || ["view_documents"], hospitalId: hospital.id, hospitalName: hospital.name, hospitalLogoPath: hospital.logoPath });
  } catch (error) { next(error); }
});

app.post("/api/admin/smtp/verify", async (_request, response) => {
  try { response.json(await withTimeout(verifySmtp(), 12000, "SMTP verification timed out.")); }
  catch (error) { response.status(502).json({ configured: Boolean(process.env.SMTP_HOST), verified: false, error: error.message }); }
});

app.post("/api/admin/users/:userId/reset-password", async (request, response, next) => {
  try {
    if (request.appSession.role !== "Super Admin") return response.status(403).json({ error: "Super Admin access required." });
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
    const hospital = await hydrateHospitalAccreditation((await listHospitals()).find((item) => item.id === request.params.hospitalId));
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    requireActiveHospital(hospital);
    if (!hospital.users?.some((user) => user.id === request.params.userId)) return response.status(404).json({ error: "User not found for this hospital." });
    const found = await resetHospitalUserPassword(request.params.userId);
    const origin = process.env.PUBLIC_BASE_URL || `${request.protocol}://${request.get("host")}`;
    const email = await sendEmail(buildWelcomeEmail(found.hospital, found.user, `${origin}/?setPasswordToken=${found.user.passwordSetupToken}`));
    response.json({ user: { id: found.user.id, name: found.user.name, email: found.user.email }, email });
  } catch (error) { next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/roles", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    const roles = await listHospitalRoles(request.params.hospitalId, hospital);
    response.json({ roles, hospital: { status: hospital.status, logoPath: hospital.logoPath || "" } });
  } catch (error) { next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/roles", async (request, response, next) => {
  try { const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId); if (!hospital) return response.status(404).json({ error: "Hospital not found." }); requireActiveHospital(hospital); const role = await createHospitalRole(request.params.hospitalId, request.body || {}); response.status(201).json({ role }); } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.patch("/api/admin/hospitals/:hospitalId/roles/:roleId", async (request, response, next) => {
  try { const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId); if (!hospital) return response.status(404).json({ error: "Hospital not found." }); requireActiveHospital(hospital); const role = await updateHospitalRole(request.params.hospitalId, request.params.roleId, request.body || {}); if (!role) return response.status(404).json({ error: "Role not found." }); response.json({ role }); } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.delete("/api/admin/hospitals/:hospitalId/roles/:roleId", async (request, response, next) => {
  try { const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId); if (!hospital) return response.status(404).json({ error: "Hospital not found." }); requireActiveHospital(hospital); const deleted = await deleteHospitalRole(request.params.hospitalId, request.params.roleId); if (!deleted) return response.status(404).json({ error: "Role not found." }); response.status(204).end(); } catch (error) { next(error); }
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
      documentId: templatePath,
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
      const summaries = await readTemplateQuestionnaireSummaries(programme);
      const countByPath = new Map(summaries.map((item) => [item.templatePath, item.questionCount]));
      const departments = Object.fromEntries(Object.entries(programmeTemplateDepartments(templateFiles)).map(([category, documents]) => [category, documents.map((document) => ({ ...document, questionCount: countByPath.get(document.templatePath) || 0 }))]));
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

app.get("/api/admin/template-library/questionnaire-report", async (request, response, next) => {
  try {
    const requestedProgramme = String(request.query.programme || "").trim();
    const programmes = requestedProgramme ? [requestedProgramme] : NABH_ACCREDITATION_PROGRAMMES;
    if (requestedProgramme && !NABH_ACCREDITATION_PROGRAMMES.includes(requestedProgramme)) return response.status(400).json({ error: "Unknown NABH accreditation programme." });
    const documents = [];
    for (const programme of programmes) {
      const summaries = await readTemplateQuestionnaireSummaries(programme);
      for (const summary of summaries) {
        const category = summary.templatePath.split("/")[0] || "Other";
        const questionnaire = await readTemplateQuestionnaire(programme, summary.templatePath);
        documents.push({ programme, department: NABH_WORKSPACE_CATEGORIES.includes(category) ? category : classifyDocument(summary.templatePath), documentName: path.basename(summary.templatePath).replace(/_TEMPLATE\.[^.]+$/i, "").replace(/\.[^.]+$/, ""), templatePath: summary.templatePath, questionCount: summary.questionCount, updatedAt: summary.updatedAt, questions: questionnaire?.questions || [] });
      }
    }
    response.json({ programmes, documents });
  } catch (error) { next(error); }
});

app.get("/api/admin/template-library/questionnaire-report.pdf", async (request, response, next) => {
  try {
    const summaries = await readTemplateQuestionnaireSummaries();
    const documents = [];
    for (const summary of summaries) {
      const questionnaire = await readTemplateQuestionnaire(summary.programme, summary.templatePath);
      documents.push({ documentName: `${summary.programme} - ${path.basename(summary.templatePath).replace(/_TEMPLATE\.[^.]+$/i, "").replace(/\.[^.]+$/, "")}`, programme: summary.programme, questions: questionnaire?.questions || [], answers: {}, generatedAt: summary.updatedAt });
    }
    const pdf = await createTemplateQuestionnaireReportPdf({ documents });
    response.type("application/pdf").attachment("template-questionnaire-report.pdf").send(pdf);
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.get("/api/admin/template-library/questions", async (request, response, next) => {
  try {
    const programme = String(request.query.programme || "").trim();
    const templatePath = String(request.query.path || "").trim();
    if (!NABH_ACCREDITATION_PROGRAMMES.includes(programme) || !templatePath || templatePath.includes("..")) return response.status(400).json({ error: "A valid programme and template path are required." });
    response.json({ questionnaire: await readTemplateQuestionnaire(programme, templatePath) });
  } catch (error) { next(error); }
});

app.put("/api/admin/template-library/questions", async (request, response, next) => {
  try {
    const programme = String(request.body?.programme || "").trim();
    const templatePath = String(request.body?.templatePath || "").trim();
    if (!NABH_ACCREDITATION_PROGRAMMES.includes(programme) || !templatePath || templatePath.includes("..")) return response.status(400).json({ error: "A valid programme and template path are required." });
    const questions = validateQuestionnaireDefinition(request.body);
    const questionnaire = await saveTemplateQuestionnaire(programme, templatePath, questions);
    response.json({ questionnaire });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
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
  const [questionnaireSummaries, clientFiles] = await Promise.all([
    readTemplateQuestionnaireSummaries(programme),
    listR2ClientFiles(hospital.code, programme)
  ]);
  const questionCountByPath = new Map(questionnaireSummaries.map((item) => [item.templatePath, item.questionCount]));
  const departments = Object.fromEntries(NABH_WORKSPACE_CATEGORIES.map((category) => [category, []]));
  for (const templatePath of clientFiles) {
    if (path.basename(templatePath) === masterListTemplateFile) continue;
    const [folder] = templatePath.split("/");
    const department = NABH_WORKSPACE_CATEGORIES.includes(folder) ? folder : classifyDocument(path.basename(templatePath));
    const documentName = path.basename(templatePath).replace(/_TEMPLATE\.[^.]+$/i, "").replace(/\.[^.]+$/, "");
    const docKey = getDocumentKey("", documentName, templatePath);
    departments[department].push({
      documentName,
      documentId: "",
      id: `${department}:${docKey}`,
      active: true,
      confidence: "high",
      matchedFilePath: templatePath,
      relativeFilePath: templatePath,
      questionCount: questionCountByPath.get(templatePath) || 0,
      version: null,
      approved: false,
      history: []
    });
  }
  for (const documents of Object.values(departments)) documents.sort((left, right) => left.documentName.localeCompare(right.documentName));
  return departments;
}

async function recordDocumentStatusAudit(hospital, documentId, previousStatus, entry, action, documentContext = {}) {
  let document = documentContext;
  if (!document.documentName) {
    const departments = await loadHospitalDepartments(hospital);
    document = Object.entries(departments).flatMap(([department, documents]) => documents.map((item) => ({ ...item, department }))).find((item) => item.id === documentId) || {};
  }
  const auditEntry = {
    hospitalId: hospital.id,
    hospitalCode: hospital.code,
    documentId,
    documentName: document.documentName || documentId,
    department: document.department || "",
    action: action || "readiness status changed",
    approvedBy: entry.updatedBy,
    note: `${previousStatus.replace(/_/g, " ")} -> ${entry.status.replace(/_/g, " ")}${entry.note ? `: ${entry.note}` : ""}`,
    previousStatus,
    status: entry.status,
    timestamp: entry.updatedAt
  };
  if (r2TemplateStorageEnabled() && !usesPostgresDataStore()) return recordR2ClientAuditEvent(hospital, auditEntry);
  await appendDocumentAudit(auditEntry);
  return auditEntry;
}

async function getPersistentDocumentStatus(hospital) {
  return r2TemplateStorageEnabled() && !usesPostgresDataStore() ? getR2ClientDocumentStatuses(hospital.code, hospital.accreditation?.programme) : getHospitalDocumentStatus(hospital.id);
}

async function requireDocumentUnlockedForMutation(hospital, documentId) {
  const statuses = await getPersistentDocumentStatus(hospital);
  let statusKey = documentId;
  if (!statuses[statusKey]) {
    const departments = await loadHospitalDepartments(hospital);
    const document = Object.values(departments).flat().find((item) => item.id === documentId || item.documentId === documentId);
    statusKey = document?.id || documentId;
  }
  const currentStatus = statuses[statusKey]?.status || "not_started";
  if (["approved", "implemented", "evidence_available"].includes(currentStatus)) {
    const error = new Error(`This document is ${currentStatus.replace(/_/g, " ")} and locked. Reopen it for revision before making another change.`);
    error.status = 409;
    error.reason = "document_locked";
    throw error;
  }
  return { statusKey, currentStatus };
}

async function persistDocumentStatus(hospital, documentId, status, updatedBy, note, currentStatus) {
  const entry = await setHospitalDocumentStatus(hospital.id, documentId, status, updatedBy, note, currentStatus);
  if (r2TemplateStorageEnabled() && !usesPostgresDataStore()) await saveR2ClientDocumentStatuses(hospital.code, hospital.accreditation?.programme, { ...await getPersistentDocumentStatus(hospital), [documentId]: entry });
  return entry;
}

app.use("/api/admin/hospitals/:hospitalId/documents", requireCompleteProfileMiddleware);

app.get("/api/admin/hospitals/:hospitalId/documents", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    if (!hasAcceptedAccreditation(hospital)) return response.status(400).json({ error: "Select and accept an NABH accreditation programme before the document workspace is available.", reason: "accreditation_required" });
    const repository = await getR2ClientRepositoryStatus(hospital.code, hospital.accreditation?.programme);
    if (!repository.exists) return response.status(404).json({ error: "Hospital document repository has not been initialized.", repository, job: repositorySyncJobs.get(hospital.id) || null });
    const [hospitalStatus, departments] = await Promise.all([
      getPersistentDocumentStatus(hospital),
      loadHospitalDepartments(hospital)
    ]);
    response.json({ departments: withDocumentStatus(departments, hospitalStatus), repository, job: repositorySyncJobs.get(hospital.id) || null });
  } catch (error) { next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/documents/:documentId/evidence", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    const evidence = await listDocumentEvidence(hospital.id, request.params.documentId);
    response.json({ evidence });
  } catch (error) { next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/documents/:documentId/evidence", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    requireActiveHospital(hospital);
    const departments = await loadHospitalDepartments(hospital);
    const documentExists = Object.values(departments).flat().some((document) => document.id === request.params.documentId);
    if (!documentExists) return response.status(404).json({ error: "Document not found in this hospital workspace." });
    const persistentStatus = await getPersistentDocumentStatus(hospital);
    const previousStatus = persistentStatus[request.params.documentId]?.status || "not_started";
    const uploadedBy = String(request.body?.uploadedBy || "").trim();
    const result = await createEvidence(hospital, request.params.documentId, request.body || {}, uploadedBy, previousStatus);
    if (r2TemplateStorageEnabled() && !usesPostgresDataStore()) await saveR2ClientDocumentStatuses(hospital.code, hospital.accreditation?.programme, { ...persistentStatus, [request.params.documentId]: result.entry });
    await recordDocumentStatusAudit(hospital, request.params.documentId, result.previousStatus, result.entry, "evidence uploaded", { documentName: request.body?.documentName, department: request.body?.department });
    response.status(201).json(result);
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/evidence/:evidenceId/file", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    const result = await getEvidenceFile(hospital, request.params.evidenceId);
    if (!result) return response.status(404).json({ error: "Evidence not found." });
    response.setHeader("Content-Type", result.evidence.mimeType);
    response.setHeader("Content-Disposition", `inline; filename="${result.evidence.fileName.replace(/[^a-zA-Z0-9._-]/g, "-")}"`);
    response.send(result.buffer);
  } catch (error) { next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/document-status", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    requireCompleteHospitalProfile(hospital);
    response.json({ status: await getPersistentDocumentStatus(hospital), statuses: DOCUMENT_STATUSES });
  } catch (error) { if (error?.reason === "profile_incomplete") response.status(error.status).json({ error: error.message, reason: error.reason, missingProfileFields: error.missingProfileFields }); else next(error); }
});

app.patch("/api/admin/hospitals/:hospitalId/document-status", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    requireActiveHospital(hospital);
    requireCompleteHospitalProfile(hospital);
    const { documentId, status, updatedBy, note, documentName, department } = request.body || {};
    if (["approved", "implemented", "evidence_available"].includes(status) && !String(updatedBy || "").trim()) return response.status(400).json({ error: "Enter the user name before approving, implementing, or marking evidence available." });
    if (["approved", "implemented", "evidence_available"].includes(status) && !String(note || "").trim()) return response.status(400).json({ error: "Enter notes for the audit log before approving, implementing, or marking evidence available." });
    const previousStatus = (await getPersistentDocumentStatus(hospital))[documentId]?.status || "not_started";
    const entry = await persistDocumentStatus(hospital, documentId, status, updatedBy, note, previousStatus);
    await recordDocumentStatusAudit(hospital, documentId, previousStatus, entry, undefined, { documentName, department });
    response.json({ documentId, entry });
  } catch (error) { if (error?.reason === "profile_incomplete") response.status(error.status).json({ error: error.message, reason: error.reason, missingProfileFields: error.missingProfileFields }); else if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/workspace-overview", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    requireCompleteHospitalProfile(hospital);
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
  } catch (error) { if (error?.reason === "profile_incomplete") response.status(error.status).json({ error: error.message, reason: error.reason, missingProfileFields: error.missingProfileFields }); else next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/accreditation", async (request, response, next) => {
  try {
    const hospitals = await listHospitals();
    const hospital = await hydrateHospitalAccreditation(hospitals.find((item) => item.id === request.params.hospitalId));
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    const state = { recommendation: (await getAccreditationState(hospital.id))?.recommendation, selection: hospital.accreditation || null, programmes: NABH_ACCREDITATION_PROGRAMMES };
    if (!state) return response.status(404).json({ error: "Hospital not found." });
    response.json(state);
  } catch (error) { next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/accreditation", async (request, response, next) => {
  try {
    const hospital = await hydrateHospitalAccreditation((await listHospitals()).find((item) => item.id === request.params.hospitalId));
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    requireActiveHospital(hospital);
    const selection = await selectAccreditationProgramme(request.params.hospitalId, request.body?.programme, request.body?.decidedBy, request.body?.notes);
    if (r2TemplateStorageEnabled() && !usesPostgresDataStore()) await saveR2HospitalAccreditation(hospital.code, selection);
    // Force a full resync so switching programmes always overwrites any same-named files
    // left over from a previously selected programme, instead of skipping existing ones.
    const job = r2TemplateStorageEnabled() ? startRepositoryProvisioning({ ...hospital, accreditation: selection }, { syncNewTemplates: true }) : null;
    response.json({ selection, job });
  } catch (error) { if (error?.reason === "accreditation_locked") response.status(error.status).json({ error: error.message, reason: error.reason }); else if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.patch("/api/admin/hospitals/:hospitalId/profile", async (request, response, next) => {
  try {
    const current = await hydrateHospitalAccreditation((await listHospitals()).find((item) => item.id === request.params.hospitalId));
    if (!current) return response.status(404).json({ error: "Hospital not found." });
    requireActiveHospital(current);
    const hospital = await submitHospitalProfile(request.params.hospitalId, request.body?.details, request.body?.logoDataUrl);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    response.json({ hospital: await persistHospitalLogo(hospital), profileComplete: isProfileComplete(hospital), missingProfileFields: missingProfileFields(hospital) });
  } catch (error) { if (error instanceof Error && error.validationErrors) response.status(422).json({ error: error.message, fields: error.validationErrors }); else next(error); }
});

app.post("/api/register", async (request, response, next) => {
  try {
    const createdHospital = await registerHospital(request.body || {});
    const user = createdHospital.users[0];
    await appendUserAuditEvent({ hospitalId: createdHospital.id, action: "hospital_registration_requested", entityType: "hospital", entityId: createdHospital.id, metadata: { email: request.body?.adminEmail || "" }, ipAddress: request.ip, userAgent: request.get("user-agent") });
    const origin = process.env.PUBLIC_BASE_URL || `${request.protocol}://${request.get("host")}`;
    const setupLink = `${origin}/?setPasswordToken=${createdHospital.registrationToken || user.passwordSetupToken}`;
    const { passwordSetupToken, passwordSetupExpiresAt, ...safeUser } = user;
    // The document workspace is not provisioned yet: it requires an accepted accreditation
    // programme first (see POST /api/admin/hospitals/:hospitalId/accreditation).
    response.status(201).json({ hospital: { ...createdHospital, users: [safeUser] }, repository: { mode: r2TemplateStorageEnabled() ? "r2" : "local", provisioned: false, pending: "accreditation" }, email: { delivered: null, transport: "pending" } });
    void withTimeout(persistHospitalLogo(createdHospital), 12000, "Hospital logo upload timed out.").catch((error) => console.error("Hospital logo upload failed after registration:", error.message));
    void withTimeout(sendEmail(buildWelcomeEmail(createdHospital, user, setupLink)), 12000, "Email delivery timed out.").catch((error) => console.error("Welcome email failed after registration:", error.message));
    if (process.env.PLATFORM_ADMIN_EMAIL) void withTimeout(sendEmail({ ...buildWelcomeEmail(createdHospital, user, setupLink), to: process.env.PLATFORM_ADMIN_EMAIL, subject: `New hospital registration: ${createdHospital.name}` }), 12000, "Platform admin notification timed out.").catch((error) => console.error("Platform admin notification failed:", error.message));
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/registration/resend", async (request, response, next) => {
  try {
    if (request.appSession?.role !== "Super Admin") return response.status(403).json({ error: "Super Admin access required." });
    const result = await resendRegistrationToken(request.params.hospitalId);
    if (!result) return response.status(404).json({ error: "Hospital administrator not found." });
    const origin = process.env.PUBLIC_BASE_URL || `${request.protocol}://${request.get("host")}`;
    const setupLink = `${origin}/?setPasswordToken=${result.token}`;
    const email = await sendEmail(buildWelcomeEmail(result.hospital, result.user, setupLink));
    response.json({ email: { delivered: email.delivered, transport: email.transport } });
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
    const locationParts = String(found.hospital.location || "").split(",").map((s) => s.trim()).filter(Boolean);
    const address = found.hospital.details?.addressLine1 || locationParts[0] || "";
    const city = found.hospital.details?.city || locationParts[0] || "";
    const contactPhone = found.user.contactPhone || found.hospital.details?.responsiblePhone || found.hospital.details?.mainPhone || "";
    response.json({ hospitalName: found.hospital.name, hospitalCode: found.hospital.code, address, city, adminName: found.user.name, email: found.user.email, contactPhone });
  } catch (error) { next(error); }
});

app.post("/api/set-password", async (request, response, next) => {
  try {
    const { hospital, user } = await completePasswordSetup(request.body?.token, request.body?.password, { code: request.body?.hospitalCode, addressLine1: request.body?.addressLine1, city: request.body?.city, contactPhone: request.body?.contactPhone });
    await appendUserAuditEvent({ hospitalId: hospital.id, userId: user.id, action: "registration_completed", entityType: "user", entityId: user.id, ipAddress: request.ip, userAgent: request.get("user-agent") });
    const role = hospital.roles?.find((item) => item.name === user.role);
    const session = { role: user.role, userId: user.userId, accountId: user.id, permissions: role?.permissions || ["view"], hospitalId: hospital.id, hospitalName: hospital.name, hospitalLogoPath: hospital.logoPath };
    await issueApplicationSession(response, session);
    response.json({ session });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.post("/api/login", async (request, response, next) => {
  try {
    const userId = String(request.body?.userId || request.body?.email || "").trim();
    const password = String(request.body?.password || "");
    if (userId.toLowerCase() === "superadmin" && password === "Admin@123") {
      const session = { role: "Super Admin" };
      await issueApplicationSession(response, session);
      return response.json({ session });
    }
    const authenticated = await verifyHospitalAdminPassword(userId, password);
    if (!authenticated) return response.status(401).json({ error: "Invalid credentials." });
    const { hospital, user } = authenticated;
    await appendUserAuditEvent({ hospitalId: hospital.id, userId: user.id, action: "login", entityType: "user", entityId: user.id, ipAddress: request.ip, userAgent: request.get("user-agent") });
    const hospitalWithLogo = await backfillHospitalLogos([hospital]);
    const role = hospital.roles?.find((item) => item.name === user.role);
    const session = { role: user.role, userId: user.userId, accountId: user.id, permissions: role?.permissions || ["view"], hospitalId: hospital.id, hospitalName: hospital.name, hospitalLogoPath: hospitalWithLogo[0].logoPath };
    await issueApplicationSession(response, session);
    response.json({ session });
  } catch (error) { if (error?.reason === "registration_incomplete") response.status(error.status || 403).json({ error: error.message, reason: error.reason }); else next(error); }
});

app.post("/api/logout", async (request, response, next) => {
  try {
    const rawToken = requestCookies(request).nabh_session;
    if (rawToken) await revokeAuthSession(createHash("sha256").update(rawToken).digest("hex"));
    response.setHeader("Set-Cookie", "nabh_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax");
    response.status(204).end();
  } catch (error) { next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/documents/action", async (request, response, next) => {
  try {
    const { documentId, action, updatedBy, note } = request.body || {};
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    requireActiveHospital(hospital);
    if (action === "approve") {
      const templatePath = String(request.body?.templatePath || "").trim();
      const questionnaire = await getDocumentQuestions(hospital, documentId, request.body?.documentName, templatePath);
      const draft = await getDocumentDraft(hospital.id, documentId);
      const requiredQuestions = (questionnaire.questions || []).filter((question) => question.required !== false);
      const savedAnswers = draft?.answers || {};
      const missing = requiredQuestions.filter((question) => !String(savedAnswers[question.id] || "").trim());
      if (missing.length) {
        return response.status(422).json({
          error: `This document cannot be approved until all mandatory questions are answered: ${missing.map((question) => question.label).join(", ")}. Complete the questionnaire and generate the draft before approval.`,
        });
      }
    }
    const persistentStatus = await getPersistentDocumentStatus(hospital);
    const previousStatus = persistentStatus[documentId]?.status || "not_started";
    const entry = await performDocumentAction(request.params.hospitalId, documentId, action, updatedBy, note, previousStatus);
    if (r2TemplateStorageEnabled() && !usesPostgresDataStore()) await saveR2ClientDocumentStatuses(hospital.code, hospital.accreditation?.programme, { ...persistentStatus, [documentId]: entry });
    await recordDocumentStatusAudit(hospital, documentId, previousStatus, entry, action.replace(/-/g, " "), { documentName: request.body?.documentName, department: request.body?.department });
    response.json({ documentId, entry });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/document-questions", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    requireActiveHospital(hospital);
    requireCompleteHospitalProfile(hospital);
    const documentId = String(request.query.documentId || "").trim();
    if (!documentId) return response.status(400).json({ error: "documentId is required." });
    response.json(await getDocumentQuestions(hospital, documentId, request.query.documentName, request.query.templatePath));
  } catch (error) { if (error?.reason === "profile_incomplete") response.status(error.status).json({ error: error.message, reason: error.reason, missingProfileFields: error.missingProfileFields }); else if (error instanceof Error) response.status(error.validationErrors ? 422 : 400).json({ error: error.message, fields: error.validationErrors }); else next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/document-draft", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    requireActiveHospital(hospital);
    requireCompleteHospitalProfile(hospital);
    const documentId = String(request.query.documentId || "").trim();
    if (!documentId) return response.status(400).json({ error: "documentId is required." });
    response.json({ draft: await getDocumentDraft(hospital.id, documentId) });
  } catch (error) { if (error?.reason === "profile_incomplete") response.status(error.status).json({ error: error.message, reason: error.reason, missingProfileFields: error.missingProfileFields }); else next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/document-draft", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    requireActiveHospital(hospital);
    requireCompleteHospitalProfile(hospital);
    const { documentId, documentName, answers } = request.body || {};
    await requireDocumentUnlockedForMutation(hospital, documentId);
    const prepared = await prepareDocumentDraft(hospital, documentId, documentName, answers, request.body?.templatePath);
    await saveDocumentAnswers(hospital.id, documentId, prepared.answers, prepared.questionnaire);
    const draft = await generateDocumentDraft(hospital, documentId, documentName, prepared.answers);
    response.status(201).json({ draft, questionnaire: prepared.questionnaire });
  } catch (error) { if (error?.reason === "profile_incomplete" || error?.reason === "document_locked") response.status(error.status).json({ error: error.message, reason: error.reason }); else if (error instanceof Error) response.status(error.validationErrors ? 422 : 400).json({ error: error.message, fields: error.validationErrors }); else next(error); }
});

async function hospitalQuestionnaireReport(hospital) {
  const departments = await loadHospitalDepartments(hospital);
  const storedAnswers = await readDocumentAnswers(hospital.id);
  const documents = [];
  for (const [department, departmentDocuments] of Object.entries(departments)) {
    for (const document of departmentDocuments) {
      const templatePath = document.relativeFilePath || document.matchedFilePath || "";
      const questionnaire = templatePath ? await readTemplateQuestionnaire(hospital.accreditation?.programme, templatePath) : null;
      documents.push({
        documentId: document.id,
        documentName: document.documentName,
        department,
        templatePath,
        programme: hospital.accreditation?.programme || "",
        questions: questionnaire?.questions || [],
        answers: storedAnswers[document.id]?.answers || {},
        generatedAt: storedAnswers[document.id]?.updatedAt || new Date().toISOString()
      });
    }
  }
  return { hospitalId: hospital.id, programme: hospital.accreditation?.programme || "", documents };
}

app.get("/api/admin/hospitals/:hospitalId/questionnaire-report", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    requireActiveHospital(hospital);
    response.json(await hospitalQuestionnaireReport(hospital));
  } catch (error) { next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/questionnaire-report.pdf", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    requireActiveHospital(hospital);
    const report = await hospitalQuestionnaireReport(hospital);
    const pdf = await createHospitalQuestionnaireReportPdf({ hospital, documents: report.documents.filter((document) => document.questions.length || Object.keys(document.answers).length) });
    response.type("application/pdf").attachment(`${(hospital.code || "hospital").toLowerCase()}-questionnaire-report.pdf`).send(pdf);
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
    requireActiveHospital(hospital);
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
    requireActiveHospital(hospital);
    response.status(201).json({ booking: await createBooking(hospital.id, request.body || {}) });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.patch("/api/admin/bookings/:bookingId", async (request, response, next) => {
  try {
    const bookingRecord = await readBookingById(request.params.bookingId);
    if (!bookingRecord) return response.status(404).json({ error: "Booking not found." });
    if (request.appSession?.role !== "Super Admin" && request.appSession?.hospital_id !== bookingRecord.hospitalId && request.appSession?.hospitalId !== bookingRecord.hospitalId) return response.status(403).json({ error: "You are not authorized to access this booking." });
    const booking = await updateBookingStatus(request.params.bookingId, request.body?.status, request.body?.updatedBy);
    if (!booking) return response.status(404).json({ error: "Booking not found." });
    response.json({ booking });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.post("/api/admin/bookings/:bookingId/recording", async (request, response, next) => {
  try {
    const bookingRecord = await readBookingById(request.params.bookingId);
    if (!bookingRecord) return response.status(404).json({ error: "Booking not found." });
    if (request.appSession?.role !== "Super Admin" && request.appSession?.hospital_id !== bookingRecord.hospitalId && request.appSession?.hospitalId !== bookingRecord.hospitalId) return response.status(403).json({ error: "You are not authorized to access this booking." });
    const booking = await attachBookingRecording(request.params.bookingId, request.body || {});
    if (!booking) return response.status(404).json({ error: "Booking not found." });
    response.json({ booking });
  } catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/documents/approve", express.raw({ type: "application/octet-stream", limit: "50mb" }), async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    requireActiveHospital(hospital);
    if (!String(request.get("X-Approved-By") || "").trim()) return response.status(400).json({ error: "Enter the user name before approving this document version." });
    if (!String(request.get("X-Approval-Note") || "").trim()) return response.status(400).json({ error: "Enter approval notes for the audit log before approving this document version." });
    await requireDocumentUnlockedForMutation(hospital, request.get("X-Document-Id"));
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
  } catch (error) { if (error?.reason === "document_locked") response.status(error.status).json({ error: error.message, reason: error.reason }); else if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
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
  const requestedId = request.params.hospitalId;
  if (!requestedId) {
    const error = new Error("Hospital ID is required.");
    error.status = 400;
    throw error;
  }
  const hospital = hospitals.find((item) => item.id === requestedId || item.code === requestedId);
  if (!hospital) {
    const error = new Error("Hospital not found.");
    error.status = 404;
    throw error;
  }
  const sessionHospitalId = request.appSession?.hospital_id || request.appSession?.hospitalId;
  if (request.appSession?.role !== "Super Admin" && sessionHospitalId !== hospital.id) {
    const error = new Error("You are not authorized to access this hospital.");
    error.status = 403;
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
  if (!norm || norm.startsWith("/") || norm.split("/").includes("..")) return null;

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
      const localRoot = path.resolve(templateRoot);
      const localPath = path.resolve(localRoot, cand);
      if (!localPath.startsWith(`${localRoot}${path.sep}`)) continue;
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

app.get("/api/admin/hospitals/:hospitalId/documents/version-manifest", async (request, response, next) => {
  try {
    const hospital = await findHospital(request);
    const documentKey = String(request.query.documentKey || "").trim();
    if (!documentKey) return response.status(400).json({ error: "documentKey is required." });
    // Must resolve the same key used when the version was approved (documentId takes priority over path there too).
    const resolvedKey = getDocumentKey(request.query.documentId, request.query.documentName, documentKey);
    response.json({ manifest: await getR2ClientVersionManifest(hospital.code, resolvedKey, hospital.accreditation?.programme) });
  } catch (error) { next(error); }
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
    const limit = Number(request.query.limit || 500);
    const cappedLimit = Math.min(Number(limit) > 0 ? Number(limit) : 500, 1000);
    const offset = Math.max(Number(request.query.offset || 0) || 0, 0);
    const requested = cappedLimit + 1;
    const entries = r2TemplateStorageEnabled() && !usesPostgresDataStore()
      ? (await listR2ClientAuditEvents(hospital.code, hospital.accreditation?.programme)).slice(offset, offset + requested)
      : await readDocumentAuditByHospital(hospital.id, requested, offset);
    response.json({ entries: entries.slice(0, cappedLimit), limit: cappedLimit, offset, hasMore: entries.length > cappedLimit });
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

app.use("/api/document-audit", requireApplicationSession);
app.get("/api/document-audit", async (request, response, next) => {
  try {
    if (request.appSession?.role !== "Super Admin") return response.status(403).json({ error: "Super Admin access required." });
    const limit = Number(request.query.limit || 250);
    const cappedLimit = Math.min(Number(limit) > 0 ? Number(limit) : 250, 1000);
    const offset = Math.max(Number(request.query.offset || 0) || 0, 0);
    const hospitals = await listHospitals();
    if (!r2TemplateStorageEnabled() || usesPostgresDataStore()) {
      const byId = new Map(hospitals.map((hospital) => [hospital.id, hospital]));
      const byCode = new Map(hospitals.map((hospital) => [hospital.code, hospital]));
      const entries = (await readDocumentAudit()).map((entry) => {
        const hospital = byId.get(entry.hospitalId) || byCode.get(entry.hospitalCode);
        return hospital ? { ...entry, hospitalName: entry.hospitalName || hospital.name, hospitalCode: entry.hospitalCode || hospital.code } : entry;
      }).sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
      const page = entries.slice(offset, offset + cappedLimit + 1);
      return response.json({ entries: page.slice(0, cappedLimit), limit: cappedLimit, offset, hasMore: page.length > cappedLimit });
    }
    const clientEntries = await Promise.all(hospitals.filter((hospital) => hospital.accreditation?.programme).map(async (hospital) => (await listR2ClientAuditEvents(hospital.code, hospital.accreditation.programme)).map((entry) => ({ ...entry, hospitalCode: hospital.code, hospitalName: hospital.name }))));
    const entries = [...await listR2TemplateAuditEvents(), ...clientEntries.flat()].sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
    const page = entries.slice(offset, offset + cappedLimit + 1);
    response.json({ entries: page.slice(0, cappedLimit), limit: cappedLimit, offset, hasMore: page.length > cappedLimit });
  } catch (error) { next(error); }
});

app.post("/api/documents/:department/:id/onlyoffice", async (request, response, next) => {
  try {
    if (!request.appSession) return response.status(401).json({ error: "Authentication required." });
    if (request.appSession.role !== "Super Admin") return response.status(403).json({ error: "OnlyOffice editing is currently available to Super Admins." });
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
    if (!request.appSession) return response.status(401).json({ error: "Authentication required." });
    if (request.appSession.role !== "Super Admin") return response.status(403).json({ error: "Document content access requires Super Admin authorization." });
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
    if (request.appSession?.role !== "Super Admin") return response.status(403).json({ error: "Super Admin access required." });
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
    if (request.appSession?.role !== "Super Admin") return response.status(403).json({ error: "Super Admin access required." });
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
app.use("/api", (request, response) => {
  response.status(404).json({ error: "API endpoint not found.", path: request.path });
});
app.use("/api", (error, request, response, next) => {
  if (response.headersSent) return next(error);
  console.error(`API error ${request.method} ${request.originalUrl}:`, error);
  response.status(error.status || 500).json({ error: error.message || "Internal API error." });
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
