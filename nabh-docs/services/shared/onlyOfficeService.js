import { createHmac, createHash, randomUUID, timingSafeEqual } from "crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";

const base64url = (value) => Buffer.from(value).toString("base64url");
const unbase64url = (value) => Buffer.from(value, "base64url").toString("utf8");
const safeSegment = (value) => String(value).replace(/[^a-zA-Z0-9._-]/g, "_");

function documentType(fileType) {
  if (["xls", "xlsx", "xlsm", "csv", "ods"].includes(fileType)) return "cell";
  if (["ppt", "pptx", "odp"].includes(fileType)) return "slide";
  return "word";
}

function sign(payload, secret) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verify(token, secret) {
  const [header, body, signature] = String(token || "").split(".");
  if (!header || !body || !signature) return false;
  const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false;
  try { return JSON.parse(unbase64url(body)); } catch { return false; }
}

export function createOnlyOfficeService({ dataPath, storageDir, auditPath, publicBaseUrl, documentServerUrl, jwtSecret }) {
  const sessions = new Map();
  const normalizedDocumentServerUrl = documentServerUrl?.replace(/\/$/, "");

  async function readDepartments() {
    return JSON.parse(await readFile(dataPath, "utf8"));
  }

  async function findDocument(department, id) {
    const departments = await readDepartments();
    const document = departments[department]?.find((item) => item.id === id);
    if (!document) return { departments, document: null };
    return { departments, document };
  }

  function versionDirectory(document) {
    return path.join(storageDir, safeSegment(document.id));
  }

  function extension(document) {
    return path.extname(document.controlledFilePath || document.matchedFilePath || "").slice(1).toLowerCase() || "docx";
  }

  async function currentFile(document) {
    if (document.controlledFilePath) return document.controlledFilePath;
    if (!document.matchedFilePath) throw new Error("This document has no matched source file.");
    const version = document.version || 1;
    const destination = path.join(versionDirectory(document), `v${version}.${extension(document)}`);
    await mkdir(path.dirname(destination), { recursive: true });
    try { await stat(destination); } catch { await copyFile(document.matchedFilePath, destination); }
    document.controlledFilePath = destination;
    return destination;
  }

  function baseUrl(request) {
    return publicBaseUrl || `${request.protocol}://${request.get("host")}`;
  }

  async function editorConfig({ department, id, editor, checkInNote, request }) {
    if (!normalizedDocumentServerUrl || !jwtSecret) throw new Error("OnlyOffice is not configured. Set ONLYOFFICE_DOCUMENT_SERVER_URL and ONLYOFFICE_JWT_SECRET.");
    const { departments, document } = await findDocument(department, id);
    if (!document) return null;
    const filePath = await currentFile(document);
    await writeFile(dataPath, JSON.stringify(departments, null, 2));
    const fileType = extension(document);
    const version = document.version || 1;
    const sessionId = randomUUID();
    const key = `${document.id}-${version}-${(await stat(filePath)).mtimeMs}`;
    sessions.set(sessionId, { department, id, editor: editor || "NABH user", checkInNote: checkInNote || "OnlyOffice check-in", key });
    const origin = baseUrl(request);
    const config = {
      documentType: documentType(fileType),
      type: "desktop",
      document: {
        fileType,
        key,
        title: path.basename(filePath),
        url: `${origin}/api/documents/${encodeURIComponent(department)}/${encodeURIComponent(id)}/content`,
        permissions: { edit: true, download: true, print: true }
      },
      editorConfig: {
        callbackUrl: `${origin}/api/documents/onlyoffice/callback/${sessionId}`,
        mode: "edit",
        user: { id: editor || "nabh-user", name: editor || "NABH user" },
        customization: { forcesave: true }
      }
    };
    return { documentServerUrl: normalizedDocumentServerUrl, config: { ...config, token: sign(config, jwtSecret) } };
  }

  async function streamDocument(department, id) {
    const { departments, document } = await findDocument(department, id);
    if (!document) return null;
    const filePath = await currentFile(document);
    await writeFile(dataPath, JSON.stringify(departments, null, 2));
    return { filePath, fileName: path.basename(filePath) };
  }

  async function saveCallback(sessionId, payload) {
    if (!jwtSecret || !verify(payload.token, jwtSecret)) throw new Error("Invalid OnlyOffice callback token.");
    const session = sessions.get(sessionId);
    if (!session) throw new Error("OnlyOffice editing session has expired.");
    if (![2, 6].includes(payload.status)) return { error: 0 };
    if (!payload.url?.startsWith(normalizedDocumentServerUrl)) throw new Error("OnlyOffice callback URL is not trusted.");
    const download = await fetch(payload.url);
    if (!download.ok) throw new Error("Unable to download the saved document from OnlyOffice.");
    const bytes = Buffer.from(await download.arrayBuffer());
    const { departments, document } = await findDocument(session.department, session.id);
    if (!document) throw new Error("Controlled document no longer exists.");
    const previousFile = await currentFile(document);
    const nextVersion = (document.version || 1) + 1;
    const destination = path.join(versionDirectory(document), `v${nextVersion}.${extension(document)}`);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    const previousHash = createHash("sha256").update(await readFile(previousFile)).digest("hex");
    const nextHash = createHash("sha256").update(bytes).digest("hex");
    const timestamp = new Date().toISOString();
    document.version = nextVersion;
    document.controlledFilePath = destination;
    document.history = [...(document.history || []), { version: nextVersion, timestamp, editor: session.editor, action: "onlyoffice check-in", changes: { fileHash: { from: previousHash, to: nextHash }, note: { from: "", to: session.checkInNote } } }];
    await writeFile(dataPath, JSON.stringify(departments, null, 2));
    let audit = [];
    try { audit = JSON.parse(await readFile(auditPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
    audit.unshift({ id: randomUUID(), documentId: document.documentId, documentName: document.documentName, department: session.department, version: nextVersion, editor: session.editor, note: session.checkInNote, timestamp, previousHash, nextHash });
    await mkdir(path.dirname(auditPath), { recursive: true });
    await writeFile(auditPath, JSON.stringify(audit, null, 2));
    sessions.delete(sessionId);
    return { error: 0 };
  }

  async function listAudit() {
    try { return JSON.parse(await readFile(auditPath, "utf8")); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
  }

  return { editorConfig, streamDocument, saveCallback, listAudit };
}
