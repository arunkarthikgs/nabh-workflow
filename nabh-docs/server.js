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
import { addHospitalUser, createHospital, createHospitalRole, deleteHospital, deleteHospitalRole, deleteHospitalUser, listHospitalRoles, listHospitals, updateHospital, updateHospitalRole, updateHospitalUser } from "./services/shared/hospitalAdminService.js";
import { createOnlyOfficeService } from "./services/shared/onlyOfficeService.js";
import { getDepartmentBoost } from "./services/shared/departmentAliases.js";
import { similarity } from "./services/shared/textSimilarity.js";
import { customizeDocumentTemplate } from "./services/shared/documentCustomizer.js";
import { approveR2ClientDocumentVersion, getDocumentKey, getR2ClientFile, getR2ClientRepositoryStatus, getR2ClientVersionFile, getR2ClientVersionManifests, getR2TemplateFile, listR2ClientAuditEvents, listR2ClientFiles, listR2TemplateFiles, provisionR2ClientRepository, r2TemplateStorageEnabled, r2TemplateStorageInfo } from "./services/shared/r2TemplateService.js";

const app = express();
const webBuildDir = fileURLToPath(new URL("./web/dist", import.meta.url));
const prototypeDir = fileURLToPath(new URL("./prototype", import.meta.url));
const logosDir = fileURLToPath(new URL("./logos", import.meta.url));
const dataPath = fileURLToPath(new URL("./output/documentMatches.json", import.meta.url));
const aacPolicyPdfPath = fileURLToPath(new URL("./output/AAC_Policy_Presentation.pdf", import.meta.url));
const aacPolicyWordPath = fileURLToPath(new URL("./output/AAC_Policy_Modified.docx", import.meta.url));
const templateRoot = process.env.TEMPLATE_LIBRARY_DIR || "/Users/vkartsu/SFTPConfig/output_office_templates";
const masterListTemplateFile = "Master list of documents_TEMPLATE.xlsx";
const masterListTemplatePath = path.join(templateRoot, masterListTemplateFile);
const previewCacheRoot = path.join("/tmp", "nabh-template-previews");
const execFileAsync = promisify(execFile);
const repositorySyncJobs = new Map();

async function loadProperties() {
  const propertiesPath = fileURLToPath(new URL("./config.properties", import.meta.url));
  try {
    const content = await readFile(propertiesPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match && !match[1].startsWith("#") && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

await loadProperties();
const onlyOffice = createOnlyOfficeService({
  dataPath,
  storageDir: fileURLToPath(new URL("./output/controlled-documents", import.meta.url)),
  auditPath: fileURLToPath(new URL("./output/documentAudit.json", import.meta.url)),
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
  documentServerUrl: process.env.ONLYOFFICE_DOCUMENT_SERVER_URL,
  jwtSecret: process.env.ONLYOFFICE_JWT_SECRET
});

app.use(express.static(webBuildDir, { etag: false, lastModified: false, setHeaders: (response) => response.set("Cache-Control", "no-store") }));
app.use("/prototype", express.static(prototypeDir));
app.use("/logos", express.static(logosDir));
app.use(express.json({ limit: "2mb" }));

app.get("/api/admin/hospitals", async (_request, response, next) => {
  try { response.json({ hospitals: await listHospitals() }); } catch (error) { next(error); }
});

app.post("/api/admin/hospitals", async (request, response, next) => {
  try {
    const hospital = await createHospital(request.body || {});
    const repository = await provisionR2ClientRepository(hospital);
    response.status(201).json({ hospital, repository });
  }
  catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/client-repository", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    response.json({ repository: await provisionR2ClientRepository(hospital) });
  } catch (error) { next(error); }
});

app.post("/api/admin/hospitals/:hospitalId/client-repository/sync", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    const existingJob = repositorySyncJobs.get(hospital.id);
    if (existingJob?.status === "running") return response.status(202).json({ job: existingJob });
    const job = { status: "running", hospitalCode: hospital.code, startedAt: new Date().toISOString(), copied: 0, skipped: 0 };
    repositorySyncJobs.set(hospital.id, job);
    provisionR2ClientRepository(hospital, { syncNewTemplates: true })
      .then((repository) => Object.assign(job, { status: "complete", completedAt: new Date().toISOString(), ...repository }))
      .catch((error) => Object.assign(job, { status: "failed", completedAt: new Date().toISOString(), error: error.message }));
    response.status(202).json({ job });
  } catch (error) { next(error); }
});

