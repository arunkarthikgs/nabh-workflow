import { CopyObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash, randomUUID } from "crypto";
import path from "path";
import { customizeDocumentTemplate } from "./documentCustomizer.js";
import { NABH_ACCREDITATION_PROGRAMMES, accreditationProgrammeSlug } from "./accreditationService.js";
import { NABH_WORKSPACE_CATEGORIES } from "./documentCategoryService.js";

const DEFAULT_BUCKET = "nbah-repo";
const DEFAULT_PREFIX = "Templates/";
const DEFAULT_CLIENT_FOLDER = "Clients/";

function isEnabled() {
  return process.env.R2_ENABLED?.toLowerCase() === "true";
}

function config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const missing = [
    ["R2_ACCOUNT_ID", accountId],
    ["R2_ACCESS_KEY_ID", accessKeyId],
    ["R2_SECRET_ACCESS_KEY", secretAccessKey]
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`R2 is enabled but missing ${missing.join(", ")}.`);
  const prefix = process.env.R2_TEMPLATE_PREFIX || DEFAULT_PREFIX;
  return {
    bucket: process.env.R2_BUCKET_NAME || DEFAULT_BUCKET,
    prefix: prefix.endsWith("/") ? prefix : `${prefix}/`,
    endpoint: process.env.R2_ENDPOINT_URL || `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  };
}

function client() {
  const settings = config();
  return new S3Client({ region: "auto", endpoint: settings.endpoint, credentials: settings.credentials });
}

export function r2TemplateStorageEnabled() {
  return isEnabled();
}

export function r2TemplateStorageInfo() {
  if (!isEnabled()) return { mode: "local" };
  const settings = config();
  return { mode: "r2", bucket: settings.bucket, prefix: settings.prefix };
}

export async function listR2TemplateFiles() {
  const settings = config();
  const objects = [];
  let continuationToken;
  do {
    const result = await client().send(new ListObjectsV2Command({ Bucket: settings.bucket, Prefix: settings.prefix, ContinuationToken: continuationToken }));
    for (const object of result.Contents || []) {
      const relativePath = object.Key?.slice(settings.prefix.length);
      if (relativePath && /\.(docx|xlsx|pptx)$/i.test(relativePath) && !relativePath.startsWith("metadata/")) objects.push(relativePath);
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

export async function getR2TemplateFile(relativePath) {
  const settings = config();
  const result = await client().send(new GetObjectCommand({ Bucket: settings.bucket, Key: `${settings.prefix}${relativePath}` }));
  return Buffer.from(await result.Body.transformToByteArray());
}

export async function listR2ClientFiles(hospitalCode, programme) {
  const prefix = clientPrefix(hospitalCode, programme);
  const index = await getJsonObject(config(), `${prefix}index.json`);
  if (Array.isArray(index?.files)) return index.files;
  const objects = await listR2Objects(prefix);
  return objects
    .map((object) => object.Key.slice(prefix.length))
    .filter((relativePath) => /\.(docx|xlsx|pptx)$/i.test(relativePath) && relativePath !== "Master list of documents_TEMPLATE.xlsx" && !relativePath.startsWith("versions/"));
}

export async function getR2ClientFile(hospitalCode, relativePath, programme) {
  const settings = config();
  const result = await client().send(new GetObjectCommand({ Bucket: settings.bucket, Key: `${clientPrefix(hospitalCode, programme)}${relativePath}` }));
  return Buffer.from(await result.Body.transformToByteArray());
}

function hospitalAssetPrefix(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(normalized)) throw new Error("Hospital client code must contain 2-12 uppercase letters or numbers.");
  const baseFolder = process.env.R2_CLIENT_FOLDER || DEFAULT_CLIENT_FOLDER;
  return `${baseFolder.replace(/^\/+|\/+$/g, "")}/${normalized}/`;
}

export async function saveR2HospitalLogo(hospitalCode, dataUrl) {
  if (!isEnabled()) return null;
  const match = String(dataUrl || "").match(/^data:(image\/(png|jpeg|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) throw new Error("Logo must be a PNG, JPEG, or WebP image.");
  const extension = match[2].toLowerCase() === "jpeg" ? "jpg" : match[2].toLowerCase();
  const key = `${hospitalAssetPrefix(hospitalCode)}logo.${extension}`;
  await client().send(new PutObjectCommand({ Bucket: config().bucket, Key: key, Body: Buffer.from(match[3], "base64"), ContentType: match[1].toLowerCase(), CacheControl: "no-cache" }));
  return key;
}

export async function getR2HospitalLogo(hospitalCode) {
  const settings = config();
  const prefix = hospitalAssetPrefix(hospitalCode);
  const objects = await listR2Objects(prefix);
  const logo = objects.find((object) => /^logo\.(png|jpg|jpeg|webp)$/i.test(object.Key.slice(prefix.length)));
  if (!logo) return null;
  const result = await client().send(new GetObjectCommand({ Bucket: settings.bucket, Key: logo.Key }));
  return { bytes: Buffer.from(await result.Body.transformToByteArray()), contentType: result.ContentType || "application/octet-stream" };
}

export async function getR2ClientVersionFile(hospitalCode, objectKey, programme) {
  const settings = config();
  const allowedPrefix = `${clientPrefix(hospitalCode, programme)}versions/`;
  if (!String(objectKey || "").startsWith(allowedPrefix)) throw new Error("Invalid document version path.");
  const result = await client().send(new GetObjectCommand({ Bucket: settings.bucket, Key: objectKey }));
  return Buffer.from(await result.Body.transformToByteArray());
}

export async function getR2ClientRepositoryStatus(hospitalCode, programme) {
  if (!isEnabled()) return { mode: "local", exists: true, status: "ready" };
  if (!programme) return { mode: "r2", exists: false, status: "accreditation_required" };
  const settings = config();
  const destinationPrefix = clientPrefix(hospitalCode, programme);
  const metadata = await readClientMetadata(settings, destinationPrefix);
  return {
    mode: "r2",
    exists: Boolean(metadata),
    status: metadata ? "ready" : "missing",
    destinationPrefix,
    metadata
  };
}

function safeRelativePath(relativePath) {
  const normalized = String(relativePath || "").replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..") || !/\.(docx|xlsx|pptx)$/i.test(normalized)) throw new Error("Invalid client document path.");
  return normalized;
}

export function getDocumentKey(documentId, documentName, relativePath) {
  const cleanId = String(documentId || "").trim();
  const cleanPath = String(relativePath || "").replace(/\\/g, "/").trim();
  const cleanName = String(documentName || "").trim();

  // If documentId is clean and specific (not a generic placeholder like [Facility Code])
  if (cleanId && !cleanId.includes("[") && !cleanId.includes("]")) {
    return cleanId;
  }
  if (cleanPath) {
    return cleanPath;
  }
  return cleanName || cleanId;
}

function versionPrefix(hospitalCode, documentKey, programme) {
  const key = createHash("sha256").update(String(documentKey)).digest("hex").slice(0, 24);
  return `${clientPrefix(hospitalCode, programme)}versions/${key}/`;
}

async function getJsonObject(settings, key) {
  try {
    const result = await client().send(new GetObjectCommand({ Bucket: settings.bucket, Key: key }));
    return JSON.parse(Buffer.from(await result.Body.transformToByteArray()).toString("utf8"));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function getR2ClientVersionManifests(hospitalCode, programme) {
  if (!isEnabled()) return new Map();
  const settings = config();
  const prefix = `${clientPrefix(hospitalCode, programme)}versions/`;
  const objects = await listR2Objects(prefix);
  const manifestKeys = objects.map((object) => object.Key).filter((key) => key.endsWith("/manifest.json"));
  const manifests = await Promise.all(manifestKeys.map((key) => getJsonObject(settings, key)));
  const map = new Map();
  for (const manifest of manifests.filter(Boolean)) {
    if (manifest.documentKey) map.set(manifest.documentKey, manifest);
    if (manifest.templatePath) map.set(manifest.templatePath, manifest);
    if (manifest.documentId && !manifest.documentId.includes("[")) map.set(manifest.documentId, manifest);
  }
  return map;
}

export async function listR2ClientAuditEvents(hospitalCode, programme) {
  if (!isEnabled()) return [];
  const settings = config();
  const objects = await listR2Objects(`${clientPrefix(hospitalCode, programme)}audit/`);
  const events = await Promise.all(objects
    .map((object) => object.Key)
    .filter((key) => key.endsWith(".json"))
    .map((key) => getJsonObject(settings, key)));
  return events.filter(Boolean).sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
}

export async function recordR2ClientAuditEvent(hospital, event) {
  if (!isEnabled()) return null;
  const programme = hospital?.accreditation?.programme;
  if (!programme) return null;
  const timestamp = event.timestamp || new Date().toISOString();
  const payload = { hospitalId: hospital.id, hospitalCode: hospital.code, timestamp, ...event };
  await client().send(new PutObjectCommand({ Bucket: config().bucket, Key: `${clientPrefix(hospital.code, programme)}audit/${timestamp.replace(/[:.]/g, "-")}-${randomUUID()}.json`, Body: JSON.stringify(payload, null, 2), ContentType: "application/json" }));
  return payload;
}

export async function getR2ClientDocumentStatuses(hospitalCode, programme) {
  if (!isEnabled()) return {};
  const settings = config();
  return (await getJsonObject(settings, `${clientPrefix(hospitalCode, programme)}status/document-status.json`)) || {};
}

export async function getR2HospitalAccreditation(hospitalCode) {
  if (!isEnabled()) return null;
  return getJsonObject(config(), `${hospitalAssetPrefix(hospitalCode)}accreditation.json`);
}

export async function saveR2HospitalAccreditation(hospitalCode, accreditation) {
  if (!isEnabled()) return null;
  const settings = config();
  await client().send(new PutObjectCommand({ Bucket: settings.bucket, Key: `${hospitalAssetPrefix(hospitalCode)}accreditation.json`, Body: JSON.stringify(accreditation, null, 2), ContentType: "application/json" }));
  return accreditation;
}

export async function saveR2ClientDocumentStatuses(hospitalCode, programme, statuses) {
  if (!isEnabled()) return null;
  const settings = config();
  await client().send(new PutObjectCommand({ Bucket: settings.bucket, Key: `${clientPrefix(hospitalCode, programme)}status/document-status.json`, Body: JSON.stringify(statuses, null, 2), ContentType: "application/json" }));
  return statuses;
}

export async function listR2TemplateAuditEvents() {
  if (!isEnabled()) return [];
  const settings = config();
  const events = await Promise.all(NABH_ACCREDITATION_PROGRAMMES.map(async (programme) => {
    const objects = await listR2Objects(`${programmeSourcePrefix(settings, programme)}audit/`);
    return Promise.all(objects.filter((object) => object.Key.endsWith(".json")).map((object) => getJsonObject(settings, object.Key)));
  }));
  return events.flat().filter(Boolean).sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
}

export async function approveR2ClientDocumentVersion({ hospital, documentId, documentName, department, relativePath, fileName, bytes, approvedBy, note }) {
  if (!isEnabled()) throw new Error("R2 document versioning requires R2_ENABLED=true.");
  const programme = hospital?.accreditation?.programme;
  const settings = config();
  const clientPath = safeRelativePath(relativePath);
  const originalExtension = path.extname(clientPath).toLowerCase();
  const uploadedExtension = path.extname(String(fileName || "")).toLowerCase();
  if (uploadedExtension !== originalExtension) throw new Error(`Upload a ${originalExtension} file for this document.`);
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new Error("Select a non-empty document file.");

  const docKey = getDocumentKey(documentId, documentName, clientPath);
  const prefix = versionPrefix(hospital.code, docKey, programme);
  const manifestKey = `${prefix}manifest.json`;
  const existingManifest = await getJsonObject(settings, manifestKey);
  const originalKey = `${clientPrefix(hospital.code, programme)}${clientPath}`;
  const versionOneKey = `${prefix}v1${originalExtension}`;
  const history = existingManifest?.history || [];
  if (!history.length) {
    if (!await objectExists(settings.bucket, originalKey)) throw new Error("The client template file was not found.");
    if (!await objectExists(settings.bucket, versionOneKey)) {
      await client().send(new CopyObjectCommand({ Bucket: settings.bucket, Key: versionOneKey, CopySource: `${settings.bucket}/${encodeURIComponent(originalKey).replace(/%2F/g, "/")}` }));
    }
    history.push({ version: 1, objectKey: versionOneKey, fileName: path.basename(clientPath), createdAt: existingManifest?.createdAt || new Date().toISOString(), action: "template baseline" });
  }
  const nextVersion = Math.max(...history.map((entry) => entry.version), 0) + 1;
  const versionKey = `${prefix}v${nextVersion}${originalExtension}`;
  const timestamp = new Date().toISOString();
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  await client().send(new PutObjectCommand({ Bucket: settings.bucket, Key: versionKey, Body: bytes, ContentType: "application/vnd.openxmlformats-officedocument", Metadata: { documentid: String(documentId), version: String(nextVersion), approvedby: String(approvedBy) } }));
  const approval = { version: nextVersion, objectKey: versionKey, fileName: path.basename(String(fileName)), approvedBy: String(approvedBy), note: String(note || "Approved document update"), timestamp, fileHash, action: "approved upload" };
  history.push(approval);
  const manifest = { documentKey: docKey, documentId, documentName, department: department || "", templatePath: clientPath, currentVersion: nextVersion, currentObjectKey: versionKey, createdAt: existingManifest?.createdAt || timestamp, updatedAt: timestamp, history };
  await client().send(new PutObjectCommand({ Bucket: settings.bucket, Key: manifestKey, Body: JSON.stringify(manifest, null, 2), ContentType: "application/json" }));
  await client().send(new PutObjectCommand({ Bucket: settings.bucket, Key: `${clientPrefix(hospital.code, programme)}audit/${timestamp.replace(/[:.]/g, "-")}-${randomUUID()}.json`, Body: JSON.stringify({ hospitalId: hospital.id, hospitalCode: hospital.code, documentId, documentName, department: department || "", templatePath: clientPath, ...approval }, null, 2), ContentType: "application/json" }));
  return manifest;
}

export async function getR2TemplateVersionManifest(programme, relativePath) {
  if (!isEnabled()) return null;
  const settings = config();
  const templatePath = safeRelativePath(relativePath);
  return getJsonObject(settings, `${templateVersionPrefix(programme, getDocumentKey("", "", templatePath))}manifest.json`);
}

function templateVersionPrefix(programme, documentKey) {
  const key = createHash("sha256").update(String(documentKey)).digest("hex").slice(0, 24);
  return `${programmeSourcePrefix(config(), programme)}versions/${key}/`;
}

export async function approveR2TemplateDocumentVersion({ programme, documentId, documentName, department, relativePath, fileName, bytes, approvedBy, note }) {
  if (!isEnabled()) throw new Error("Template versioning requires R2_ENABLED=true.");
  const settings = config();
  const templatePath = safeRelativePath(relativePath);
  const originalExtension = path.extname(templatePath).toLowerCase();
  if (path.extname(String(fileName || "")).toLowerCase() !== originalExtension) throw new Error(`Upload a ${originalExtension} file for this template.`);
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new Error("Select a non-empty template file.");

  const docKey = getDocumentKey(documentId, documentName, templatePath);
  const prefix = templateVersionPrefix(programme, docKey);
  const manifestKey = `${prefix}manifest.json`;
  const existingManifest = await getJsonObject(settings, manifestKey);
  const templateKey = `${programmeSourcePrefix(settings, programme)}${templatePath}`;
  const history = existingManifest?.history || [];
  if (!history.length) {
    if (!await objectExists(settings.bucket, templateKey)) throw new Error("The master template file was not found.");
    const baselineKey = `${prefix}v1${originalExtension}`;
    if (!await objectExists(settings.bucket, baselineKey)) await client().send(new CopyObjectCommand({ Bucket: settings.bucket, Key: baselineKey, CopySource: `${settings.bucket}/${encodeURIComponent(templateKey).replace(/%2F/g, "/")}` }));
    history.push({ version: 1, objectKey: baselineKey, fileName: path.basename(templatePath), createdAt: existingManifest?.createdAt || new Date().toISOString(), action: "template baseline" });
  }
  const timestamp = new Date().toISOString();
  const nextVersion = Math.max(...history.map((entry) => entry.version), 0) + 1;
  const versionKey = `${prefix}v${nextVersion}${originalExtension}`;
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  const approval = { version: nextVersion, objectKey: versionKey, fileName: path.basename(String(fileName)), approvedBy: String(approvedBy || "Super Admin"), note: String(note || "Approved template update"), timestamp, fileHash, action: "approved template upload" };
  await client().send(new PutObjectCommand({ Bucket: settings.bucket, Key: versionKey, Body: bytes, ContentType: "application/vnd.openxmlformats-officedocument", Metadata: { documentid: String(documentId || ""), version: String(nextVersion), approvedby: approval.approvedBy } }));
  await client().send(new PutObjectCommand({ Bucket: settings.bucket, Key: templateKey, Body: bytes, ContentType: "application/vnd.openxmlformats-officedocument" }));
  history.push(approval);
  const manifest = { documentKey: docKey, documentId, documentName, department: department || "", templatePath, programme, currentVersion: nextVersion, currentObjectKey: versionKey, createdAt: existingManifest?.createdAt || timestamp, updatedAt: timestamp, history };
  await client().send(new PutObjectCommand({ Bucket: settings.bucket, Key: manifestKey, Body: JSON.stringify(manifest, null, 2), ContentType: "application/json" }));
  await client().send(new PutObjectCommand({ Bucket: settings.bucket, Key: `${programmeSourcePrefix(settings, programme)}audit/${timestamp.replace(/[:.]/g, "-")}-${randomUUID()}.json`, Body: JSON.stringify({ scope: "template", programme, documentId, documentName, department: department || "", templatePath, ...approval }, null, 2), ContentType: "application/json" }));
  return manifest;
}

async function listR2Objects(prefix) {
  const settings = config();
  const objects = [];
  let continuationToken;
  do {
    const result = await client().send(new ListObjectsV2Command({ Bucket: settings.bucket, Prefix: prefix, ContinuationToken: continuationToken }));
    objects.push(...(result.Contents || []).filter((object) => object.Key && !object.Key.endsWith("/")));
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

function clientPrefix(code, programme) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(normalized)) throw new Error("Hospital client code must contain 2-12 uppercase letters or numbers.");
  const slug = accreditationProgrammeSlug(programme);
  if (!slug) throw new Error("Select and accept an NABH accreditation programme before the document workspace can be created.");
  const baseFolder = process.env.R2_CLIENT_FOLDER || DEFAULT_CLIENT_FOLDER;
  return `${baseFolder.replace(/^\/+|\/+$/g, "")}/${normalized}/${slug}/`;
}

// Each NABH accreditation programme has its own template set: Templates/<programme-slug>/...
function programmeSourcePrefix(settings, programme) {
  const slug = accreditationProgrammeSlug(programme);
  if (!slug) throw new Error("Select and accept an NABH accreditation programme before the document workspace can be created.");
  return `${settings.prefix}${slug}/`;
}

export async function listR2ProgrammeTemplateFiles(programme) {
  const settings = config();
  const prefix = programmeSourcePrefix(settings, programme);
  const objects = await listR2Objects(prefix);
  return objects
    .map((object) => object.Key.slice(prefix.length))
    .filter((relativePath) => /\.(docx|xlsx|pptx)$/i.test(relativePath) && !relativePath.startsWith("metadata/") && !relativePath.startsWith("versions/"));
}

export async function getR2ProgrammeTemplateFile(programme, relativePath) {
  const settings = config();
  const prefix = programmeSourcePrefix(settings, programme);
  const result = await client().send(new GetObjectCommand({ Bucket: settings.bucket, Key: `${prefix}${relativePath}` }));
  return Buffer.from(await result.Body.transformToByteArray());
}

// Creates an empty placeholder object per NABH accreditation programme (S3/R2 has no real folders,
// so a zero-byte key ending in "/" is what makes the "folder" show up in bucket browsers).
export async function ensureProgrammeTemplateFolders() {
  if (!isEnabled()) return { mode: "local", created: [], existing: [] };
  const settings = config();
  const created = [];
  const existing = [];
  for (const programme of NABH_ACCREDITATION_PROGRAMMES) {
    const prefix = programmeSourcePrefix(settings, programme);
    for (const folder of [prefix, ...NABH_WORKSPACE_CATEGORIES.map((category) => `${prefix}${category}/`)]) {
      if (await objectExists(settings.bucket, folder)) { existing.push({ programme, prefix: folder }); continue; }
      await client().send(new PutObjectCommand({ Bucket: settings.bucket, Key: folder, Body: "", ContentType: "application/x-directory" }));
      created.push({ programme, prefix: folder });
    }
  }
  return { mode: "r2", created, existing };
}

// Seeds a programme folder from the flat legacy Templates/ set as a starting point until
// programme-specific content is uploaded. Skips objects that belong to any programme folder
// (so re-running against multiple programmes never copies a programme's own content into another).
export async function copyFlatTemplatesIntoProgramme(programme, { overwrite = false } = {}) {
  if (!isEnabled()) return { mode: "local", copied: 0, skipped: 0 };
  const settings = config();
  const destinationPrefix = programmeSourcePrefix(settings, programme);
  const sourceObjects = flatTemplateRootObjects(settings, await listR2Objects(settings.prefix));
  let copied = 0;
  let skipped = 0;
  const copyOne = async (sourceObject) => {
    const relativePath = sourceObject.Key.slice(settings.prefix.length);
    const destinationKey = `${destinationPrefix}${relativePath}`;
    if (!overwrite && await objectExists(settings.bucket, destinationKey)) return "skipped";
    await client().send(new CopyObjectCommand({ Bucket: settings.bucket, Key: destinationKey, CopySource: `${settings.bucket}/${encodeURIComponent(sourceObject.Key).replace(/%2F/g, "/")}` }));
    return "copied";
  };
  for (let index = 0; index < sourceObjects.length; index += 12) {
    const results = await Promise.all(sourceObjects.slice(index, index + 12).map(copyOne));
    copied += results.filter((result) => result === "copied").length;
    skipped += results.filter((result) => result === "skipped").length;
  }
  return { mode: "r2", programme, sourcePrefix: settings.prefix, destinationPrefix, total: sourceObjects.length, copied, skipped };
}

function flatTemplateRootObjects(settings, objects) {
  const programmeSlugs = new Set(NABH_ACCREDITATION_PROGRAMMES.map((item) => accreditationProgrammeSlug(item)));
  return objects.filter((object) => {
    const relativePath = object.Key.slice(settings.prefix.length);
    return relativePath && !programmeSlugs.has(relativePath.split("/")[0]);
  });
}

// Lists the legacy flat files directly under Templates/ (i.e. not inside any programme
// subfolder), without deleting anything. Useful to preview before calling the delete below.
export async function listFlatTemplateRootFiles() {
  if (!isEnabled()) return [];
  const settings = config();
  const objects = flatTemplateRootObjects(settings, await listR2Objects(settings.prefix));
  return objects.map((object) => object.Key.slice(settings.prefix.length));
}

// Permanently deletes the legacy flat files directly under Templates/, keeping only the
// per-programme subfolders. Destructive and not reversible without R2 bucket versioning.
export async function deleteFlatTemplateRootFiles() {
  if (!isEnabled()) return { mode: "local", deleted: 0, total: 0 };
  const settings = config();
  const targets = flatTemplateRootObjects(settings, await listR2Objects(settings.prefix));
  let deleted = 0;
  for (let index = 0; index < targets.length; index += 1000) {
    const batch = targets.slice(index, index + 1000);
    await client().send(new DeleteObjectsCommand({ Bucket: settings.bucket, Delete: { Objects: batch.map((object) => ({ Key: object.Key })) } }));
    deleted += batch.length;
  }
  return { mode: "r2", deleted, total: targets.length };
}

async function objectExists(bucket, key) {
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) return false;
    throw error;
  }
}

function isNotFound(error) {
  return error.name === "NotFound" || error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404;
}

async function readClientMetadata(settings, destinationPrefix) {
  try {
    const result = await client().send(new GetObjectCommand({ Bucket: settings.bucket, Key: `${destinationPrefix}client.json` }));
    return JSON.parse(Buffer.from(await result.Body.transformToByteArray()).toString("utf8"));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function provisionR2ClientRepository(hospital, { syncNewTemplates = false } = {}) {
  if (!isEnabled()) return { mode: "local", provisioned: false, copied: 0, skipped: 0 };
  const programme = hospital?.accreditation?.programme;
  if (!programme) throw new Error("Select and accept an NABH accreditation programme before the document workspace can be created.");
  const settings = config();
  const sourcePrefix = programmeSourcePrefix(settings, programme);
  const destinationPrefix = clientPrefix(hospital.code, programme);
  const existingMetadata = await readClientMetadata(settings, destinationPrefix);
  if (!syncNewTemplates && existingMetadata?.hospitalCode === hospital.code && existingMetadata?.sourcePrefix === sourcePrefix) {
    return {
      ...existingMetadata,
      mode: "r2",
      provisioned: true,
      copied: 0,
      skipped: existingMetadata.templateObjects || 0
    };
  }
  const sourceObjects = await listR2Objects(sourcePrefix);
  if (!sourceObjects.length) {
    return {
      mode: "r2",
      provisioned: false,
      templatesFound: 0,
      programme,
      sourcePrefix,
      error: `No templates found yet for the "${programme}" programme. Ask an administrator to upload templates under ${sourcePrefix} in R2.`
    };
  }
  let copied = 0;
  let skipped = 0;
  const copyObject = async (sourceObject) => {
    const relativePath = sourceObject.Key.slice(sourcePrefix.length);
    const destinationKey = `${destinationPrefix}${relativePath}`;
    if (!syncNewTemplates && await objectExists(settings.bucket, destinationKey)) return "skipped";

    try {
      const getResult = await client().send(new GetObjectCommand({ Bucket: settings.bucket, Key: sourceObject.Key }));
      const rawBuffer = Buffer.from(await getResult.Body.transformToByteArray());
      const customizedBuffer = await customizeDocumentTemplate(rawBuffer, relativePath, hospital);

      await client().send(new PutObjectCommand({
        Bucket: settings.bucket,
        Key: destinationKey,
        Body: customizedBuffer,
        ContentType: getResult.ContentType || "application/octet-stream"
      }));
      return "copied";
    } catch (error) {
      console.warn(`Customization skipped for ${relativePath}, falling back to direct copy:`, error.message);
      await client().send(new CopyObjectCommand({
        Bucket: settings.bucket,
        Key: destinationKey,
        CopySource: `${settings.bucket}/${encodeURIComponent(sourceObject.Key).replace(/%2F/g, "/")}`
      }));
      return "copied";
    }
  };
  for (let index = 0; index < sourceObjects.length; index += 12) {
    const results = await Promise.all(sourceObjects.slice(index, index + 12).map(copyObject));
    copied += results.filter((result) => result === "copied").length;
    skipped += results.filter((result) => result === "skipped").length;
  }
  const metadata = {
    hospitalId: hospital.id,
    hospitalCode: hospital.code,
    hospitalName: hospital.name,
    programme,
    sourcePrefix,
    destinationPrefix,
    provisionedAt: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
    templateObjects: sourceObjects.length,
    copied,
    skipped
  };
  const files = sourceObjects
    .map((object) => object.Key.slice(sourcePrefix.length))
    .filter((relativePath) => /\.(docx|xlsx|pptx)$/i.test(relativePath) && relativePath !== "Master list of documents_TEMPLATE.xlsx" && !relativePath.startsWith("versions/"));
  await client().send(new PutObjectCommand({
    Bucket: settings.bucket,
    Key: `${destinationPrefix}client.json`,
    Body: JSON.stringify(metadata, null, 2),
    ContentType: "application/json"
  }));
  await client().send(new PutObjectCommand({
    Bucket: settings.bucket,
    Key: `${destinationPrefix}index.json`,
    Body: JSON.stringify({ hospitalCode: hospital.code, programme, indexedAt: new Date().toISOString(), files }, null, 2),
    ContentType: "application/json"
  }));
  return { mode: "r2", provisioned: true, ...metadata };
}