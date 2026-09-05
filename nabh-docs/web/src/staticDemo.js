import { documents, hospitals } from "./generatedStaticData.js";

const copy = (value) => JSON.parse(JSON.stringify(value));
const state = { documents: copy(documents), hospitals: copy(hospitals) };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function hospitalById(id) {
  return state.hospitals.find((hospital) => hospital.id === id);
}

function updateDocument(department, id, changes) {
  const document = state.documents[department]?.find((item) => item.id === id);
  if (!document) return null;
  Object.assign(document, changes);
  return document;
}

const identifier = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const requestBody = (options) => {
  if (!options.body) return {};
  return typeof options.body === "string" ? JSON.parse(options.body) : options.body;
};

export function installStaticDemo() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, options = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const method = (options.method || "GET").toUpperCase();
    const body = requestBody(options);

    if (url === "/api/document-matches" && method === "GET") return json(copy(state.documents));
    const documentMatch = url.match(/^\/api\/document-matches\/([^/]+)\/(active|edit)$/);
    if (documentMatch && method === "PATCH") {
      const department = decodeURIComponent(documentMatch[1]);
      const isCheckIn = documentMatch[2] === "edit" && body.fields?.content !== undefined;
      const document = updateDocument(department, body.id, documentMatch[2] === "active" ? { active: Boolean(body.active) } : body.fields);
      if (document && isCheckIn) {
        document.version = (document.version || 1) + 1;
        document.history = [...(document.history || []), { version: document.version, timestamp: new Date().toISOString(), editor: body.editor || "Prototype user", action: "document check-in", changes: { content: { from: "Previous version", to: "Content updated" } } }];
      }
      return document ? json(documentMatch[2] === "edit" ? { ok: true, document: copy(document) } : { ok: true, active: document.active }) : json({ error: "Document not found." }, 404);
    }

    if (url === "/api/admin/hospitals" && method === "GET") return json({ hospitals: copy(state.hospitals) });
    if (url === "/api/admin/hospitals" && method === "POST") {
      const hospital = { ...body, id: identifier(), users: [], roles: [], logoPath: body.logoDataUrl || "" };
      state.hospitals.push(hospital);
      return json({ hospital: copy(hospital) }, 201);
    }

    const hospitalMatch = url.match(/^\/api\/admin\/hospitals\/([^/]+)(?:\/(users|roles)(?:\/([^/]+))?)?$/);
    if (hospitalMatch) {
      const hospital = hospitalById(hospitalMatch[1]);
      if (!hospital) return json({ error: "Hospital not found." }, 404);
      const [, , collectionName, recordId] = hospitalMatch;
      if (!collectionName) {
        if (method === "PATCH") {
          Object.assign(hospital, body, { logoPath: body.logoDataUrl || hospital.logoPath });
          return json({ hospital: copy(hospital) });
        }
        if (method === "DELETE") {
          state.hospitals = state.hospitals.filter((item) => item.id !== hospital.id);
          return new Response(null, { status: 204 });
        }
      }

      const collection = collectionName === "users" ? hospital.users : hospital.roles;
      const singular = collectionName === "users" ? "user" : "role";
      if (method === "GET") return json({ [collectionName]: copy(collection) });
      if (method === "POST") {
        const record = { ...body, id: identifier(), active: body.active ?? true, createdAt: new Date().toISOString() };
        collection.push(record);
        return json({ [singular]: copy(record) }, 201);
      }
      const record = collection.find((item) => item.id === recordId);
      if (!record) return json({ error: `${singular} not found.` }, 404);
      if (method === "PATCH") {
        Object.assign(record, body);
        return json({ [singular]: copy(record) });
      }
      if (method === "DELETE") {
        const index = collection.indexOf(record);
        collection.splice(index, 1);
        return new Response(null, { status: 204 });
      }
    }

    if (url.startsWith("/api/documents/")) return new Response("Document files are not embedded in this standalone prototype.", { status: 404 });
    return nativeFetch(input, options);
  };
}