app.get("/api/admin/hospitals/:hospitalId/client-repository/status", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    const job = repositorySyncJobs.get(hospital.id);
    const repository = await getR2ClientRepositoryStatus(hospital.code);
    response.json({ repository, job: job || null });
  } catch (error) { next(error); }
});

app.patch("/api/admin/hospitals/:hospitalId", async (request, response, next) => {
  try { const hospital = await updateHospital(request.params.hospitalId, request.body || {}); if (!hospital) return response.status(404).json({ error: "Hospital not found." }); response.json({ hospital }); }
  catch (error) { if (error instanceof Error) response.status(400).json({ error: error.message }); else next(error); }
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
    const raw = await readFile(dataPath, "utf8");
    response.type("application/json").send(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.status(404).json({ error: "No document match data found yet. Run the documentMatchingWorkflow first." });
      return;
    }
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

async function getTemplateFiles() {
  return r2TemplateStorageEnabled() ? listR2TemplateFiles() : listTemplateFiles();
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

async function readTemplateMasterList() {
  const workbook = new ExcelJS.Workbook();
  if (r2TemplateStorageEnabled()) await workbook.xlsx.load(await getR2TemplateFile(masterListTemplateFile));
  else await workbook.xlsx.readFile(masterListTemplatePath);
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

app.get("/api/admin/template-library", async (_request, response, next) => {
  try {
    const [masterList, templateFiles] = await Promise.all([readTemplateMasterList(), getTemplateFiles()]);
    const matchedFiles = new Set();
    const departments = Object.fromEntries(Object.entries(masterList).map(([department, documents]) => [department, documents.map((document) => {
      const match = matchTemplate(document, department, templateFiles);
      const templatePath = match?.templatePath || null;
      if (templatePath) matchedFiles.add(templatePath);
      return { ...document, templatePath, fileName: templatePath ? path.basename(templatePath) : null, fileType: templatePath ? path.extname(templatePath).slice(1).toUpperCase() : null, matchScore: match ? Number(match.score.toFixed(3)) : 0 };
    })]));
    response.json({ departments, masterListPath: r2TemplateStorageEnabled() ? `${r2TemplateStorageInfo().prefix}${masterListTemplateFile}` : masterListTemplatePath, storage: r2TemplateStorageInfo(), unmatchedTemplateCount: templateFiles.length - matchedFiles.size });
  } catch (error) {
    if (error.code === "ENOENT") return response.status(404).json({ error: `Master List template not found: ${masterListTemplatePath}` });
    next(error);
  }
});

app.get("/api/admin/hospitals/:hospitalId/documents", async (request, response, next) => {
  try {
    const hospital = (await listHospitals()).find((item) => item.id === request.params.hospitalId);
    if (!hospital) return response.status(404).json({ error: "Hospital not found." });
    const repository = await getR2ClientRepositoryStatus(hospital.code);
    if (!repository.exists) return response.status(404).json({ error: "Hospital document repository has not been initialized.", repository });
    if (!r2TemplateStorageEnabled()) {
      const departments = JSON.parse(await readFile(dataPath, "utf8"));
      return response.json({ departments, repository });
    }
    const [masterListBuffer, clientFiles, versionManifests] = await Promise.all([
      getR2ClientFile(hospital.code, masterListTemplateFile),
      listR2ClientFiles(hospital.code),
      getR2ClientVersionManifests(hospital.code)
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(masterListBuffer);
    const masterList = extractMasterListDepartments(workbook);
    const departments = Object.fromEntries(Object.entries(masterList).map(([department, documents]) => [department, documents.map((document) => {
      const match = matchTemplate(document, department, clientFiles);
      const templatePath = match?.templatePath || null;
      const docKey = getDocumentKey(document.documentId, document.documentName, templatePath);
      const versionManifest = versionManifests.get(docKey) || (templatePath ? versionManifests.get(templatePath) : null) || (!document.documentId.includes("[") ? versionManifests.get(document.documentId) : null);
      const isApproved = Boolean(versionManifest && versionManifest.history && versionManifest.history.some((entry) => entry.action && entry.action !== "template baseline"));
      return {
        ...document,
        id: `${department}:${docKey}`,
        active: true,
        confidence: match?.score >= 0.6 ? "high" : match?.score >= 0.35 ? "medium" : "low",
        matchedFilePath: templatePath,
        relativeFilePath: templatePath,
        version: isApproved ? versionManifest.currentVersion : null,
        approved: isApproved,
        history: versionManifest?.history || []
      };
    })]));
    response.json({ departments, repository });
  } catch (error) { next(error); }
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

async function resolveMasterTemplateBuffer(relativePath) {
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
        const buffer = await getR2TemplateFile(cand);
        return { buffer, relativePath: cand };
      } catch {}
    }
    try {
      const templateFiles = await listR2TemplateFiles();
      const match = templateFiles.find((f) => path.basename(f, path.extname(f)).replace(/_TEMPLATE$/i, "").toLowerCase() === baseName);
      if (match) return { buffer: await getR2TemplateFile(match), relativePath: match };
    } catch {}
  } else {
    for (const cand of candidates) {
      const localPath = path.resolve(templateRoot, cand);
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
        const buffer = await getR2ClientFile(hospital.code, cand);
        return { buffer, relativePath: cand, source: "client" };
      } catch {}
      try {
        const buffer = await getR2TemplateFile(cand);
        return { buffer, relativePath: cand, source: "template" };
      } catch {}
    }

    try {
      const clientFiles = await listR2ClientFiles(hospital.code);
      const match = clientFiles.find((f) => path.basename(f, path.extname(f)).replace(/_TEMPLATE$/i, "").toLowerCase() === baseName);
      if (match) {
        return { buffer: await getR2ClientFile(hospital.code, match), relativePath: match, source: "client" };
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
    response.attachment(path.basename(objectKey)).send(await getR2ClientVersionFile(hospital.code, objectKey));
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
      await writeFile(sourcePath, await getR2ClientVersionFile(hospital.code, objectKey));
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
    const entries = r2TemplateStorageEnabled() ? await listR2ClientAuditEvents(hospital.code) : await onlyOffice.listAudit();
    response.json({ entries });
  } catch (error) { next(error); }
});

app.get("/api/admin/template-library/download", async (request, response, next) => {
  try {
    const relativePath = String(request.query.path || "");
    if (!relativePath) return response.status(400).json({ error: "Template path is required." });

    const resolved = await resolveMasterTemplateBuffer(relativePath);
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
    if (!relativePath) return response.status(400).json({ error: "Template path is required." });

    const cacheKey = createHash("sha256").update(`template:${relativePath}`).digest("hex");
    const cacheDirectory = path.join(previewCacheRoot, "templates", cacheKey);
    await mkdir(cacheDirectory, { recursive: true });

    const resolved = await resolveMasterTemplateBuffer(relativePath);
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
  try { response.json({ entries: await onlyOffice.listAudit() }); } catch (error) { next(error); }
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

    const departments = JSON.parse(await readFile(dataPath, "utf8"));
    const documents = departments[department];
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
    await writeFile(dataPath, JSON.stringify(departments, null, 2));
    response.json({ ok: true, active: doc.active });
  } catch (error) {
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

    const departments = JSON.parse(await readFile(dataPath, "utf8"));
    const documents = departments[department];
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

    await writeFile(dataPath, JSON.stringify(departments, null, 2));
    response.json({ ok: true, document: doc });
  } catch (error) {
    next(error);
  }
});

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST || "127.0.0.1";
app.listen(port, host, () => {
  console.log(`Master List viewer listening on http://${host}:${port}`);
});
