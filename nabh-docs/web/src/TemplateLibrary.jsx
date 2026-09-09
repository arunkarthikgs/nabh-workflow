import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Download, Eye, FileSearch, FileSpreadsheet, FileText, FolderOpen, History, Presentation, RefreshCw, Search, Upload, X } from "lucide-react";
import hospitalLogo from "./assets/nabh-readiness-system.png";

const typeIcons = { DOCX: FileText, XLSX: FileSpreadsheet, PPTX: Presentation };

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(value));
}

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

export default function TemplateLibrary() {
  const [programme, setProgramme] = useState("");
  const [departments, setDepartments] = useState(null);
  const [libraryMessage, setLibraryMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [approval, setApproval] = useState(null);
  const [approvalFile, setApprovalFile] = useState(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalMessage, setApprovalMessage] = useState("");
  const [history, setHistory] = useState(null);
  const [historyLoadingPath, setHistoryLoadingPath] = useState("");
  const [questionnaireReport, setQuestionnaireReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [questionnaireTemplate, setQuestionnaireTemplate] = useState(null);
  const [questionnaireQuestions, setQuestionnaireQuestions] = useState([]);
  const [questionnaireMessage, setQuestionnaireMessage] = useState("");
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);

  function loadTemplates(refresh = false) {
    if (!programme) { setDepartments(null); setLibraryMessage(""); setSelectedDepartment(""); return; }
    (refresh ? setRefreshingCatalog : setLoading)(true);
    fetch(`/api/admin/template-library?programme=${encodeURIComponent(programme)}${refresh ? "&refresh=1" : ""}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load the template library.");
        return result;
      })
      .then((result) => {
        setLibraryMessage(result.error || "");
        setDepartments(result.departments || {});
        setSelectedDepartment((current) => current && result.departments?.[current] ? current : Object.keys(result.departments || {})[0] || "");
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => (refresh ? setRefreshingCatalog : setLoading)(false));
  }

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programme]);

  const departmentEntries = useMemo(() => Object.entries(departments || {}).sort(([left], [right]) => left.localeCompare(right)), [departments]);
  const filteredDepartments = useMemo(() => departmentEntries.filter(([department]) => department.toLowerCase().includes(departmentFilter.trim().toLowerCase())), [departmentEntries, departmentFilter]);
  const templates = useMemo(() => (departments?.[selectedDepartment] || []).filter((template) => `${template.documentName} ${template.documentId} ${template.fileName || ""}`.toLowerCase().includes(query.trim().toLowerCase())), [departments, selectedDepartment, query]);
  const total = useMemo(() => departmentEntries.reduce((count, [, documents]) => count + documents.length, 0), [departmentEntries]);
  const available = useMemo(() => templates.filter((template) => template.templatePath).length, [templates]);
  const selectedQuestionTotal = useMemo(() => templates.reduce((total, template) => total + (template.questionCount || 0), 0), [templates]);

  async function approveTemplate(event) {
    event.preventDefault();
    if (!approvalFile) { setApprovalMessage("Select the approved template file."); return; }
    setApprovalMessage("Saving approved template...");
    const response = await fetch("/api/admin/template-library/approve", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-Programme": programme, "X-Document-Id": approval.documentId || "", "X-Document-Name": approval.documentName, "X-Department": selectedDepartment, "X-Document-Path": approval.templatePath, "X-File-Name": approvalFile.name, "X-Approved-By": "Super Admin", "X-Approval-Note": approvalNote }, body: approvalFile });
    const result = await response.json();
    if (!response.ok) { setApprovalMessage(result.error || "Unable to approve the template."); return; }
    setApproval(null); setApprovalFile(null); setApprovalNote(""); setApprovalMessage("");
  }

  async function showHistory(template) {
    setHistoryLoadingPath(template.templatePath);
    try {
      const params = new URLSearchParams({ programme, path: template.templatePath, documentId: template.documentId || "", documentName: template.documentName || "" });
      const response = await fetch(`/api/admin/template-library/versions?${params.toString()}`);
      const result = await response.json();
      if (!response.ok) { setError(result.error || "Unable to load template history."); return; }
      setHistory({ template, document: result.document });
    } finally {
      setHistoryLoadingPath("");
    }
  }

  async function showQuestionnaireReport() {
    setReportLoading(true);
    const response = await fetch("/api/admin/template-library/questionnaire-report");
    const result = await response.json();
    setReportLoading(false);
    if (!response.ok) return setError(result.error || "Unable to load questionnaire report.");
    setQuestionnaireReport(result.documents || []);
  }

  async function configureQuestions(template) {
    setQuestionnaireMessage("Loading questionnaire...");
    const response = await fetch(`/api/admin/template-library/questions?programme=${encodeURIComponent(programme)}&path=${encodeURIComponent(template.templatePath)}`);
    const result = await response.json();
    if (!response.ok) return setQuestionnaireMessage(result.error || "Unable to load questionnaire.");
    setQuestionnaireTemplate(template);
    setQuestionnaireQuestions(result.questionnaire?.questions || []);
    setQuestionnaireMessage("");
  }

  async function saveQuestions(event) {
    event.preventDefault();
    setQuestionnaireMessage("Saving questionnaire...");
    const response = await fetch("/api/admin/template-library/questions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ programme, templatePath: questionnaireTemplate.templatePath, questions: questionnaireQuestions }) });
    const result = await response.json();
    if (!response.ok) return setQuestionnaireMessage(result.error || "Unable to save questionnaire.");
    setQuestionnaireMessage("Questionnaire saved. Hospital users will see these questions when answering this document.");
  }

  function updateQuestion(index, patch) {
    setQuestionnaireQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question));
  }

  function updateQuestionOptions(index, value) {
    updateQuestion(index, { optionsText: value, options: value.split(/\r?\n/).map((option) => option.trim()).filter(Boolean) });
  }

  if (error) return <main className="admin-main"><p className="status error">{error}</p></main>;

  return (
    <main className="template-library">
      <header className="template-library-header">
        <div className="template-library-title-row">
        <div className="brand">
          <img src={hospitalLogo} alt="NABH Docs" />
          <div>
            <p className="eyebrow">NABH document workspace</p>
            <h1>Template library</h1>
          </div>
        </div>
        <div className="template-library-header-actions"><button className="secondary-button" type="button" title="Refresh the template catalog from R2 (only needed if files were added directly in R2)" disabled={!programme || refreshingCatalog} onClick={() => loadTemplates(true)}><RefreshCw size={16} className={refreshingCatalog ? "spin-icon" : ""} /> {refreshingCatalog ? "Refreshing..." : "Refresh catalog"}</button><button className="secondary-button" type="button" title="Open questionnaire report" onClick={showQuestionnaireReport}><ClipboardList size={16} /> {reportLoading ? "Loading..." : "Questionnaire report"}</button><a className="secondary-button" title="Export questionnaire report PDF" href="/api/admin/template-library/questionnaire-report.pdf"><Download size={16} /> Export PDF</a></div>
        </div>
        <p className="intro template-library-description">Browse programme-specific master templates and configure the questions hospitals must answer for each document.</p>
        <div className="template-library-selector">
          <label htmlFor="programme-select">Programme</label>
          <select id="programme-select" value={programme} onChange={(event) => setProgramme(event.target.value)}>
            <option value="">Select a programme</option>
            {NABH_ACCREDITATION_PROGRAMMES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          {!programme && <span>Choose a programme to view its template categories.</span>}
        </div>
        {departments && <p className="intro">{departmentEntries.length} workspace categories &middot; {total} templates &middot; <span className="active-count">available</span></p>}
      </header>

      {!programme && <p className="empty">Select an NABH accreditation programme to browse its templates.</p>}
      {programme && loading && <p className="loading-state"><RefreshCw size={15} className="spin-icon" /> Loading templates for "{programme}"...</p>}
      {programme && !loading && libraryMessage && <p className="access-message">{libraryMessage}</p>}

      {programme && !loading && !libraryMessage && departments && (
        <section className="layout">
          <nav className="department-list">
            <label className="filter-box">
              <Search size={14} />
              <input value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} placeholder="Filter departments" />
            </label>
            {filteredDepartments.map(([department, documents]) => (
              <button className={department === selectedDepartment ? "active" : ""} key={department} title={`Show ${department}`} onClick={() => setSelectedDepartment(department)}>
                <FolderOpen size={16} />
                <span>{department}</span>
                <span className="count-pill count-pill-active">{documents.filter((template) => template.templatePath).length}</span>
                <span className="count-pill count-pill-inactive">{documents.filter((template) => !template.templatePath).length}</span>
                <span className="count-pill count-pill-questions" title="Configured questions">Q {documents.reduce((total, template) => total + (template.questionCount || 0), 0)}</span>
              </button>
            ))}
            {filteredDepartments.length === 0 && <p className="empty">No departments match.</p>}
          </nav>
          <section className="document-panel">
            <div className="panel-heading">
              <FileSearch size={18} />
              <h2>{selectedDepartment}</h2>
              <span className="count">{templates.length} of {departments[selectedDepartment]?.length || 0} document(s)</span>
              <span className="active-count">{available} available</span>
              <span className="inactive-count">{templates.length - available} unavailable</span>
              <span className="question-count has-questions">{selectedQuestionTotal} questions</span>
            </div>
            <label className="filter-box document-search">
              <Search size={14} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by document name, ID, or matched file" />
            </label>
            <div className="toolbar">
              <div className="confidence-chips">
                <span className="chip chip-active">All ({templates.length})</span>
              </div>
            </div>
            {templates.length === 0 ? (
              <p className="empty">No templates match this search.</p>
            ) : (
              <table>
                <thead>
                  <tr><th>Template name</th><th>Type</th><th className="actions-column">Actions</th></tr>
                </thead>
                <tbody>
                  {templates.map((template) => {
                    const Icon = typeIcons[template.fileType] || FileText;
                    const templateFolders = (template.templatePath || "").split("/").slice(0, -1).filter(Boolean);
                    const templateContext = templateFolders.slice(-2).join(" / ");
                    return (
                      <tr key={`${selectedDepartment}-${template.documentId}`}>
                        <td><strong>{template.documentName}</strong>{templateContext && <small className="template-context">{templateContext}</small>}</td>
                        <td>{template.fileType && <span className="template-type"><Icon size={15} /> {template.fileType}</span>}</td>
                        <td className="actions-column">{template.templatePath && (
                          <span className="template-actions">
                            <button className="icon-button" title={`Preview ${template.fileName} as PDF`} onClick={() => setPreview(template)}><Eye size={17} /></button>
                            <a className="icon-button" href={`/api/admin/template-library/download?programme=${encodeURIComponent(programme)}&path=${encodeURIComponent(template.templatePath)}`} title={`Download ${template.fileName}`}><Download size={17} /></a>
                            <button className="icon-button questionnaire-document-action" title={`Upload and approve a new version of ${template.fileName}`} onClick={() => { setApproval(template); setApprovalMessage(""); }}><Upload size={17} /></button>
                            <button className="questionnaire-action questionnaire-document-action" title={`Configure questions for ${template.fileName}`} onClick={() => configureQuestions(template)}><ClipboardList size={17} /><span>{template.questionCount || 0}</span></button>
                            <button className="version-badge" disabled={historyLoadingPath === template.templatePath} title={`View version history for ${template.fileName}`} onClick={() => showHistory(template)}>{historyLoadingPath === template.templatePath ? <RefreshCw size={13} className="spin-icon" /> : <History size={13} />}</button>
                          </span>
                        )}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </section>
      )}

      {approval && (
        <div className="preview-backdrop" role="presentation" onClick={() => setApproval(null)}>
          <section className="document-editor-dialog approval-dialog" role="dialog" aria-modal="true" aria-label={`Approve new version of ${approval.documentName}`} onClick={(event) => event.stopPropagation()}>
            <div className="preview-header"><div><p className="eyebrow">Template approval</p><h2>{approval.documentName}</h2><p className="editor-file-name">{approval.fileName}</p></div><button className="icon-button" type="button" title="Close approval" onClick={() => setApproval(null)}><X size={18} /></button></div>
            <form className="onlyoffice-setup" onSubmit={approveTemplate}>
              <label>Approved replacement file<input type="file" accept={`.${approval.fileType?.toLowerCase() || "docx"}`} onChange={(event) => setApprovalFile(event.target.files?.[0] || null)} required /></label>
              <label>Approval note<textarea value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder="Describe the approved change" /></label>
              {approvalMessage && <p className="access-message">{approvalMessage}</p>}
              <button className="primary-button" type="submit" title="Approve new template version"><CheckCircle2 size={16} /> Approve new version</button>
            </form>
          </section>
        </div>
      )}
      {questionnaireReport && (
        <div className="preview-backdrop" role="presentation" onClick={() => setQuestionnaireReport(null)}>
          <section className="preview-dialog questionnaire-report-dialog" role="dialog" aria-modal="true" aria-label="Questionnaire report" onClick={(event) => event.stopPropagation()}>
            <div className="preview-header"><div><p className="eyebrow">Template library report</p><h2>Configured document questionnaires</h2><p className="editor-file-name">{questionnaireReport.length} document(s) have configured questions.</p></div><div className="preview-actions"><a className="download-button" title="Export questionnaire report PDF" href="/api/admin/template-library/questionnaire-report.pdf"><Download size={15} /> Export PDF</a><button className="icon-button" title="Close report" onClick={() => setQuestionnaireReport(null)}><X size={18} /></button></div></div>
            <div className="questionnaire-report-body">{questionnaireReport.length === 0 ? <p className="empty">No document questionnaires have been configured yet.</p> : <table><thead><tr><th>Programme</th><th>Department</th><th>Document</th><th>Questions</th><th>Configured questions</th></tr></thead><tbody>{questionnaireReport.map((document) => <tr key={`${document.programme}-${document.templatePath}`}><td>{document.programme}</td><td>{document.department}</td><td><strong>{document.documentName}</strong><br /><span className="mono">{document.templatePath}</span></td><td><span className="question-count has-questions">{document.questionCount}</span></td><td><ul className="question-report-list">{document.questions.map((question) => <li key={question.id}>{question.label}{question.required !== false && <span>Required</span>}</li>)}</ul></td></tr>)}</tbody></table>}</div>
          </section>
        </div>
      )}
      {questionnaireTemplate && (
        <div className="preview-backdrop" role="presentation" onClick={() => setQuestionnaireTemplate(null)}>
          <form className="preview-dialog questionnaire-dialog" onSubmit={saveQuestions} onClick={(event) => event.stopPropagation()}>
            <div className="questionnaire-header"><div><p className="eyebrow">Template questionnaire</p><h2>{questionnaireTemplate.documentName}</h2><p>Configure what Hospital Admin respondents must provide for this document.</p></div><button className="icon-button" type="button" title="Close questionnaire" onClick={() => setQuestionnaireTemplate(null)}><X size={18} /></button></div>
            <div className="questionnaire-body">
              <div className="questionnaire-summary"><strong>{questionnaireQuestions.length} question{questionnaireQuestions.length === 1 ? "" : "s"}</strong><span>Responses are stored against each hospital document.</span></div>
              <div className="questionnaire-list">
                {questionnaireQuestions.map((question, index) => (
                  <fieldset className="question-config" key={`${question.id}-${index}`}>
                    <div className="question-config-heading"><legend>Question {index + 1}</legend><button type="button" className="text-button danger-button" onClick={() => setQuestionnaireQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index))}>Remove</button></div>
                    <div className="question-config-grid">
                      <label>Question ID<input value={question.id || ""} onChange={(event) => updateQuestion(index, { id: event.target.value })} /></label>
                      <label>Response type<select value={question.type || "textarea"} onChange={(event) => updateQuestion(index, { type: event.target.value, options: event.target.value === "multiselect" ? question.options || [] : [], optionsText: event.target.value === "multiselect" ? question.optionsText ?? (question.options || []).join("\n") : "" })}><option value="text">Short answer</option><option value="textarea">Long answer</option><option value="multiselect">Multiple selection</option></select></label>
                    </div>
                    <label>Question text<textarea rows={2} value={question.label || ""} onChange={(event) => updateQuestion(index, { label: event.target.value })} placeholder="Ask for the hospital-specific information needed for this document" /></label>
                    {question.type === "multiselect" && <label>Selection options<textarea rows={4} value={question.optionsText ?? (question.options || []).join("\n")} onChange={(event) => updateQuestionOptions(index, event.target.value)} placeholder="Enter one option per line" /></label>}
                    <label className="question-required"><input type="checkbox" checked={question.required !== false} onChange={(event) => updateQuestion(index, { required: event.target.checked })} /> Required answer</label>
                  </fieldset>
                ))}
              </div>
              <button type="button" className="secondary-button add-question-button" title="Add questionnaire question" onClick={() => setQuestionnaireQuestions((current) => [...current, { id: `question_${current.length + 1}`, label: "", type: "textarea", required: true, options: [] }])}><ClipboardList size={15} /> Add question</button>
              {questionnaireMessage && <p className="access-message">{questionnaireMessage}</p>}
            </div>
            <div className="questionnaire-footer"><button className="secondary-button" type="button" onClick={() => setQuestionnaireTemplate(null)}>Close</button><button className="primary-button" type="submit">Save questionnaire</button></div>
          </form>
        </div>
      )}
      {history && (
        <div className="preview-backdrop" role="presentation" onClick={() => setHistory(null)}>
          <section className="preview-dialog" role="dialog" aria-modal="true" aria-label={`Version history for ${history.template.documentName}`} onClick={(event) => event.stopPropagation()}>
            <div className="preview-header"><div><p className="eyebrow">Template version history</p><h2>{history.template.documentName}</h2></div><button className="icon-button" title="Close version history" onClick={() => setHistory(null)}><X size={18} /></button></div>
            {!history.document ? <p className="empty">No approved versions yet.</p> : <table><thead><tr><th>Version</th><th>When</th><th>Approved by</th><th>Action</th><th>Note</th></tr></thead><tbody>{history.document.history.map((version) => <tr key={version.version}><td>v{version.version}</td><td>{formatDateTime(version.timestamp || version.createdAt)}</td><td>{version.approvedBy || "System"}</td><td>{version.action}</td><td>{version.note || "-"}</td></tr>)}</tbody></table>}
          </section>
        </div>
      )}
      {preview && (
        <div className="preview-backdrop" role="presentation" onClick={() => setPreview(null)}>
          <section className="preview-dialog" role="dialog" aria-modal="true" aria-label={`PDF preview of ${preview.documentName}`} onClick={(event) => event.stopPropagation()}>
            <div className="preview-header">
              <div>
                <p className="eyebrow">Template PDF preview</p>
                <h2>{preview.documentName}</h2>
                <p className="editor-file-name">{preview.fileName}</p>
              </div>
              <div className="preview-actions">
                <a className="download-button" title="Download template" href={`/api/admin/template-library/download?programme=${encodeURIComponent(programme)}&path=${encodeURIComponent(preview.templatePath)}`}><Download size={16} /> Download template</a>
                <button className="icon-button" title="Close preview" onClick={() => setPreview(null)}><X size={18} /></button>
              </div>
            </div>
            <iframe className="policy-preview" src={`/api/admin/template-library/preview?programme=${encodeURIComponent(programme)}&path=${encodeURIComponent(preview.templatePath)}`} title={`PDF preview of ${preview.documentName}`} />
          </section>
        </div>
      )}
    </main>
  );
}