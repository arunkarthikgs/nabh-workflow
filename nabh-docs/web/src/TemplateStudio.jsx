import { useEffect, useRef, useState } from "react";
import { Sparkles, RefreshCw, Download, Copy, FolderOpen, FileSearch, History, Pencil, Save, X, Search } from "lucide-react";

// Must match NABH_ACCREDITATION_PROGRAMMES in services/shared/accreditationService.js.
const NABH_ACCREDITATION_PROGRAMMES = [
  "Hospitals (HCO)",
  "Small Healthcare Organisations (SHCO) / Nursing Homes",
  "Blood Centres / Blood Banks",
  "Medical Imaging Services (MIS)",
  "Dental Healthcare Service Providers",
  "Allopathic Clinics",
  "AYUSH Hospitals",
  "Panchkarma Clinics",
  "Clinical Trials (Ethics Committees)",
  "Eye Care Organisations",
  "Care Homes",
  "Digital Health",
  "Oral Substitution Therapy Centres",
  "Community Health Centres / Primary Health Centres",
  "Wellness Centres"
];

const JOB_POLL_INTERVAL_MS = 3000;

function blankDocumentDraft() {
  return { name: "", standardRef: "", expectedContent: "", documentPrompt: "" };
}

export default function TemplateStudio() {
  const [programme, setProgramme] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [category, setCategory] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [story, setStory] = useState("");
  const [error, setError] = useState("");

  const [editingCategoryPrompt, setEditingCategoryPrompt] = useState(false);
  const [categoryPromptDraft, setCategoryPromptDraft] = useState("");
  const [savingCategoryPrompt, setSavingCategoryPrompt] = useState(false);
  const [categoryHistoryOpen, setCategoryHistoryOpen] = useState(false);
  const [categoryHistory, setCategoryHistory] = useState(null);

  const [editingDocument, setEditingDocument] = useState(false);
  const [documentDraft, setDocumentDraft] = useState(blankDocumentDraft());
  const [savingDocument, setSavingDocument] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [documentHistoryOpen, setDocumentHistoryOpen] = useState(false);
  const [documentHistory, setDocumentHistory] = useState(null);

  const [job, setJob] = useState(null);
  const [submittingJob, setSubmittingJob] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    fetch("/api/admin/template-studio/categories")
      .then((response) => (response.ok ? response.json() : { categories: [] }))
      .then((result) => setCategories(result.categories || []))
      .catch(() => setCategories([]))
      .finally(() => setCategoriesLoading(false));
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const filteredCategories = categories.filter((item) => item.name.toLowerCase().includes(departmentFilter.trim().toLowerCase()));
  const selectedDocument = documents.find((doc) => String(doc.id) === String(selectedDocumentId)) || null;

  function resetJob() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setJob(null);
  }

  function chooseProgramme(nextProgramme) {
    setProgramme(nextProgramme);
    setCategory(null);
    setDocuments([]);
    setSelectedDocumentId("");
    setStory("");
    setError("");
    resetJob();
  }

  // Documents for a department are loaded by category_id as soon as it's selected.
  function chooseDepartment(nextCategory) {
    setCategory(nextCategory);
    setSelectedDocumentId("");
    setStory("");
    setError("");
    resetJob();
    setEditingCategoryPrompt(false);
    setCategoryHistoryOpen(false);
    setCategoryHistory(null);
    setEditingDocument(false);
    setDocumentHistoryOpen(false);
    setDocumentHistory(null);
    setDocumentsLoading(true);
    fetch(`/api/admin/template-studio/categories/${nextCategory.id}/documents`)
      .then((response) => (response.ok ? response.json() : { documents: [] }))
      .then((result) => setDocuments(result.documents || []))
      .catch(() => setDocuments([]))
      .finally(() => setDocumentsLoading(false));
  }

  function chooseDocument(documentId) {
    setSelectedDocumentId(documentId);
    setEditingDocument(false);
    setDocumentHistoryOpen(false);
    setDocumentHistory(null);
    resetJob();
  }

  async function saveCategoryPrompt() {
    if (!category) return;
    setSavingCategoryPrompt(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/template-studio/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metaPrompt: categoryPromptDraft })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save the meta-prompt.");
      setCategory((current) => ({ ...current, metaPrompt: result.category.metaPrompt }));
      setCategories((current) => current.map((item) => item.id === category.id ? { ...item, metaPrompt: result.category.metaPrompt } : item));
      setEditingCategoryPrompt(false);
      if (categoryHistoryOpen) loadCategoryHistory(category.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingCategoryPrompt(false);
    }
  }

  function loadCategoryHistory(categoryId) {
    fetch(`/api/admin/template-studio/categories/${categoryId}/history`)
      .then((response) => (response.ok ? response.json() : { history: [] }))
      .then((result) => setCategoryHistory(result.history || []))
      .catch(() => setCategoryHistory([]));
  }

  function toggleCategoryHistory() {
    const opening = !categoryHistoryOpen;
    setCategoryHistoryOpen(opening);
    if (opening && category) loadCategoryHistory(category.id);
  }

  function startEditingDocument() {
    if (!selectedDocument) return;
    setDocumentDraft({ name: selectedDocument.name, standardRef: selectedDocument.standardRef, expectedContent: selectedDocument.expectedContent, documentPrompt: selectedDocument.documentPrompt });
    setEditingDocument(true);
  }

  async function saveDocument() {
    if (!selectedDocument) return;
    setSavingDocument(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/template-studio/documents/${selectedDocument.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(documentDraft)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save the document.");
      setDocuments((current) => current.map((doc) => doc.id === selectedDocument.id ? { ...doc, ...result.document } : doc));
      setEditingDocument(false);
      if (documentHistoryOpen) loadDocumentHistory(selectedDocument.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingDocument(false);
    }
  }

  // Clones the selected seed document (server prefixes the name with "CLONE - "), then selects
  // and opens the clone for editing so the admin can adjust it without touching the original.
  async function cloneSelectedDocument() {
    if (!selectedDocument) return;
    setCloning(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/template-studio/documents/${selectedDocument.id}/clone`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to clone the document.");
      setDocuments((current) => [...current, result.document]);
      setSelectedDocumentId(String(result.document.id));
      setDocumentDraft({ name: result.document.name, standardRef: result.document.standardRef, expectedContent: result.document.expectedContent, documentPrompt: result.document.documentPrompt });
      setEditingDocument(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCloning(false);
    }
  }

  function loadDocumentHistory(documentId) {
    fetch(`/api/admin/template-studio/documents/${documentId}/history`)
      .then((response) => (response.ok ? response.json() : { history: [] }))
      .then((result) => setDocumentHistory(result.history || []))
      .catch(() => setDocumentHistory([]));
  }

  function toggleDocumentHistory() {
    const opening = !documentHistoryOpen;
    setDocumentHistoryOpen(opening);
    if (opening && selectedDocument) loadDocumentHistory(selectedDocument.id);
  }

  function pollJob(jobId) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      fetch(`/api/admin/template-studio/jobs/${jobId}`)
        .then((response) => response.json())
        .then((result) => {
          if (!result.job) return;
          setJob(result.job);
          if (result.job.status === "completed" || result.job.status === "failed") clearInterval(pollRef.current);
        })
        .catch(() => {});
    }, JOB_POLL_INTERVAL_MS);
  }

  // Submits the request to the backend queue - a worker process picks it up, calls Claude, and
  // uploads the rendered .docx to R2. The frontend just polls job status until it's done.
  async function generateTemplate(event) {
    event.preventDefault();
    if (!story.trim() && !selectedDocumentId) return setError("Describe the form, or pick a seed document, before generating a template.");
    setSubmittingJob(true);
    setError("");
    resetJob();
    try {
      const response = await fetch("/api/admin/template-studio/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: selectedDocumentId || undefined,
          documentName: selectedDocument?.name || `${category.name} template`,
          department: category.name,
          story
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to queue template generation.");
      setJob(result.job);
      pollJob(result.job.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmittingJob(false);
    }
  }

  return (
    <main className="admin-main">
      <header>
        <div className="brand">
          <Sparkles size={46} />
          <div>
            <p className="eyebrow">Platform administration</p>
            <h1>Template studio</h1>
          </div>
        </div>
        <p className="intro">Describe a form in plain language and generate a clean NABH document template.</p>
        <div className="template-library-selector">
          <label htmlFor="template-studio-programme">Accreditation type</label>
          <select id="template-studio-programme" value={programme} onChange={(event) => chooseProgramme(event.target.value)}>
            <option value="">Select an accreditation type</option>
            {NABH_ACCREDITATION_PROGRAMMES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          {!programme && <span>Choose an accreditation type to pick a department.</span>}
        </div>
      </header>

      {!programme && <p className="empty">Select an NABH accreditation type to continue.</p>}

      {programme && (
        <section className="layout">
          <nav className="department-list">
            <label className="filter-box">
              <Search size={14} />
              <input value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} placeholder="Filter departments" />
            </label>
            {categoriesLoading && <p className="loading-state"><RefreshCw size={15} className="spin-icon" /> Loading departments...</p>}
            {!categoriesLoading && filteredCategories.map((item) => (
              <button className={category?.id === item.id ? "active" : ""} key={item.id} title={`Design a template for ${item.name}`} onClick={() => chooseDepartment(item)}>
                <FolderOpen size={16} />
                <span>{item.name}</span>
              </button>
            ))}
            {!categoriesLoading && filteredCategories.length === 0 && <p className="empty">No departments match.</p>}
          </nav>
          <section className="document-panel">
            {!category && <p className="empty">Select a department to describe its form.</p>}
            {category && (
              <>
                <div className="panel-heading">
                  <FileSearch size={18} />
                  <h2>{category.name}</h2>
                </div>

                {category.metaPrompt !== undefined && (
                  <div className="template-studio-prompt-preview">
                    <div className="template-studio-prompt-preview-heading">
                      <small>Category meta-prompt</small>
                      <div className="template-studio-prompt-actions">
                        {!editingCategoryPrompt && <button className="icon-button" type="button" title="Edit meta-prompt" onClick={() => { setCategoryPromptDraft(category.metaPrompt); setEditingCategoryPrompt(true); }}><Pencil size={14} /></button>}
                        <button className="icon-button" type="button" title="View edit history" onClick={toggleCategoryHistory}><History size={14} /></button>
                      </div>
                    </div>
                    {editingCategoryPrompt ? (
                      <>
                        <textarea rows={5} value={categoryPromptDraft} onChange={(event) => setCategoryPromptDraft(event.target.value)} />
                        <div className="template-studio-prompt-edit-actions">
                          <button className="secondary-button" type="button" onClick={() => setEditingCategoryPrompt(false)}><X size={14} /> Cancel</button>
                          <button className="primary-button" type="button" disabled={savingCategoryPrompt} onClick={saveCategoryPrompt}><Save size={14} /> {savingCategoryPrompt ? "Saving..." : "Save"}</button>
                        </div>
                      </>
                    ) : <p>{category.metaPrompt}</p>}
                    {categoryHistoryOpen && (
                      <div className="template-studio-prompt-history">
                        {categoryHistory === null && <p className="loading-state"><RefreshCw size={14} className="spin-icon" /> Loading history...</p>}
                        {categoryHistory?.length === 0 && <p className="empty">No edits recorded yet.</p>}
                        {categoryHistory?.map((entry) => (
                          <div className="template-studio-prompt-history-entry" key={entry.id}>
                            <small>{entry.changedBy || "Unknown"} - {new Date(entry.changedAt).toLocaleString()}</small>
                            <p><strong>Before:</strong> {entry.previousValue}</p>
                            <p><strong>After:</strong> {entry.newValue}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <section className="users-panel template-studio-story">
                  {documentsLoading && <p className="loading-state"><RefreshCw size={15} className="spin-icon" /> Loading seed documents...</p>}
                  {!documentsLoading && documents.length > 0 && (
                    <label className="role-name">
                      Start from a seed document (optional)
                      <select value={selectedDocumentId} onChange={(event) => chooseDocument(event.target.value)}>
                        <option value="">None - describe the form from scratch</option>
                        {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}{doc.standardRef ? ` (${doc.standardRef})` : ""}</option>)}
                      </select>
                    </label>
                  )}
                  {!documentsLoading && documents.length === 0 && <p className="empty">No seed documents yet for this department - describe the form from scratch below.</p>}

                  {selectedDocument && (
                    <div className="template-studio-prompt-preview">
                      <div className="template-studio-prompt-preview-heading">
                        <small>Seed document</small>
                        <div className="template-studio-prompt-actions">
                          <button className="icon-button" type="button" title="Clone this document" disabled={cloning} onClick={cloneSelectedDocument}><Copy size={14} /></button>
                          {!editingDocument && <button className="icon-button" type="button" title="Edit document" onClick={startEditingDocument}><Pencil size={14} /></button>}
                          <button className="icon-button" type="button" title="View edit history" onClick={toggleDocumentHistory}><History size={14} /></button>
                        </div>
                      </div>

                      {editingDocument ? (
                        <>
                          <label className="role-name">Name<input value={documentDraft.name} onChange={(event) => setDocumentDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                          <label className="role-name">Standard reference<input value={documentDraft.standardRef} onChange={(event) => setDocumentDraft((current) => ({ ...current, standardRef: event.target.value }))} /></label>
                          <label className="role-name">Expected content<textarea rows={3} value={documentDraft.expectedContent} onChange={(event) => setDocumentDraft((current) => ({ ...current, expectedContent: event.target.value }))} /></label>
                          <label className="role-name">Document prompt<textarea rows={6} value={documentDraft.documentPrompt} onChange={(event) => setDocumentDraft((current) => ({ ...current, documentPrompt: event.target.value }))} /></label>
                          <div className="template-studio-prompt-edit-actions">
                            <button className="secondary-button" type="button" onClick={() => setEditingDocument(false)}><X size={14} /> Cancel</button>
                            <button className="primary-button" type="button" disabled={savingDocument} onClick={saveDocument}><Save size={14} /> {savingDocument ? "Saving..." : "Save"}</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p><strong>{selectedDocument.name}</strong></p>
                          {selectedDocument.standardRef && <p><small>Standard reference</small><strong>{selectedDocument.standardRef}</strong></p>}
                          {selectedDocument.expectedContent && <p><small>Expected content</small>{selectedDocument.expectedContent}</p>}
                          <p><small>Document prompt</small>{selectedDocument.documentPrompt}</p>
                        </>
                      )}

                      {documentHistoryOpen && (
                        <div className="template-studio-prompt-history">
                          {documentHistory === null && <p className="loading-state"><RefreshCw size={14} className="spin-icon" /> Loading history...</p>}
                          {documentHistory?.length === 0 && <p className="empty">No edits recorded yet.</p>}
                          {documentHistory?.map((entry) => (
                            <div className="template-studio-prompt-history-entry" key={entry.id}>
                              <small>{entry.field} - {entry.changedBy || "Unknown"} - {new Date(entry.changedAt).toLocaleString()}</small>
                              <p><strong>Before:</strong> {entry.previousValue}</p>
                              <p><strong>After:</strong> {entry.newValue}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <form onSubmit={generateTemplate}>
                    <label>
                      Hospital-specific notes {selectedDocumentId ? "(optional)" : ""}
                      <textarea rows={6} value={story} onChange={(event) => setStory(event.target.value)} placeholder="Example: We need a Patient Consent form for surgical procedures. It should capture patient identification, the procedure details, risks explained, consent statement, and signatures from the patient and the consenting doctor." />
                    </label>
                    {error && <p className="status error">{error}</p>}
                    <button className="primary-button" type="submit" disabled={submittingJob || (job && job.status !== "completed" && job.status !== "failed")}>
                      {submittingJob ? <><RefreshCw size={16} className="spin-icon" /> Queuing...</> : <><Sparkles size={16} /> Generate Template</>}
                    </button>
                  </form>
                </section>

                {job && (
                  <section className="users-panel template-studio-job">
                    <div className="panel-heading">
                      <Sparkles size={18} />
                      <h2>Template generation</h2>
                    </div>
                    {(job.status === "queued" || job.status === "processing") && (
                      <p className="loading-state"><RefreshCw size={15} className="spin-icon" /> {job.status === "queued" ? "Queued - waiting for the next worker cycle..." : "Generating with Claude..."}</p>
                    )}
                    {job.status === "failed" && <p className="status error">{job.error || "Template generation failed."}</p>}
                    {job.status === "completed" && (
                      <a className="primary-button" href={`/api/admin/template-studio/jobs/${job.id}/download`}>
                        <Download size={16} /> Download {job.documentName}.docx
                      </a>
                    )}
                  </section>
                )}
              </>
            )}
          </section>
        </section>
      )}
    </main>
  );
}
