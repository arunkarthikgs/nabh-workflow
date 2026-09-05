// Generates a single self-contained HTML prototype (data, styles, and logo all inlined) so it
// can be opened directly (double-click) or shared without needing npm/build tooling or a server.
// Active/Inactive toggling in the prototype is visual-only (resets on reload, no persistence).
// Run: node workflows/generatePrototypeHtml.js
import { cp, readFile, rm, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function run() {
  const projectPath = fileURLToPath(new URL("..", import.meta.url));
  const webPath = fileURLToPath(new URL("../web", import.meta.url));
  const buildPath = fileURLToPath(new URL("../web/dist", import.meta.url));
  const prototypePath = fileURLToPath(new URL("../prototype", import.meta.url));
  await execFileAsync("npm", ["run", "build"], { cwd: webPath });
  await rm(prototypePath, { recursive: true, force: true });
  await cp(buildPath, prototypePath, { recursive: true });
  const prototypeIndexPath = path.join(prototypePath, "index.html");
  const prototypeIndex = await readFile(prototypeIndexPath, "utf8");
  await writeFile(prototypeIndexPath, prototypeIndex.replace("<head>", "<head><script>if (location.protocol === 'file:') location.replace('http://127.0.0.1:4000/prototype/');</script>"));

  const dataPath = fileURLToPath(new URL("../output/documentMatches.json", import.meta.url));
  const logoPath = fileURLToPath(new URL("../logo.png", import.meta.url));
  const aacPolicyPdfPath = fileURLToPath(new URL("../output/AAC_Policy_Presentation.pdf", import.meta.url));
  const aacPolicyWordPath = fileURLToPath(new URL("../output/AAC_Policy_Modified.docx", import.meta.url));
  const outputPath = fileURLToPath(new URL("../prototype.html", import.meta.url));

  await writeFile(outputPath, `<!doctype html><meta charset="UTF-8"><title>NABH Current Prototype</title><script>location.replace("http://127.0.0.1:4000/prototype/");</script><p>Opening the current NABH prototype...</p>`);
  console.log(`Current application prototype generated: ${prototypePath}/index.html`);
  console.log(`Prototype launcher generated: ${outputPath}`);
}

function buildHtml(departments, logoBase64, aacPolicyPdfBase64, aacPolicyWordBase64) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Master List of Documents - Prototype</title>
<style>
${css()}
</style>
</head>
<body>
<main id="root"></main>
<script>
const DEPARTMENTS = ${JSON.stringify(departments)};
const LOGO_SRC = "data:image/png;base64,${logoBase64}";
const AAC_POLICY_PDF_SRC = "data:application/pdf;base64,${aacPolicyPdfBase64}";
const AAC_POLICY_WORD_SRC = "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${aacPolicyWordBase64}";
${js()}
</script>
</body>
</html>
`;
}

function css() {
  return `
@import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap");
:root { color: #3a3f6b; background: #e9e9f8; font-family: "Poppins", sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; background: linear-gradient(160deg, #eceafd 0%, #e4e6fb 55%, #ecebfc 100%); min-height: 100vh; }
main { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 72px; display: block; }
header { margin-bottom: 28px; }
.brand { align-items: center; color: #3547d1; display: flex; gap: 12px; margin-bottom: 10px; }
.brand img { height: 48px; width: auto; }
.eyebrow { color: #6c6fb0; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; margin: 0 0 4px; text-transform: uppercase; }
h1 { color: #34375f; font-size: 34px; font-weight: 700; margin: 0; }
h2 { color: #34375f; font-size: 20px; font-weight: 600; margin: 0; }
.intro { color: #6c6fb0; font-size: 14px; margin: 6px 0 0; }
.active-count { background: #e4f7ec; border-radius: 999px; color: #1e9e5c; font-weight: 600; padding: 2px 9px; }
.inactive-count { background: #f1f2fc; border-radius: 999px; color: #8a8dc7; font-weight: 600; padding: 2px 9px; }
.layout { display: grid; gap: 24px; grid-template-columns: 280px 1fr; align-items: start; }
.department-list { background: #ffffff; border-radius: 14px; box-shadow: 0 18px 38px rgba(84, 92, 176, 0.14); display: flex; flex-direction: column; max-height: 75vh; overflow-y: auto; padding: 10px; }
.department-list button { align-items: center; background: transparent; border: 0; border-radius: 10px; color: #4a4e82; cursor: pointer; display: flex; font: 500 14px Poppins; gap: 6px; padding: 12px 14px; text-align: left; width: 100%; }
.department-list button:hover { background: #eef0ff; }
.department-list button.dept-active { background: #3547d1; color: #ffffff; }
.department-list button.dept-active .count-pill-active { background: rgba(255, 255, 255, 0.3); color: #ffffff; }
.department-list button.dept-active .count-pill-inactive { background: rgba(255, 255, 255, 0.15); color: #ffffff; }
.department-list button span.dept-name { flex: 1; }
.count { background: #eef0ff; border-radius: 999px; color: #5a5ec7; font-size: 11px; font-weight: 600; padding: 2px 9px; }
.count-pill { border-radius: 999px; font-size: 10px; font-weight: 700; min-width: 20px; padding: 2px 7px; text-align: center; }
.count-pill-active { background: #e4f7ec; color: #1e9e5c; }
.count-pill-inactive { background: #eceafd; color: #8a8dc7; }
.filter-box { align-items: center; background: #f4f5ff; border: 1px solid #e2e4fb; border-radius: 10px; color: #8a8dc7; display: flex; gap: 8px; margin-bottom: 8px; padding: 9px 12px; }
.filter-box input { background: transparent; border: 0; color: #3a3f6b; flex: 1; font: 400 13px Poppins; outline: none; }
.filter-box input::placeholder { color: #a3a6d6; }
.document-search { margin-bottom: 16px; }
.empty { color: #8a8dc7; font-size: 13px; padding: 14px; text-align: center; }
.document-panel { background: #ffffff; border-radius: 14px; box-shadow: 0 18px 38px rgba(84, 92, 176, 0.14); padding: 22px 26px; }
.panel-heading { align-items: center; border-bottom: 1px solid #eceeff; color: #3547d1; display: flex; gap: 10px; margin-bottom: 16px; padding-bottom: 14px; }
.panel-heading .count { margin-left: auto; }
.panel-heading .active-count, .panel-heading .inactive-count { font-size: 11px; }
table { border-collapse: collapse; width: 100%; }
th { color: #6c6fb0; font-size: 11px; font-weight: 600; letter-spacing: 0.05em; padding: 8px 10px; text-align: left; text-transform: uppercase; }
td { border-top: 1px solid #f1f2fc; color: #3a3f6b; font-size: 13px; padding: 10px; vertical-align: top; }
td.mono { color: #6c6fb0; font-family: "DM Mono", monospace; font-size: 12px; white-space: nowrap; }
td.file-cell { color: #4a4e82; }
td.file-cell a { color: #3547d1; text-decoration: none; word-break: break-word; }
td.file-cell a:hover { text-decoration: underline; }
td.file-cell .no-match { color: #a3a6d6; font-style: italic; }
.reused { color: #b06a1e; font-size: 11px; }
.policy-actions { display: inline-flex; gap: 4px; margin-left: 8px; vertical-align: middle; }
tr.doc-inactive td { color: #b3b5d6; }
tr.doc-inactive td.mono { color: #c5c7e0; }
.toggle-switch { background: #d9dbf2; border: 0; border-radius: 999px; cursor: pointer; height: 20px; padding: 2px; position: relative; transition: background 0.15s ease; width: 36px; vertical-align: middle; }
.toggle-switch.toggle-on { background: #1e9e5c; }
.toggle-thumb { background: #ffffff; border-radius: 999px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25); display: block; height: 16px; transition: transform 0.15s ease; width: 16px; }
.toggle-switch.toggle-on .toggle-thumb { transform: translateX(16px); }
.toggle-label { font-size: 11px; font-weight: 600; margin-left: 8px; vertical-align: middle; }
.status-active { color: #1e9e5c; }
.status-inactive { color: #8a8dc7; }
.badge { border-radius: 999px; font-size: 11px; font-weight: 600; padding: 3px 10px; text-transform: capitalize; }
.badge-high { background: #e4f7ec; color: #1e9e5c; }
.badge-medium { background: #fff4dd; color: #b0791e; }
.badge-low { background: #ffe9ec; color: #c23a56; }
th.sortable { cursor: pointer; user-select: none; }
th.sortable:hover { color: #3547d1; }
.toolbar { align-items: center; display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; margin-bottom: 14px; }
.confidence-chips { display: flex; gap: 6px; }
.chip { background: #f4f5ff; border: 1px solid #e2e4fb; border-radius: 999px; color: #6c6fb0; cursor: pointer; font: 500 12px Poppins; padding: 6px 12px; }
.chip:hover { background: #eceafd; }
.chip-active { background: #3547d1; border-color: #3547d1; color: #ffffff; }
.only-inactive { align-items: center; color: #6c6fb0; display: flex; font-size: 13px; gap: 6px; }
.only-inactive input { accent-color: #3547d1; }
.bulk-bar { align-items: center; background: #eef0ff; border-radius: 10px; color: #3547d1; display: flex; font-size: 13px; font-weight: 600; gap: 12px; margin-bottom: 14px; padding: 10px 14px; }
.bulk-bar button { background: #3547d1; border: 0; border-radius: 999px; color: #ffffff; cursor: pointer; font: 600 12px Poppins; padding: 6px 14px; }
.bulk-bar button.bulk-clear { background: transparent; color: #3547d1; }
.version-cell { white-space: nowrap; }
.version-actions, .edit-actions { align-items: center; display: flex; gap: 6px; }
.version-badge { align-items: center; background: #f4f5ff; border: 1px solid #e2e4fb; border-radius: 999px; color: #6c6fb0; cursor: pointer; display: inline-flex; font: 600 11px Poppins; gap: 4px; padding: 3px 9px; }
.version-badge:hover { background: #eceafd; color: #3547d1; }
.icon-button { align-items: center; background: transparent; border: 0; border-radius: 6px; color: #8a8dc7; cursor: pointer; display: inline-flex; padding: 4px; }
.icon-button:hover { background: #eef0ff; color: #3547d1; }
.icon-button.check { color: #1e9e5c; }
.icon-button.cancel { color: #c23a56; }
.edit-input { background: #fbfbff; border: 1px solid #c7cdf7; border-radius: 6px; color: #3a3f6b; font: 400 12px Poppins; padding: 5px 7px; width: 100%; }
tr.history-row td { background: #f8f9ff; padding: 12px 16px; }
.history-table { border-collapse: collapse; font-size: 12px; width: 100%; }
.history-table th { color: #8a8dc7; font-size: 10px; padding: 4px 8px; }
.history-table td { border-top: 1px solid #eceeff; color: #4a4e82; padding: 6px 8px; }
.preview-backdrop { align-items: center; background: rgba(36, 39, 76, 0.56); display: flex; inset: 0; justify-content: center; padding: 24px; position: fixed; z-index: 20; }
.preview-dialog { background: #ffffff; border-radius: 12px; box-shadow: 0 24px 80px rgba(30, 31, 74, 0.34); display: flex; flex-direction: column; height: min(90vh, 980px); max-width: 1100px; width: 100%; }
.preview-header { align-items: center; border-bottom: 1px solid #eceeff; display: flex; justify-content: space-between; padding: 18px 22px; }
.preview-header .eyebrow { margin-bottom: 3px; }
.preview-actions { align-items: center; display: flex; gap: 10px; }
.download-button { align-items: center; background: #3547d1; border-radius: 6px; color: #ffffff; display: inline-flex; font: 600 12px Poppins; gap: 7px; padding: 9px 12px; text-decoration: none; }
.download-button:hover { background: #293bb9; }
.policy-preview { border: 0; flex: 1; min-height: 0; width: 100%; }
.prototype-banner { background: #fff4dd; border-radius: 10px; color: #8a5a10; font-size: 12px; font-weight: 600; margin-bottom: 18px; padding: 8px 14px; text-align: center; }
@media (max-width: 780px) { .layout { grid-template-columns: 1fr; } .department-list { max-height: none; } .preview-backdrop { padding: 0; } .preview-dialog { border-radius: 0; height: 100vh; } .preview-header { align-items: flex-start; gap: 12px; } .download-button { font-size: 0; padding: 9px; } .download-button svg { height: 18px; width: 18px; } }
`;
}

function js() {
  return `
const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    department: params.get("dept") || null,
    departmentFilter: params.get("deptq") || "",
    documentSearch: params.get("q") || "",
    confidenceFilter: params.get("conf") || "all",
    onlyInactive: params.get("onlyInactive") === "1",
    sortColumn: params.get("sort") || null,
    sortDirection: params.get("dir") || "asc"
  };
}

const initialUrlState = readUrlState();
let selected = initialUrlState.department && DEPARTMENTS[initialUrlState.department] ? initialUrlState.department : Object.keys(DEPARTMENTS)[0] || null;
let departmentFilter = initialUrlState.departmentFilter;
let documentSearch = initialUrlState.documentSearch;
let confidenceFilter = initialUrlState.confidenceFilter;
let onlyInactive = initialUrlState.onlyInactive;
let sortColumn = initialUrlState.sortColumn;
let sortDirection = initialUrlState.sortDirection;
let selectedIndexes = new Set();
let editingIndex = null;
let editDraft = null;
let expandedHistoryIndex = null;
let previewAacPolicy = false;

function isAacPolicy(doc) {
  return doc.documentId === "JPH/NABH/D-14A/Rev 00";
}

function fileUrl(filePath) {
  return "file://" + filePath.split("/").map(encodeURIComponent).join("/");
}

function downloadAacPolicy() {
  const link = document.createElement("a");
  link.href = AAC_POLICY_WORD_SRC;
  link.download = "AAC_Policy_Modified.docx";
  link.click();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function computeTotals() {
  const counts = { departments: Object.keys(DEPARTMENTS).length, documents: 0, high: 0, medium: 0, low: 0, active: 0, inactive: 0 };
  for (const docs of Object.values(DEPARTMENTS)) {
    counts.documents += docs.length;
    for (const doc of docs) {
      counts[doc.confidence]++;
      counts[doc.active ? "active" : "inactive"]++;
    }
  }
  return counts;
}

function toggleActive(index) {
  DEPARTMENTS[selected][index].active = !DEPARTMENTS[selected][index].active;
  render();
}

function bulkSetActive(nextActive) {
  for (const index of selectedIndexes) DEPARTMENTS[selected][index].active = nextActive;
  selectedIndexes = new Set();
  render();
}

function setSort(column) {
  if (sortColumn !== column) { sortColumn = column; sortDirection = "asc"; }
  else if (sortDirection === "asc") { sortDirection = "desc"; }
  else { sortColumn = null; sortDirection = "asc"; }
  render();
}

function startEdit(index) {
  const doc = DEPARTMENTS[selected][index];
  editingIndex = index;
  editDraft = { documentName: doc.documentName, documentId: doc.documentId, matchedFilePath: doc.matchedFilePath || "" };
  render();
}

function cancelEdit() {
  editingIndex = null;
  editDraft = null;
  render();
}

function checkInEdit(index) {
  const editor = window.prompt("Your name or initials, to record who made this change:");
  if (!editor || !editor.trim()) return;

  const doc = DEPARTMENTS[selected][index];
  const changes = {};
  for (const field of ["documentName", "documentId", "matchedFilePath"]) {
    if (editDraft[field] !== doc[field]) {
      changes[field] = { from: doc[field], to: editDraft[field] };
      doc[field] = editDraft[field];
    }
  }

  if (Object.keys(changes).length > 0) {
    if (changes.matchedFilePath) doc.relativeFilePath = null;
    doc.version = (doc.version || 1) + 1;
    doc.history = doc.history || [];
    doc.history.push({ version: doc.version, timestamp: new Date().toISOString(), editor: editor.trim(), action: "edited", changes });
  }

  editingIndex = null;
  editDraft = null;
  render();
}

function toggleHistory(index) {
  expandedHistoryIndex = expandedHistoryIndex === index ? null : index;
  render();
}

function syncUrl() {
  const params = new URLSearchParams();
  if (selected) params.set("dept", selected);
  if (departmentFilter) params.set("deptq", departmentFilter);
  if (documentSearch) params.set("q", documentSearch);
  if (confidenceFilter !== "all") params.set("conf", confidenceFilter);
  if (onlyInactive) params.set("onlyInactive", "1");
  if (sortColumn) { params.set("sort", sortColumn); params.set("dir", sortDirection); }
  const query = params.toString();
  window.history.replaceState(null, "", query ? "?" + query : window.location.pathname);
}

function render() {
  syncUrl();
  const totals = computeTotals();
  const deptQuery = departmentFilter.trim().toLowerCase();
  const filteredDepartmentEntries = Object.entries(DEPARTMENTS).filter(([name]) => name.toLowerCase().includes(deptQuery));

  const documents = selected ? DEPARTMENTS[selected] : [];
  const docQuery = documentSearch.trim().toLowerCase();
  const confidenceCounts = { all: documents.length, high: 0, medium: 0, low: 0 };
  for (const doc of documents) confidenceCounts[doc.confidence]++;

  let filteredDocuments = documents.map((doc, index) => ({ doc, index }));
  if (confidenceFilter !== "all") filteredDocuments = filteredDocuments.filter(({ doc }) => doc.confidence === confidenceFilter);
  if (onlyInactive) filteredDocuments = filteredDocuments.filter(({ doc }) => !doc.active);
  if (docQuery) {
    filteredDocuments = filteredDocuments.filter(({ doc }) =>
      doc.documentName.toLowerCase().includes(docQuery) ||
      doc.documentId.toLowerCase().includes(docQuery) ||
      (doc.matchedFilePath || "").toLowerCase().includes(docQuery));
  }
  if (sortColumn) {
    const direction = sortDirection === "desc" ? -1 : 1;
    filteredDocuments = [...filteredDocuments].sort((a, b) => {
      if (sortColumn === "confidence") return (CONFIDENCE_RANK[a.doc.confidence] - CONFIDENCE_RANK[b.doc.confidence]) * direction;
      return a.doc.documentId.localeCompare(b.doc.documentId) * direction;
    });
  }

  const deptActive = documents.filter((d) => d.active).length;
  const deptInactive = documents.length - deptActive;
  const allFilteredSelected = filteredDocuments.length > 0 && filteredDocuments.every(({ index }) => selectedIndexes.has(index));
  const sortArrow = (column) => (sortColumn !== column ? "" : sortDirection === "asc" ? " &#9650;" : " &#9660;");

  document.getElementById("root").innerHTML = \`
    <div class="prototype-banner">Prototype build - Active/Inactive changes are for demo purposes only and are not saved.</div>
    <header>
      <div class="brand">
        <img src="\${LOGO_SRC}" alt="Janapriya Hospital" />
        <div>
          <p class="eyebrow">NABH document workspace</p>
          <h1>Master List of Documents</h1>
        </div>
      </div>
      <p class="intro">
        \${totals.departments} departments &middot; \${totals.documents} documents &middot; \${totals.high} high-confidence &middot; \${totals.medium} medium &middot; \${totals.low} flagged &middot;
        <span class="active-count">\${totals.active} active</span> &middot; <span class="inactive-count">\${totals.inactive} inactive</span>
      </p>
    </header>
    <div class="layout">
      <nav class="department-list">
        <label class="filter-box">
          <span>&#128269;</span>
          <input type="text" id="dept-filter" placeholder="Filter departments" value="\${escapeHtml(departmentFilter)}" />
        </label>
        \${filteredDepartmentEntries.map(([name, docs]) => {
          const activeCount = docs.filter((d) => d.active).length;
          return \`
          <button class="\${name === selected ? "dept-active" : ""}" data-department="\${escapeHtml(name)}">
            <span>&#128193;</span>
            <span class="dept-name">\${escapeHtml(name)}</span>
            <span class="count-pill count-pill-active">\${activeCount}</span>
            <span class="count-pill count-pill-inactive">\${docs.length - activeCount}</span>
          </button>
        \`;
        }).join("")}
        \${filteredDepartmentEntries.length === 0 ? '<p class="empty">No departments match.</p>' : ""}
      </nav>
      <section class="document-panel">
        <div class="panel-heading">
          <span>&#128269;</span>
          <h2>\${escapeHtml(selected || "")}</h2>
          <span class="count">\${filteredDocuments.length} of \${documents.length} document(s)</span>
          <span class="active-count">\${deptActive} active</span>
          <span class="inactive-count">\${deptInactive} inactive</span>
        </div>
        <label class="filter-box document-search">
          <span>&#128269;</span>
          <input type="text" id="doc-search" placeholder="Search by document name, ID, or matched file" value="\${escapeHtml(documentSearch)}" />
        </label>
        <div class="toolbar">
          <div class="confidence-chips">
            \${["all", "high", "medium", "low"].map((level) => \`
              <button class="chip \${level === confidenceFilter ? "chip-active" : ""}" data-confidence="\${level}">
                \${level === "all" ? "All" : level.charAt(0).toUpperCase() + level.slice(1)} (\${confidenceCounts[level]})
              </button>
            \`).join("")}
          </div>
          <label class="only-inactive">
            <input type="checkbox" id="only-inactive" \${onlyInactive ? "checked" : ""} />
            Show only inactive
          </label>
        </div>
        \${selectedIndexes.size > 0 ? \`
          <div class="bulk-bar">
            <span>\${selectedIndexes.size} selected</span>
            <button data-bulk="active">Mark Active</button>
            <button data-bulk="inactive">Mark Inactive</button>
            <button class="bulk-clear" data-bulk="clear">Clear</button>
          </div>
        \` : ""}
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" id="select-all" \${allFilteredSelected ? "checked" : ""} /></th>
              <th>Active</th>
              <th class="sortable" data-sort="documentId">Document ID\${sortArrow("documentId")}</th>
              <th>Document Name</th>
              <th>Matched File</th>
              <th class="sortable" data-sort="confidence">Confidence\${sortArrow("confidence")}</th>
              <th>Version</th>
            </tr>
          </thead>
          <tbody>
            \${filteredDocuments.map(({ doc, index }) => {
              const isEditing = editingIndex === index;
              const row = \`
              <tr class="\${doc.active ? "doc-active" : "doc-inactive"}">
                <td><input type="checkbox" data-select-index="\${index}" \${selectedIndexes.has(index) ? "checked" : ""} /></td>
                <td>
                  <button type="button" role="switch" aria-checked="\${doc.active}" class="toggle-switch \${doc.active ? "toggle-on" : "toggle-off"}" data-toggle-index="\${index}">
                    <span class="toggle-thumb"></span>
                  </button>
                  <span class="toggle-label \${doc.active ? "status-active" : "status-inactive"}">\${doc.active ? "Active" : "Inactive"}</span>
                </td>
                <td class="mono">\${isEditing ? \`<input class="edit-input" data-edit-field="documentId" value="\${escapeHtml(editDraft.documentId)}" />\` : escapeHtml(doc.documentId)}</td>
                <td>\${isEditing ? \`<input class="edit-input" data-edit-field="documentName" value="\${escapeHtml(editDraft.documentName)}" />\` : escapeHtml(doc.documentName)}</td>
                <td class="file-cell" title="\${escapeHtml(doc.matchedFilePath || "")}">
                  \${isEditing
                    ? \`<input class="edit-input" data-edit-field="matchedFilePath" value="\${escapeHtml(editDraft.matchedFilePath)}" />\`
                    : doc.matchedFilePath
                      ? \`<a href="\${fileUrl(doc.matchedFilePath)}" target="_blank" rel="noopener noreferrer">\${escapeHtml(doc.relativeFilePath || doc.matchedFilePath)}</a>\`
                      : '<span class="no-match">No file matched</span>'}
                  \${!isEditing && doc.reusedAcrossDocuments ? \`<span class="reused"> (reused x\${doc.reusedAcrossDocuments})</span>\` : ""}
                  \${!isEditing && isAacPolicy(doc) ? \`
                    <span class="policy-actions">
                      <button class="icon-button" title="Preview AAC policy" data-preview-aac>&#128065;</button>
                      <button class="icon-button" title="Download modified AAC policy Word document" data-download-aac>&#8681;</button>
                    </span>
                  \` : ""}
                </td>
                <td><span class="badge badge-\${doc.confidence}">\${doc.confidence}</span></td>
                <td class="version-cell">
                  \${isEditing ? \`
                    <span class="edit-actions">
                      <button class="icon-button check" title="Check in" data-checkin-index="\${index}">&#10003;</button>
                      <button class="icon-button cancel" title="Cancel" data-cancel-index="\${index}">&#10005;</button>
                    </span>
                  \` : \`
                    <span class="version-actions">
                      <button class="version-badge" title="View history" data-history-index="\${index}">&#128337; v\${doc.version || 1}</button>
                      <button class="icon-button" title="Edit" data-edit-index="\${index}">&#9998;</button>
                    </span>
                  \`}
                </td>
              </tr>
              \${expandedHistoryIndex === index ? \`
                <tr class="history-row">
                  <td colspan="7">
                    <table class="history-table">
                      <thead><tr><th>Version</th><th>When</th><th>By</th><th>Action</th><th>Changes</th></tr></thead>
                      <tbody>
                        \${[...(doc.history || [])].reverse().map((entry) => \`
                          <tr>
                            <td>v\${entry.version}</td>
                            <td>\${new Date(entry.timestamp).toLocaleString()}</td>
                            <td>\${escapeHtml(entry.editor)}</td>
                            <td>\${escapeHtml(entry.action)}</td>
                            <td>\${Object.keys(entry.changes || {}).length === 0 ? "-" : Object.entries(entry.changes).map(([field, change]) => \`<div><strong>\${field}:</strong> "\${escapeHtml(change.from)}" &rarr; "\${escapeHtml(change.to)}"</div>\`).join("")}</td>
                          </tr>
                        \`).join("")}
                      </tbody>
                    </table>
                  </td>
                </tr>
              \` : ""}
              \`;
              return row;
            }).join("")}
            \${filteredDocuments.length === 0 ? '<tr><td colspan="7" class="empty">No documents match your filters.</td></tr>' : ""}
          </tbody>
        </table>
      </section>
    </div>
    \${previewAacPolicy ? \`
      <div class="preview-backdrop" data-close-aac-preview>
        <section class="preview-dialog" role="dialog" aria-modal="true" aria-label="AAC policy preview">
          <div class="preview-header">
            <div><p class="eyebrow">Modified document preview</p><h2>AAC Policy</h2></div>
            <div class="preview-actions">
              <button class="download-button" data-download-aac>&#8681; Download matching Word document</button>
              <button class="icon-button" title="Close preview" data-close-aac-preview>&#10005;</button>
            </div>
          </div>
          <iframe class="policy-preview" src="\${AAC_POLICY_PDF_SRC}" title="AAC policy PDF preview"></iframe>
        </section>
      </div>
    \` : ""}
  \`;

  document.querySelectorAll("[data-department]").forEach((button) => {
    button.addEventListener("click", () => { selected = button.dataset.department; selectedIndexes = new Set(); render(); });
  });
  document.querySelectorAll("[data-toggle-index]").forEach((button) => {
    button.addEventListener("click", () => toggleActive(Number(button.dataset.toggleIndex)));
  });
  document.querySelectorAll("[data-confidence]").forEach((button) => {
    button.addEventListener("click", () => { confidenceFilter = button.dataset.confidence; render(); });
  });
  document.querySelectorAll("[data-sort]").forEach((th) => {
    th.addEventListener("click", () => setSort(th.dataset.sort));
  });
  document.querySelectorAll("[data-bulk]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.bulk === "active") bulkSetActive(true);
      else if (button.dataset.bulk === "inactive") bulkSetActive(false);
      else { selectedIndexes = new Set(); render(); }
    });
  });
  document.querySelectorAll("[data-select-index]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const index = Number(checkbox.dataset.selectIndex);
      if (selectedIndexes.has(index)) selectedIndexes.delete(index); else selectedIndexes.add(index);
      render();
    });
  });
  const selectAll = document.getElementById("select-all");
  if (selectAll) {
    selectAll.addEventListener("change", () => {
      if (allFilteredSelected) selectedIndexes = new Set();
      else selectedIndexes = new Set(filteredDocuments.map(({ index }) => index));
      render();
    });
  }
  const onlyInactiveInput = document.getElementById("only-inactive");
  onlyInactiveInput.addEventListener("change", (e) => { onlyInactive = e.target.checked; render(); });
  document.querySelectorAll("[data-edit-index]").forEach((button) => {
    button.addEventListener("click", () => startEdit(Number(button.dataset.editIndex)));
  });
  document.querySelectorAll("[data-checkin-index]").forEach((button) => {
    button.addEventListener("click", () => checkInEdit(Number(button.dataset.checkinIndex)));
  });
  document.querySelectorAll("[data-cancel-index]").forEach((button) => {
    button.addEventListener("click", cancelEdit);
  });
  document.querySelectorAll("[data-history-index]").forEach((button) => {
    button.addEventListener("click", () => toggleHistory(Number(button.dataset.historyIndex)));
  });
  document.querySelectorAll("[data-edit-field]").forEach((input) => {
    input.addEventListener("input", (e) => { editDraft[input.dataset.editField] = e.target.value; });
  });
  document.querySelectorAll("[data-preview-aac]").forEach((button) => {
    button.addEventListener("click", () => { previewAacPolicy = true; render(); });
  });
  document.querySelectorAll("[data-download-aac]").forEach((button) => {
    button.addEventListener("click", downloadAacPolicy);
  });
  document.querySelectorAll("[data-close-aac-preview]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target === element || element.matches("button")) { previewAacPolicy = false; render(); }
    });
  });
  const deptFilterInput = document.getElementById("dept-filter");
  deptFilterInput.addEventListener("input", (e) => { departmentFilter = e.target.value; render(); focusEnd("dept-filter"); });
  const docSearchInput = document.getElementById("doc-search");
  docSearchInput.addEventListener("input", (e) => { documentSearch = e.target.value; render(); focusEnd("doc-search"); });
}

function focusEnd(id) {
  const el = document.getElementById(id);
  el.focus();
  el.setSelectionRange(el.value.length, el.value.length);
}

render();
`;
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
