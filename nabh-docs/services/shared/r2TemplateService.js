import { CopyObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash, randomUUID } from "crypto";
import path from "path";

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

export async function listR2ClientFiles(hospitalCode) {
  const prefix = clientPrefix(hospitalCode);
  const objects = await listR2Objects(prefix);
  return objects
    .map((object) => object.Key.slice(prefix.length))
    .filter((relativePath) => /\.(docx|xlsx|pptx)$/i.test(relativePath) && relativePath !== "Master list of documents_TEMPLATE.xlsx" && !relativePath.startsWith("versions/"));
}

export async function getR2ClientFile(hospitalCode, relativePath) {
  const settings = config();
  const result = await client().send(new GetObjectCommand({ Bucket: settings.bucket, Key: `${clientPrefix(hospitalCode)}${relativePath}` }));
  return Buffer.from(await result.Body.transformToByteArray());
}

export async function getR2ClientVersionFile(hospitalCode, objectKey) {
  const settings = config();
  const allowedPrefix = `${clientPrefix(hospitalCode)}versions/`;
  if (!String(objectKey || "").startsWith(allowedPrefix)) throw new Error("Invalid document version path.");
  const result = await client().send(new GetObjectCommand({ Bucket: settings.bucket, Key: objectKey }));
  return Buffer.from(await result.Body.transformToByteArray());
}

export async function getR2ClientRepositoryStatus(hospitalCode) {
  if (!isEnabled()) return { mode: "local", exists: true, status: "ready" };
  const settings = config();
  const destinationPrefix = clientPrefix(hospitalCode);
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

function versionPrefix(hospitalCode, documentKey) {
  const key = createHash("sha256").update(String(documentKey)).digest("hex").slice(0, 24);
  return `${clientPrefix(hospitalCode)}versions/${key}/`;
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

export async function getR2ClientVersionManifests(hospitalCode) {
  if (!isEnabled()) return new Map();
  const settings = config();
  const prefix = `${clientPrefix(hospitalCode)}versions/`;
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

export async function listR2ClientAuditEvents(hospitalCode) {
  if (!isEnabled()) return [];
  const settings = config();
  const objects = await listR2Objects(`${clientPrefix(hospitalCode)}audit/`);
  const events = await Promise.all(objects
    .map((object) => object.Key)
    .filter((key) => key.endsWith(".json"))
    .map((key) => getJsonObject(settings, key)));
  return events.filter(Boolean).sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
}

export async function approveR2ClientDocumentVersion({ hospital, documentId, documentName, department, relativePath, fileName, bytes, approvedBy, note }) {
  if (!isEnabled()) throw new Error("R2 document versioning requires R2_ENABLED=true.");
  const settings = config();
  const clientPath = safeRelativePath(relativePath);
  const originalExtension = path.extname(clientPath).toLowerCase();
  const uploadedExtension = path.extname(String(fileName || "")).toLowerCase();
  if (uploadedExtension !== originalExtension) throw new Error(`Upload a ${originalExtension} file for this document.`);
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new Error("Select a non-empty document file.");

  const docKey = getDocumentKey(documentId, documentName, clientPath);
  const prefix = versionPrefix(hospital.code, docKey);
  const manifestKey = `${prefix}manifest.json`;
  const existingManifest = await getJsonObject(settings, manifestKey);
  const originalKey = `${clientPrefix(hospital.code)}${clientPath}`;
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
  await client().send(new PutObjectCommand({ Bucket: settings.bucket, Key: `${clientPrefix(hospital.code)}audit/${timestamp.replace(/[:.]/g, "-")}-${randomUUID()}.json`, Body: JSON.stringify({ hospitalId: hospital.id, hospitalCode: hospital.code, documentId, documentName, department: department || "", templatePath: clientPath, ...approval }, null, 2), ContentType: "application/json" }));
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

function clientPrefix(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(normalized)) throw new Error("Hospital client code must contain 2-12 uppercase letters or numbers.");
  const baseFolder = process.env.R2_CLIENT_FOLDER || DEFAULT_CLIENT_FOLDER;
  return `${baseFolder.replace(/^\/+|\/+$/g, "")}/${normalized}/`;
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
  const settings = config();
  const destinationPrefix = clientPrefix(hospital.code);
  const existingMetadata = await readClientMetadata(settings, destinationPrefix);
  if (!syncNewTemplates && existingMetadata?.hospitalCode === hospital.code && existingMetadata?.sourcePrefix === settings.prefix) {
    return {
      ...existingMetadata,
      mode: "r2",
      provisioned: true,
      copied: 0,
      skipped: existingMetadata.templateObjects || 0
    };
  }
  const sourceObjects = await listR2Objects(settings.prefix);
  let copied = 0;
  let skipped = 0;
  const copyObject = async (sourceObject) => {
    const relativePath = sourceObject.Key.slice(settings.prefix.length);
    const destinationKey = `${destinationPrefix}${relativePath}`;
    if (await objectExists(settings.bucket, destinationKey)) return "skipped";
    await client().send(new CopyObjectCommand({
      Bucket: settings.bucket,
      Key: destinationKey,
      CopySource: `${settings.bucket}/${encodeURIComponent(sourceObject.Key).replace(/%2F/g, "/")}`
    }));
    return "copied";
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
    sourcePrefix: settings.prefix,
    destinationPrefix,
    provisionedAt: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
    templateObjects: sourceObjects.length,
    copied,
    skipped
  };
  await client().send(new PutObjectCommand({
    Bucket: settings.bucket,
    Key: `${destinationPrefix}client.json`,
    Body: JSON.stringify(metadata, null, 2),
    ContentType: "application/json"
  }));
  return { mode: "r2", provisioned: true, ...metadata };
}