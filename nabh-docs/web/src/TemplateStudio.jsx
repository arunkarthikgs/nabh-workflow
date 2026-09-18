import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, RefreshCw, Download, Copy, FolderOpen, FileSearch, History, Pencil, Save, X, Search, ListChecks, Eye, Check, FileText } from "lucide-react";

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
  const [tab, setTab] = useState("generate");
  const [programme, setProgramme] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [category, setCategory] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");

  // Document description input for AI prompt refinement
  const [documentDescription, setDocumentDescription] = useState("");
  const [workingDocName, setWorkingDocName] = useState("");
  const [workingStandardRef, setWorkingStandardRef] = useState("");
  const [massagingPrompt, setMassagingPrompt] = useState(false);

  // Massaged prompt result card (review & confirm)
  const [massagedResult, setMassagedResult] = useState(null);
  const [savingNewDoc, setSavingNewDoc] = useState(false);
  const [docSavedMessage, setDocSavedMessage] = useState("");

  const [specificNotes, setSpecificNotes] = useState("");
  const [error, setError] = useState("");

  // Category meta-prompt modal & edit state
  const [metaPromptModalOpen, setMetaPromptModalOpen] = useState(false);
  const [editingCategoryPrompt, setEditingCategoryPrompt] = useState(false);
  const [categoryPromptDraft, setCategoryPromptDraft] = useState("");
  const [savingCategoryPrompt, setSavingCategoryPrompt] = useState(false);
  const [categoryHistoryOpen, setCategoryHistoryOpen] = useState(false);
  const [categoryHistory, setCategoryHistory] = useState(null);
  const [metaPromptCopied, setMetaPromptCopied] = useState(false);

  // Seed document modal, edit & clone state
  const [docPromptModalOpen, setDocPromptModalOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState(false);
  const [documentDraft, setDocumentDraft] = useState(blankDocumentDraft());
  const [savingDocument, setSavingDocument] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [documentHistoryOpen, setDocumentHistoryOpen] = useState(false);
  const [documentHistory, setDocumentHistory] = useState(null);
  const [docPromptCopied, setDocPromptCopied] = useState(false);

  // Job queue & preview state
  const [job, setJob] = useState(null);
  const [submittingJob, setSubmittingJob] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const pollRef = useRef(null);

  // Job history tab state
  const [jobHistory, setJobHistory] = useState(null);
  const [jobHistoryLoading, setJobHistoryLoading] = useState(false);
  const [jobHistoryError, setJobHistoryError] = useState("");
  const [jobHistorySearch, setJobHistorySearch] = useState("");
  const [jobHistoryDepartment, setJobHistoryDepartment] = useState("all");
  const [jobHistoryProgramme, setJobHistoryProgramme] = useState("all");
  const [historyPreviewJob, setHistoryPreviewJob] = useState(null);
  const [publishingJobId, setPublishingJobId] = useState("");
  const [publishedJobIds, setPublishedJobIds] = useState(() => new Set());
  const [pendingJobIds, setPendingJobIds] = useState(() => new Set());
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [pendingProgrammeFilter, setPendingProgrammeFilter] = useState("all");
  const [pendingDepartmentFilter, setPendingDepartmentFilter] = useState("all");

  const activeProgrammeFilter = jobHistoryProgramme !== "all" ? jobHistoryProgramme : programme;

  const historyDepartments = useMemo(() => {
    const set = new Set();
    (categories || []).forEach((c) => { if (c.name) set.add(c.name); });
    (jobHistory || []).forEach((j) => { if (j.department) set.add(j.department); });
    return Array.from(set).sort();
  }, [categories, jobHistory]);

  const filteredJobHistory = useMemo(() => {
    if (!jobHistory) return [];
    return jobHistory.filter((entry) => {
      if (activeProgrammeFilter && activeProgrammeFilter !== "all") {
        if (entry.programme && entry.programme !== activeProgrammeFilter) return false;
      }
      if (jobHistoryDepartment !== "all" && entry.department !== jobHistoryDepartment) {
        return false;
      }
      if (jobHistorySearch.trim()) {
        const q = jobHistorySearch.trim().toLowerCase();
        const matchName = (entry.documentName || "").toLowerCase().includes(q);
        const matchDept = (entry.department || "").toLowerCase().includes(q);
        const matchProg = (entry.programme || "").toLowerCase().includes(q);
        const matchStatus = (entry.status || "").toLowerCase().includes(q);
        const matchError = (entry.error || "").toLowerCase().includes(q);
        if (!matchName && !matchDept && !matchProg && !matchStatus && !matchError) return false;
      }
      return true;
    });
  }, [jobHistory, activeProgrammeFilter, jobHistoryDepartment, jobHistorySearch]);

  const pendingJobs = useMemo(() => (jobHistory || []).filter((entry) => entry.status === "completed" && !entry.published), [jobHistory]);
  const filteredPendingJobs = useMemo(() => pendingJobs.filter((entry) => {
    const matchesProgramme = pendingProgrammeFilter === "all" || (entry.programme || "") === pendingProgrammeFilter;
    const matchesDepartment = pendingDepartmentFilter === "all" || (entry.department || "") === pendingDepartmentFilter;
    return matchesProgramme && matchesDepartment;
  }), [pendingJobs, pendingProgrammeFilter, pendingDepartmentFilter]);

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

  function loadJobHistory() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    setJobHistoryLoading(true);
    setJobHistoryError("");
    fetch("/api/admin/template-studio/jobs", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The template jobs service returned an error.");
        return response.json();
      })
      .then((result) => setJobHistory(result.jobs || []))
      .catch((requestError) => {
        setJobHistory([]);
        setJobHistoryError(requestError.name === "AbortError" ? "Loading pending templates timed out. Check the database connection and try again." : requestError.message || "Unable to load pending templates.");
      })
      .finally(() => { clearTimeout(timeoutId); setJobHistoryLoading(false); });
  }

  function togglePendingJob(jobId) {
    setPendingJobIds((current) => {
      const next = new Set(current);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });
  }

  function toggleAllPending() {
    setPendingJobIds((current) => current.size === filteredPendingJobs.length ? new Set() : new Set(filteredPendingJobs.map((entry) => entry.id)));
  }

  async function publishPendingJobs() {
    const visibleJobIds = new Set(filteredPendingJobs.map((entry) => entry.id));
    const jobIds = [...pendingJobIds].filter((jobId) => visibleJobIds.has(jobId));
    if (!jobIds.length) return;
    if (!programme) return setError("Select an accreditation type before moving templates.");
    if (!window.confirm(`Move ${jobIds.length} selected template${jobIds.length === 1 ? "" : "s"} into the ${programme} template library? The generated document${jobIds.length === 1 ? " will" : "s will"} be moved under its department folder and added to the Template Master List.`)) return;
    setBulkPublishing(true);
    setError("");
    try {
      const response = await fetch("/api/admin/template-studio/jobs/publish-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds, programme })
      });
      const result = await response.json();
      if (!response.ok && response.status !== 207) throw new Error(result.error || "Unable to move the selected templates.");
      setPendingJobIds(new Set());
      setDocSavedMessage(`${result.published?.length || 0} template${result.published?.length === 1 ? "" : "s"} moved to the template library${result.errors?.length ? `; ${result.errors.length} failed: ${result.errors.map((item) => item.error).join(" | ")}` : "."}`);
      loadJobHistory();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBulkPublishing(false);
    }
  }

  async function publishTemplate(entry) {
    const destinationProgramme = entry.programme || programme;
    if (!destinationProgramme) return setError("Select an accreditation type before moving this template.");
    if (!window.confirm(`Move "${entry.documentName}" into the ${destinationProgramme} template library? The generated document will be moved under its department folder and added to the Template Master List.`)) return;
    setPublishingJobId(entry.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/template-studio/jobs/${entry.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programme: destinationProgramme, department: entry.department })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to publish the generated template.");
      setPublishedJobIds((current) => new Set([...current, entry.id]));
      setDocSavedMessage(`Published "${entry.documentName}" to the template library.`);
      loadJobHistory();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPublishingJobId("");
    }
  }

  function openTab(nextTab) {
    setTab(nextTab);
    if (nextTab === "history" || nextTab === "pending") loadJobHistory();
  }

  function copyText(text, setCopiedFn) {
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedFn(true);
        setTimeout(() => setCopiedFn(false), 2000);
      }).catch(() => fallbackCopy(text, setCopiedFn));
    } else {
      fallbackCopy(text, setCopiedFn);
    }
  }

  function fallbackCopy(text, setCopiedFn) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try { document.execCommand("copy"); setCopiedFn(true); setTimeout(() => setCopiedFn(false), 2000); } catch {}
    textArea.remove();
  }

  function resetJob() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setJob(null);
    setPreviewOpen(false);
  }

  function chooseProgramme(nextProgramme) {
    setProgramme(nextProgramme);
    setCategory(null);
    setDocuments([]);
    setSelectedDocumentId("");
    setDocumentDescription("");
    setWorkingDocName("");
    setWorkingStandardRef("");
    setMassagedResult(null);
    setSpecificNotes("");
    setError("");
    setMetaPromptModalOpen(false);
    setDocPromptModalOpen(false);
    resetJob();
  }

  // Documents for a department are loaded by category_id as soon as it's selected.
  function chooseDepartment(nextCategory) {
    setCategory(nextCategory);
    setSelectedDocumentId("");
    setDocumentDescription("");
    setWorkingDocName("");
    setWorkingStandardRef("");
    setMassagedResult(null);
    setSpecificNotes("");
    setError("");
    setDocSavedMessage("");
    setMetaPromptModalOpen(false);
    setDocPromptModalOpen(false);
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
    setDocPromptModalOpen(false);
    setMassagedResult(null);
    setDocSavedMessage("");
    resetJob();
  }

  function startCreateNewDocument() {
    setSelectedDocumentId("");
    setEditingDocument(false);
    setDocumentHistoryOpen(false);
    setDocumentHistory(null);
    setDocPromptModalOpen(false);
    setMassagedResult(null);
    setDocSavedMessage("");
    setDocumentDescription("");
    setWorkingDocName("");
    setWorkingStandardRef("");
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
      setDocPromptModalOpen(true);
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

  // Calls the AI prompt-refinement endpoint to convert description into a refined document prompt
  async function handleMassagePrompt(event) {
    event?.preventDefault();
    if (!documentDescription.trim()) return setError("Please enter a description of the document's context and purpose.");
    setMassagingPrompt(true);
    setError("");
    setDocSavedMessage("");
    try {
      const response = await fetch("/api/admin/template-studio/massage-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: category?.id,
          categoryName: category?.name,
          metaPrompt: category?.metaPrompt,
          description: documentDescription,
          name: workingDocName,
          standardRef: workingStandardRef
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to refine the prompt with AI.");
      setMassagedResult(data.result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setMassagingPrompt(false);
    }
  }

  // Saves the massaged prompt as a new persistent document in nabh_documents under the category
  async function handleSaveNewDocument() {
    if (!massagedResult || !category) return;
    setSavingNewDoc(true);
    setError("");
    try {
      const response = await fetch("/api/admin/template-studio/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: category.id,
          name: massagedResult.name,
          standardRef: massagedResult.standardRef,
          expectedContent: massagedResult.expectedContent,
          documentPrompt: massagedResult.documentPrompt
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save the document to category.");
      setDocuments((current) => [...current, data.document]);
      setSelectedDocumentId(String(data.document.id));
      setDocSavedMessage(`Saved "${data.document.name}" into ${category.name}.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingNewDoc(false);
    }
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

  // Enqueues the template generation job combining category meta-prompt + massaged prompt
  async function handleGenerateTemplate(event) {
    event?.preventDefault();
    setError("");
    resetJob();

    let docPromptToUse = "";
    let docNameToUse = "";
    let standardRefToUse = "";
    let docIdToUse = selectedDocumentId || undefined;

    if (massagedResult) {
      docPromptToUse = massagedResult.documentPrompt;
      docNameToUse = massagedResult.name;
      standardRefToUse = massagedResult.standardRef;
    } else if (selectedDocument) {
      docPromptToUse = selectedDocument.documentPrompt;
      docNameToUse = selectedDocument.name;
      standardRefToUse = selectedDocument.standardRef;
    } else if (documentDescription.trim()) {
      docPromptToUse = documentDescription;
      docNameToUse = workingDocName || `${category?.name || "NABH"} template`;
      standardRefToUse = workingStandardRef;
    }

    if (!docPromptToUse.trim()) {
      return setError("Describe the document or select a seed document before generating a template.");
    }

    setSubmittingJob(true);
    try {
      const response = await fetch("/api/admin/template-studio/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: docIdToUse,
          categoryId: category?.id,
          department: category?.name || "",
          metaPrompt: category?.metaPrompt || "",
          documentName: docNameToUse,
          documentPrompt: docPromptToUse,
          standardRef: standardRefToUse,
          programme,
          story: specificNotes
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

      <nav className="access-tabs">
        <button className={tab === "generate" ? "active" : ""} type="button" onClick={() => openTab("generate")}><Sparkles size={16} /> Generate</button>
        <button className={tab === "pending" ? "active" : ""} type="button" onClick={() => openTab("pending")}><FolderOpen size={16} /> Pending moves{pendingJobs.length ? ` (${pendingJobs.length})` : ""}</button>
        <button className={tab === "history" ? "active" : ""} type="button" onClick={() => openTab("history")}><ListChecks size={16} /> Recent generation jobs</button>
      </nav>

      {tab === "pending" && (
        <section className="users-panel template-studio-job-history pending-moves-panel">
          <div className="pending-moves-heading">
            <div className="pending-moves-title">
              <span className="pending-moves-icon"><FolderOpen size={19} /></span>
              <div><p className="eyebrow">Template library intake</p><h2>Pending moves</h2><p>Review generated documents before adding them to the master template library.</p></div>
            </div>
            <div className="pending-moves-count"><strong>{pendingJobs.length}</strong><span>awaiting review</span></div>
            <button className="icon-button" type="button" title="Refresh" onClick={loadJobHistory}><RefreshCw size={14} className={jobHistoryLoading ? "spin-icon" : ""} /></button>
          </div>
          {docSavedMessage && <p className="access-message"><Check size={14} /> {docSavedMessage}</p>}
          {jobHistoryError && <p className="status error">{jobHistoryError} <button className="text-button" type="button" onClick={loadJobHistory}>Retry</button></p>}
          {jobHistoryLoading && <p className="loading-state"><RefreshCw size={14} className="spin-icon" /> Loading pending templates...</p>}
          {!jobHistoryLoading && pendingJobs.length === 0 && <p className="empty">No completed templates are waiting to be moved.</p>}
          {!jobHistoryLoading && pendingJobs.length > 0 && (
            <>
              <div className="pending-moves-filters">
                <div className="pending-filter-heading"><Filter size={14} /><span>Filter pending templates</span></div>
                <label><span>Accreditation type</span><select value={pendingProgrammeFilter} onChange={(event) => setPendingProgrammeFilter(event.target.value)}><option value="all">All accreditation types</option>{NABH_ACCREDITATION_PROGRAMMES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <label><span>Department</span><select value={pendingDepartmentFilter} onChange={(event) => setPendingDepartmentFilter(event.target.value)}><option value="all">All departments</option>{historyDepartments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                {(pendingProgrammeFilter !== "all" || pendingDepartmentFilter !== "all") && <button className="secondary-button" type="button" onClick={() => { setPendingProgrammeFilter("all"); setPendingDepartmentFilter("all"); }}>Clear filters</button>}
              </div>
              {filteredPendingJobs.length === 0 && <p className="empty">No pending templates match these filters.</p>}
              {filteredPendingJobs.length > 0 && <>
              <div className="pending-moves-toolbar">
                <label className="pending-programme-picker"><span>Move into</span><select value={programme} onChange={(event) => setProgramme(event.target.value)}><option value="">Select accreditation type</option>{NABH_ACCREDITATION_PROGRAMMES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <label className="pending-select-all"><input type="checkbox" checked={pendingJobIds.size === filteredPendingJobs.length} onChange={toggleAllPending} /> <span>Select all</span><small>{pendingJobIds.size ? `${pendingJobIds.size} selected` : `${filteredPendingJobs.length} shown`}</small></label>
                <button className="primary-button pending-move-button" type="button" disabled={!pendingJobIds.size || !programme || bulkPublishing} onClick={publishPendingJobs}>
                  <FolderOpen size={15} /> {bulkPublishing ? "Moving..." : `Move selected (${pendingJobIds.size})`}
                </button>
              </div>
              <div className="pending-moves-table-wrap"><table className="template-studio-job-history-table pending-moves-table">
                <thead><tr><th className="pending-select-column">Select</th><th>Document</th><th>Department</th><th>Accreditation type</th><th>Completed</th><th className="pending-action-column">Action</th></tr></thead>
                <tbody>{filteredPendingJobs.map((entry) => (
                  <tr className={pendingJobIds.has(entry.id) ? "selected" : ""} key={entry.id}>
                    <td className="pending-select-column"><input type="checkbox" checked={pendingJobIds.has(entry.id)} onChange={() => togglePendingJob(entry.id)} /></td>
                    <td><strong className="pending-document-name">{entry.documentName}</strong><small className="pending-document-status">Generated template</small></td>
                    <td>{entry.department || "-"}</td>
                    <td>{entry.programme || "-"}</td>
                    <td>{entry.completedAt ? new Date(entry.completedAt).toLocaleString() : "-"}</td>
                    <td className="pending-action-column"><button className="icon-button" type="button" title={`Move ${entry.documentName} to template library`} onClick={() => publishTemplate(entry)}><FolderOpen size={15} /></button></td>
                  </tr>
                ))}</tbody>
              </table></div></>}
            </>
          )}
        </section>
      )}

      {tab === "history" && (
        <section className="users-panel template-studio-job-history">
          <div className="panel-heading">
            <ListChecks size={18} />
            <h2>Recent generation jobs{activeProgrammeFilter ? ` - ${activeProgrammeFilter}` : ""}</h2>
            <button className="icon-button" type="button" title="Refresh" onClick={loadJobHistory}><RefreshCw size={14} className={jobHistoryLoading ? "spin-icon" : ""} /></button>
          </div>

          <div className="template-studio-history-filters">
            <label className="filter-box document-search template-studio-history-search">
              <Search size={14} />
              <input
                value={jobHistorySearch}
                onChange={(e) => setJobHistorySearch(e.target.value)}
                placeholder="Search document name, department, status, or error..."
              />
            </label>
            <div className="template-studio-history-controls">
              <div className="template-studio-history-filter-item">
                <label className="filter-label">Accreditation type</label>
                <select
                  className="audit-filter-select"
                  value={jobHistoryProgramme}
                  onChange={(e) => setJobHistoryProgramme(e.target.value)}
                >
                  <option value="all">All accreditation types</option>
                  {NABH_ACCREDITATION_PROGRAMMES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="template-studio-history-filter-item">
                <label className="filter-label">Department</label>
                <select
                  className="audit-filter-select"
                  value={jobHistoryDepartment}
                  onChange={(e) => setJobHistoryDepartment(e.target.value)}
                >
                  <option value="all">All departments</option>
                  {historyDepartments.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              {(jobHistorySearch || jobHistoryDepartment !== "all" || jobHistoryProgramme !== "all") && (
                <button
                  className="secondary-button"
                  type="button"
                  title="Reset filters"
                  onClick={() => { setJobHistorySearch(""); setJobHistoryDepartment("all"); setJobHistoryProgramme("all"); }}
                >
                  Reset filters
                </button>
              )}
            </div>
          </div>

          {docSavedMessage && <p className="access-message"><Check size={14} /> {docSavedMessage}</p>}

          {jobHistoryLoading && <p className="loading-state"><RefreshCw size={14} className="spin-icon" /> Loading job history...</p>}
          {jobHistoryError && <p className="status error">{jobHistoryError} <button className="text-button" type="button" onClick={loadJobHistory}>Retry</button></p>}
          {!jobHistoryLoading && jobHistory?.length === 0 && <p className="empty">No template generation jobs yet.</p>}
          {!jobHistoryLoading && jobHistory?.length > 0 && filteredJobHistory.length === 0 && (
            <p className="empty">No generation jobs match your search or filter criteria.</p>
          )}
          {!jobHistoryLoading && filteredJobHistory.length > 0 && (
            <table className="template-studio-job-history-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Department</th>
                  <th>Accreditation type</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Completed</th>
                  <th style={{ textAlign: "right", paddingRight: "16px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobHistory.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <strong>{entry.documentName}</strong>
                      {entry.error && entry.status === "failed" && (
                        <small className="template-studio-job-error" title={entry.error}>{entry.error}</small>
                      )}
                    </td>
                    <td>{entry.department || "-"}</td>
                    <td>{entry.programme || "-"}</td>
                    <td><span className={`template-studio-job-status template-studio-job-status-${entry.status}`}>{entry.status}</span></td>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                    <td>{entry.completedAt ? new Date(entry.completedAt).toLocaleString() : "-"}</td>
                    <td style={{ textAlign: "right" }}>
                      {entry.status === "completed" && (
                        <div className="template-studio-row-actions">
                          <button
                            className="icon-button"
                            type="button"
                            title={`Preview PDF for ${entry.documentName}`}
                            onClick={() => setHistoryPreviewJob(entry)}
                          >
                            <Eye size={15} />
                          </button>
                          <a
                            className="icon-button"
                            title={`Download ${entry.documentName}.docx`}
                            href={`/api/admin/template-studio/jobs/${entry.id}/download`}
                          >
                            <Download size={15} />
                          </a>
                          <button
                            className="icon-button"
                            type="button"
                            title={entry.published || publishedJobIds.has(entry.id) ? "Published to template library" : `Move ${entry.documentName} to template library`}
                            disabled={publishingJobId === entry.id || entry.published || publishedJobIds.has(entry.id)}
                            onClick={() => publishTemplate(entry)}
                          >
                            {entry.published || publishedJobIds.has(entry.id) ? <Check size={15} /> : <FolderOpen size={15} />}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "generate" && !programme && <p className="empty">Select an NABH accreditation type to continue.</p>}

      {tab === "generate" && programme && (
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
                  {category.metaPrompt !== undefined && (
                    <button
                      className="secondary-button template-studio-header-btn"
                      type="button"
                      title="View or edit the category meta-prompt"
                      onClick={() => {
                        setCategoryPromptDraft(category.metaPrompt);
                        setEditingCategoryPrompt(false);
                        setMetaPromptModalOpen(true);
                      }}
                    >
                      <FileText size={14} /> View / Edit Meta-Prompt
                    </button>
                  )}
                </div>

                <section className="users-panel template-studio-story">
                  {/* Seed document selection row */}
                  <div className="template-studio-seed-header">
                    {documentsLoading && <p className="loading-state"><RefreshCw size={15} className="spin-icon" /> Loading seed documents...</p>}
                    {!documentsLoading && (
                      <label className="role-name">
                        Select seed document
                        <select value={selectedDocumentId} onChange={(event) => chooseDocument(event.target.value)}>
                          <option value="">None — create / describe a new document</option>
                          {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}{doc.standardRef ? ` (${doc.standardRef})` : ""}</option>)}
                        </select>
                      </label>
                    )}
                  </div>

                  {/* Selected seed document summary badge with button to open modal */}
                  {selectedDocument && !massagedResult && (
                    <div className="template-studio-selected-doc-badge">
                      <div className="template-studio-selected-doc-info">
                        <strong>{selectedDocument.name}</strong>
                        {selectedDocument.standardRef && (
                          <span className="template-studio-std-pill">{selectedDocument.standardRef}</span>
                        )}
                      </div>
                      <div className="template-studio-selected-doc-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          title="View, edit, or copy prompt"
                          onClick={() => {
                            setDocumentDraft({
                              name: selectedDocument.name,
                              standardRef: selectedDocument.standardRef,
                              expectedContent: selectedDocument.expectedContent,
                              documentPrompt: selectedDocument.documentPrompt
                            });
                            setEditingDocument(false);
                            setDocPromptModalOpen(true);
                          }}
                        >
                          <Eye size={14} /> View / Edit Prompt
                        </button>
                        <button className="secondary-button" type="button" disabled={cloning} onClick={cloneSelectedDocument}>
                          <Copy size={14} /> Clone
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Document Narrative Description & AI Prompt Refinement (when creating a new doc or refining) */}
                  {(!selectedDocument || editingDocument) && !massagedResult && (
                    <div className="template-studio-narrative-box">
                      <div className="panel-heading">
                        <Sparkles size={16} />
                        <h3>Describe Document Context &amp; Purpose</h3>
                      </div>
                      <div className="template-studio-input-grid">
                        <label className="role-name">
                          Working document title (optional)
                          <input value={workingDocName} onChange={(event) => setWorkingDocName(event.target.value)} placeholder="e.g. Surgical Safety Checklist or Patient Admission SOP" />
                        </label>
                        <label className="role-name">
                          Standard reference (optional)
                          <input value={workingStandardRef} onChange={(event) => setWorkingStandardRef(event.target.value)} placeholder="e.g. COP 8 or AAC 2" />
                        </label>
                      </div>
                      <label>
                        Operational Context &amp; Purpose
                        <textarea
                          rows={6}
                          value={documentDescription}
                          onChange={(event) => setDocumentDescription(event.target.value)}
                          placeholder="Describe the clinical or administrative objective, workflow steps, responsible roles, required checks/verifications, data fields, and signing authorities. (e.g. SOP for inter-department patient transfers covering triage assessment, clinical handover checklist, transport equipment readiness, and receiving nurse acknowledgement...)"
                        />
                      </label>
                      <button className="primary-button" type="button" disabled={massagingPrompt || !documentDescription.trim()} onClick={handleMassagePrompt}>
                        {massagingPrompt ? <><RefreshCw size={16} className="spin-icon" /> Refining prompt with AI...</> : <><Sparkles size={16} /> Refine prompt with AI</>}
                      </button>
                    </div>
                  )}

                  {/* Massaged AI Prompt Output (Review & Confirm) */}
                  {massagedResult && (
                    <div className="template-studio-massaged-card">
                      <div className="panel-heading">
                        <Sparkles size={16} />
                        <h3>AI Refined Document Prompt (Review &amp; Confirm)</h3>
                      </div>
                      <p className="intro">AI has transformed your description into a structured document prompt. Review and edit any field before generating the template:</p>

                      <div className="template-studio-input-grid">
                        <label className="role-name">
                          Document title
                          <input value={massagedResult.name} onChange={(event) => setMassagedResult((current) => ({ ...current, name: event.target.value }))} />
                        </label>
                        <label className="role-name">
                          Standard reference
                          <input value={massagedResult.standardRef} onChange={(event) => setMassagedResult((current) => ({ ...current, standardRef: event.target.value }))} />
                        </label>
                      </div>

                      <label className="role-name">
                        Expected content summary
                        <textarea rows={3} value={massagedResult.expectedContent} onChange={(event) => setMassagedResult((current) => ({ ...current, expectedContent: event.target.value }))} />
                      </label>

                      <label className="role-name">
                        Refined document prompt
                        <textarea rows={7} value={massagedResult.documentPrompt} onChange={(event) => setMassagedResult((current) => ({ ...current, documentPrompt: event.target.value }))} />
                      </label>

                      <div className="template-studio-massaged-actions">
                        <button className="secondary-button" type="button" onClick={() => setMassagedResult(null)}>
                          <X size={15} /> Re-describe
                        </button>
                        <button className="secondary-button" type="button" disabled={savingNewDoc} onClick={handleSaveNewDocument}>
                          <Save size={15} /> {savingNewDoc ? "Saving..." : "Save to Category"}
                        </button>
                        <button className="primary-button" type="button" disabled={submittingJob} onClick={handleGenerateTemplate}>
                          <Check size={16} /> Confirm &amp; Generate Template
                        </button>
                      </div>

                      {docSavedMessage && <p className="access-message"><Check size={14} /> {docSavedMessage}</p>}
                    </div>
                  )}

                  {/* Specific notes & Generate Template for selected existing document */}
                  {selectedDocument && !massagedResult && !editingDocument && (
                    <form onSubmit={handleGenerateTemplate}>
                      <label>
                        Specific Notes (optional)
                        <textarea rows={4} value={specificNotes} onChange={(event) => setSpecificNotes(event.target.value)} placeholder="Add any specific requirements or notes to include alongside the prompt..." />
                      </label>
                      <button className="primary-button" type="submit" disabled={submittingJob || (job && job.status !== "completed" && job.status !== "failed")}>
                        {submittingJob ? <><RefreshCw size={16} className="spin-icon" /> Queuing...</> : <><Sparkles size={16} /> Generate Template</>}
                      </button>
                    </form>
                  )}

                  {error && <p className="status error">{error}</p>}
                </section>

                {/* Job queue status, download & preview */}
                {job && (
                  <section className="users-panel template-studio-job">
                    <div className="panel-heading">
                      <Sparkles size={18} />
                      <h2>Template generation</h2>
                    </div>
                    {(job.status === "queued" || job.status === "processing") && (
                      <p className="loading-state"><RefreshCw size={15} className="spin-icon" /> {job.status === "queued" ? "Queued - waiting for the next worker cycle..." : "Generating template..."}</p>
                    )}
                    {job.status === "failed" && <p className="status error">{job.error || "Template generation failed."}</p>}
                    {job.status === "completed" && (
                      <>
                        <div className="template-studio-job-actions">
                          <a className="primary-button" href={`/api/admin/template-studio/jobs/${job.id}/download`}>
                            <Download size={16} /> Download {job.documentName}.docx
                          </a>
                          <button className="secondary-button" type="button" onClick={() => setPreviewOpen((current) => !current)}>
                            <Eye size={16} /> {previewOpen ? "Hide preview" : "Preview PDF"}
                          </button>
                        </div>
                        {previewOpen && (
                          <iframe
                            className="template-studio-job-preview"
                            title={`PDF preview of ${job.documentName}`}
                            src={`/api/admin/template-studio/jobs/${job.id}/preview`}
                          />
                        )}
                      </>
                    )}
                  </section>
                )}
              </>
            )}
          </section>
        </section>
      )}

      {/* Category Meta-Prompt Modal */}
      {metaPromptModalOpen && category && (
        <div className="preview-backdrop" role="presentation" onClick={() => setMetaPromptModalOpen(false)}>
          <section className="preview-dialog template-studio-modal-dialog" role="dialog" aria-modal="true" aria-label={`Category Meta-Prompt: ${category.name}`} onClick={(event) => event.stopPropagation()}>
            <div className="preview-header">
              <div>
                <p className="eyebrow">Category Meta-Prompt</p>
                <h2>{category.name}</h2>
              </div>
              <button className="icon-button" type="button" title="Close" onClick={() => setMetaPromptModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="template-studio-modal-body">
              <div className="template-studio-modal-toolbar">
                <button className="secondary-button" type="button" onClick={() => copyText(category.metaPrompt, setMetaPromptCopied)}>
                  <Copy size={14} /> {metaPromptCopied ? "Copied!" : "Copy prompt"}
                </button>
                {!editingCategoryPrompt ? (
                  <button className="secondary-button" type="button" onClick={() => { setCategoryPromptDraft(category.metaPrompt); setEditingCategoryPrompt(true); }}>
                    <Pencil size={14} /> Edit prompt
                  </button>
                ) : (
                  <button className="secondary-button" type="button" onClick={() => setEditingCategoryPrompt(false)}>
                    <X size={14} /> Cancel edit
                  </button>
                )}
                <button className="secondary-button" type="button" onClick={toggleCategoryHistory}>
                  <History size={14} /> {categoryHistoryOpen ? "Hide history" : "View history"}
                </button>
              </div>

              {editingCategoryPrompt ? (
                <div className="template-studio-modal-edit-box">
                  <textarea rows={10} value={categoryPromptDraft} onChange={(event) => setCategoryPromptDraft(event.target.value)} />
                  <div className="template-studio-prompt-edit-actions">
                    <button className="secondary-button" type="button" onClick={() => setEditingCategoryPrompt(false)}><X size={14} /> Cancel</button>
                    <button className="primary-button" type="button" disabled={savingCategoryPrompt} onClick={saveCategoryPrompt}><Save size={14} /> {savingCategoryPrompt ? "Saving..." : "Save prompt"}</button>
                  </div>
                </div>
              ) : (
                <div className="template-studio-prompt-box">
                  {category.metaPrompt || <span className="empty">No meta-prompt defined for this category.</span>}
                </div>
              )}

              {categoryHistoryOpen && (
                <div className="template-studio-prompt-history">
                  <small>Edit history</small>
                  {categoryHistory === null && <p className="loading-state"><RefreshCw size={14} className="spin-icon" /> Loading history...</p>}
                  {categoryHistory?.length === 0 && <p className="empty">No edits recorded yet.</p>}
                  {categoryHistory?.map((entry) => (
                    <div className="template-studio-prompt-history-entry" key={entry.id}>
                      <small>{entry.changedBy || "Unknown"} — {new Date(entry.changedAt).toLocaleString()}</small>
                      <p><strong>Before:</strong> {entry.previousValue}</p>
                      <p><strong>After:</strong> {entry.newValue}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Seed Document Prompt Modal */}
      {docPromptModalOpen && selectedDocument && (
        <div className="preview-backdrop" role="presentation" onClick={() => setDocPromptModalOpen(false)}>
          <section className="preview-dialog template-studio-modal-dialog" role="dialog" aria-modal="true" aria-label={`Seed Document Prompt: ${selectedDocument.name}`} onClick={(event) => event.stopPropagation()}>
            <div className="preview-header">
              <div>
                <p className="eyebrow">Seed Document Details &amp; Prompt</p>
                <h2>{selectedDocument.name}</h2>
              </div>
              <button className="icon-button" type="button" title="Close" onClick={() => setDocPromptModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="template-studio-modal-body">
              <div className="template-studio-modal-toolbar">
                <button className="secondary-button" type="button" onClick={() => copyText(selectedDocument.documentPrompt, setDocPromptCopied)}>
                  <Copy size={14} /> {docPromptCopied ? "Copied!" : "Copy prompt"}
                </button>
                {!editingDocument ? (
                  <button className="secondary-button" type="button" onClick={startEditingDocument}>
                    <Pencil size={14} /> Edit document
                  </button>
                ) : (
                  <button className="secondary-button" type="button" onClick={() => setEditingDocument(false)}>
                    <X size={14} /> Cancel edit
                  </button>
                )}
                <button className="secondary-button" type="button" disabled={cloning} onClick={cloneSelectedDocument}>
                  <Copy size={14} /> Clone document
                </button>
                <button className="secondary-button" type="button" onClick={toggleDocumentHistory}>
                  <History size={14} /> {documentHistoryOpen ? "Hide history" : "View history"}
                </button>
              </div>

              {editingDocument ? (
                <div className="template-studio-modal-edit-box">
                  <label className="role-name">Name<input value={documentDraft.name} onChange={(event) => setDocumentDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label className="role-name">Standard reference<input value={documentDraft.standardRef} onChange={(event) => setDocumentDraft((current) => ({ ...current, standardRef: event.target.value }))} /></label>
                  <label className="role-name">Expected content<textarea rows={3} value={documentDraft.expectedContent} onChange={(event) => setDocumentDraft((current) => ({ ...current, expectedContent: event.target.value }))} /></label>
                  <label className="role-name">Document prompt<textarea rows={8} value={documentDraft.documentPrompt} onChange={(event) => setDocumentDraft((current) => ({ ...current, documentPrompt: event.target.value }))} /></label>
                  <div className="template-studio-prompt-edit-actions">
                    <button className="secondary-button" type="button" onClick={() => setEditingDocument(false)}><X size={14} /> Cancel</button>
                    <button className="primary-button" type="button" disabled={savingDocument} onClick={saveDocument}><Save size={14} /> {savingDocument ? "Saving..." : "Save document"}</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="template-studio-modal-meta-grid">
                    {selectedDocument.standardRef && (
                      <div className="template-studio-modal-meta-item">
                        <small>Standard reference</small>
                        <strong>{selectedDocument.standardRef}</strong>
                      </div>
                    )}
                    {selectedDocument.expectedContent && (
                      <div className="template-studio-modal-meta-item">
                        <small>Expected content</small>
                        <p>{selectedDocument.expectedContent}</p>
                      </div>
                    )}
                  </div>
                  <div className="template-studio-prompt-box">
                    <small className="template-studio-box-label">Document Prompt</small>
                    {selectedDocument.documentPrompt}
                  </div>
                </>
              )}

              {documentHistoryOpen && (
                <div className="template-studio-prompt-history">
                  <small>Edit history</small>
                  {documentHistory === null && <p className="loading-state"><RefreshCw size={14} className="spin-icon" /> Loading history...</p>}
                  {documentHistory?.length === 0 && <p className="empty">No edits recorded yet.</p>}
                  {documentHistory?.map((entry) => (
                    <div className="template-studio-prompt-history-entry" key={entry.id}>
                      <small>{entry.field} — {entry.changedBy || "Unknown"} — {new Date(entry.changedAt).toLocaleString()}</small>
                      <p><strong>Before:</strong> {entry.previousValue}</p>
                      <p><strong>After:</strong> {entry.newValue}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* History Job PDF Preview Modal */}
      {historyPreviewJob && (
        <div className="preview-backdrop" role="presentation" onClick={() => setHistoryPreviewJob(null)}>
          <section className="preview-dialog" role="dialog" aria-modal="true" aria-label={`PDF preview of ${historyPreviewJob.documentName}`} onClick={(event) => event.stopPropagation()}>
            <div className="preview-header">
              <div>
                <p className="eyebrow">Template PDF preview</p>
                <h2>{historyPreviewJob.documentName}</h2>
                <p className="editor-file-name">{historyPreviewJob.department || "Template"}</p>
              </div>
              <div className="preview-actions">
                <a className="download-button" title="Download DOCX" href={`/api/admin/template-studio/jobs/${historyPreviewJob.id}/download`}>
                  <Download size={16} /> Download DOCX
                </a>
                <button className="icon-button" type="button" title="Close preview" onClick={() => setHistoryPreviewJob(null)}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <iframe
              className="policy-preview"
              src={`/api/admin/template-studio/jobs/${historyPreviewJob.id}/preview`}
              title={`PDF preview of ${historyPreviewJob.documentName}`}
            />
          </section>
        </div>
      )}
    </main>
  );
}
