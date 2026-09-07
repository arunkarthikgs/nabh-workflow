import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Download, Eye, FileSearch, FileSpreadsheet, FileText, FolderOpen, History, Presentation, Search, Upload, X } from "lucide-react";
import hospitalLogo from "./assets/nabh-readiness-system.png";

const typeIcons = { DOCX: FileText, XLSX: FileSpreadsheet, PPTX: Presentation };

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
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditEntries, setAuditEntries] = useState([]);
  const [questionnaireTemplate, setQuestionnaireTemplate] = useState(null);
  const [questionnaireQuestions, setQuestionnaireQuestions] = useState([]);
  const [questionnaireMessage, setQuestionnaireMessage] = useState("");

  useEffect(() => {
    if (!programme) { setDepartments(null); setLibraryMessage(""); setSelectedDepartment(""); return; }
    setLoading(true);
    fetch(`/api/admin/template-library?programme=${encodeURIComponent(programme)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load the template library.");
        return result;
      })
      .then((result) => {
        setLibraryMessage(result.error || "");
        setDepartments(result.departments || {});
        setSelectedDepartment(Object.keys(result.departments || {})[0] || "");
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [programme]);

  const departmentEntries = useMemo(() => Object.entries(departments || {}).sort(([left], [right]) => left.localeCompare(right)), [departments]);
  const filteredDepartments = useMemo(() => departmentEntries.filter(([department]) => department.toLowerCase().includes(departmentFilter.trim().toLowerCase())), [departmentEntries, departmentFilter]);
  const templates = useMemo(() => (departments?.[selectedDepartment] || []).filter((template) => `${template.documentName} ${template.documentId} ${template.fileName || ""}`.toLowerCase().includes(query.trim().toLowerCase())), [departments, selectedDepartment, query]);
  const total = useMemo(() => departmentEntries.reduce((count, [, documents]) => count + documents.length, 0), [departmentEntries]);
  const available = useMemo(() => templates.filter((template) => template.templatePath).length, [templates]);

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
    const response = await fetch(`/api/admin/template-library/versions?programme=${encodeURIComponent(programme)}&path=${encodeURIComponent(template.templatePath)}`);
    const result = await response.json();
    if (!response.ok) { setError(result.error || "Unable to load template history."); return; }
    setHistory({ template, document: result.document });
  }

  async function toggleAudit() {
    if (auditOpen) { setAuditOpen(false); return; }
    const response = await fetch("/api/document-audit");
    const result = await response.json();
    if (!response.ok) { setError(result.error || "Unable to load the audit log."); return; }
    setAuditEntries(result.entries || []);
    setAuditOpen(true);
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

  if (error) return <main className="admin-main"><p className="status error">{error}</p></main>;

  return (
    <main className="template-library">
      <header>
        <div className="brand">
          <img src={hospitalLogo} alt="NABH Docs" />
          <div>
            <p className="eyebrow">NABH document workspace</p>
            <h1>Template library</h1>
          </div>
        </div>
        <p className="intro">Each NABH accreditation programme has its own template set. Select a programme to browse it. Super Admins can configure document questionnaires from each template row.</p>
        <button className="secondary-button" type="button" onClick={toggleAudit}><ClipboardList size={16} /> {auditOpen ? "Template library" : "Audit log"}</button>
        <label className="filter-box">
          NABH accreditation programme
          <select value={programme} onChange={(event) => setProgramme(event.target.value)}>
            <option value="">Select a programme</option>
            {NABH_ACCREDITATION_PROGRAMMES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        {departments && <p className="intro">{departmentEntries.length} workspace categories &middot; {total} templates &middot; <span className="active-count">available</span></p>}
      </header>

      {auditOpen ? (
        <section className="document-panel">
          <div className="panel-heading"><ClipboardList size={18} /><h2>Global approval activity</h2><span className="count">{auditEntries.length} entries</span></div>
          {auditEntries.length === 0 ? <p className="empty">No template or hospital approval events have been recorded.</p> : <table><thead><tr><th>When</th><th>Scope</th><th>Document</th><th>Version</th><th>Approved by</th><th>Action</th><th>Note</th></tr></thead><tbody>{auditEntries.map((entry) => <tr key={entry.objectKey || `${entry.timestamp}-${entry.documentId}`}><td>{new Date(entry.timestamp).toLocaleString()}</td><td>{entry.scope === "template" ? "Master template" : entry.hospitalCode || "Hospital"}</td><td><strong>{entry.documentName || "-"}</strong><br /><span className="mono">{entry.documentId || "-"}</span></td><td>v{entry.version || "-"}</td><td>{entry.approvedBy || "System"}</td><td>{entry.action || "-"}</td><td>{entry.note || "-"}</td></tr>)}</tbody></table>}
        </section>
      ) : <>
      {!programme && <p className="empty">Select an NABH accreditation programme to browse its templates.</p>}
      {programme && loading && <p className="empty">Loading templates for "{programme}"...</p>}
      {programme && !loading && libraryMessage && <p className="access-message">{libraryMessage}</p>}

      {programme && !loading && !libraryMessage && departments && (
        <section className="layout">
          <nav className="department-list">
            <label className="filter-box">
              <Search size={14} />
              <input value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} placeholder="Filter departments" />
            </label>
            {filteredDepartments.map(([department, documents]) => (
              <button className={department === selectedDepartment ? "active" : ""} key={department} onClick={() => setSelectedDepartment(department)}>
                <FolderOpen size={16} />
                <span>{department}</span>
                <span className="count-pill count-pill-active">{documents.filter((template) => template.templatePath).length}</span>
                <span className="count-pill count-pill-inactive">{documents.filter((template) => !template.templatePath).length}</span>
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
                  <tr><th>Document</th><th>Template name</th><th>Stored template</th><th>Type</th><th aria-label="Actions" /></tr>
                </thead>
                <tbody>
                  {templates.map((template) => {
                    const Icon = typeIcons[template.fileType] || FileText;
                    return (
                      <tr key={`${selectedDepartment}-${template.documentId}`}>
                        <td className="mono">{template.documentId}</td>
                        <td><strong>{template.documentName}</strong></td>
                        <td className="file-cell" title={template.templatePath || ""}>{template.fileName || <span className="no-match">No file matched</span>}</td>
                        <td>{template.fileType && <span className="template-type"><Icon size={15} /> {template.fileType}</span>}</td>
                        <td>{template.templatePath && (
                          <span className="template-actions">
                            <button className="icon-button" title={`Preview ${template.fileName} as PDF`} onClick={() => setPreview(template)}><Eye size={17} /></button>
                            <a className="icon-button" href={`/api/admin/template-library/download?programme=${encodeURIComponent(programme)}&path=${encodeURIComponent(template.templatePath)}`} title={`Download ${template.fileName}`}><Download size={17} /></a>
                            <button className="icon-button" title={`View version history for ${template.fileName}`} onClick={() => showHistory(template)}><History size={17} /></button>
                            <button className="icon-button" title={`Configure questions for ${template.fileName}`} onClick={() => configureQuestions(template)}><ClipboardList size={17} /></button>
                            <button className="icon-button" title={`Upload and approve a new version of ${template.fileName}`} onClick={() => { setApproval(template); setApprovalMessage(""); }}><Upload size={17} /></button>
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
      </>}

      {approval && (
        <div className="preview-backdrop" role="presentation" onClick={() => setApproval(null)}>
          <form className="preview-dialog admin-form" onSubmit={approveTemplate} onClick={(event) => event.stopPropagation()}>
            <div className="preview-header"><div><p className="eyebrow">Template approval</p><h2>{approval.documentName}</h2><p className="editor-file-name">{approval.fileName}</p></div><button className="icon-button" type="button" title="Close approval" onClick={() => setApproval(null)}><X size={18} /></button></div>
            <label>Approved replacement file<input type="file" accept={`.${approval.fileType?.toLowerCase() || "docx"}`} onChange={(event) => setApprovalFile(event.target.files?.[0] || null)} required /></label>
            <label>Approval note<textarea value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder="Describe the approved change" /></label>
            {approvalMessage && <p className="access-message">{approvalMessage}</p>}
            <button className="primary-button" type="submit"><CheckCircle2 size={16} /> Approve new version</button>
          </form>
        </div>
      )}
      {questionnaireTemplate && (
        <div className="preview-backdrop" role="presentation" onClick={() => setQuestionnaireTemplate(null)}>
          <form className="preview-dialog admin-form" onSubmit={saveQuestions} onClick={(event) => event.stopPropagation()}>
            <div className="preview-header"><div><p className="eyebrow">Template questionnaire</p><h2>{questionnaireTemplate.documentName}</h2><p className="editor-file-name">Configure questions for Hospital Admin respondents.</p></div><button className="icon-button" type="button" title="Close questionnaire" onClick={() => setQuestionnaireTemplate(null)}><X size={18} /></button></div>
            {questionnaireQuestions.map((question, index) => <fieldset className="question-config" key={`${question.id}-${index}`}><legend>Question {index + 1}</legend><label>Question ID<input value={question.id || ""} onChange={(event) => updateQuestion(index, { id: event.target.value })} /></label><label>Question text<textarea rows={2} value={question.label || ""} onChange={(event) => updateQuestion(index, { label: event.target.value })} /></label><label>Type<select value={question.type || "textarea"} onChange={(event) => updateQuestion(index, { type: event.target.value })}><option value="text">Text</option><option value="textarea">Long answer</option><option value="multiselect">Multiple selection</option></select></label><label><input type="checkbox" checked={question.required !== false} onChange={(event) => updateQuestion(index, { required: event.target.checked })} /> Required answer</label><button type="button" className="text-button" onClick={() => setQuestionnaireQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index))}>Remove question</button></fieldset>)}
            <button type="button" className="secondary-button" onClick={() => setQuestionnaireQuestions((current) => [...current, { id: `question_${current.length + 1}`, label: "", type: "textarea", required: true }])}>Add question</button>
            {questionnaireMessage && <p className="access-message">{questionnaireMessage}</p>}
            <button className="primary-button" type="submit">Save questionnaire</button>
          </form>
        </div>
      )}
      {history && (
        <div className="preview-backdrop" role="presentation" onClick={() => setHistory(null)}>
          <section className="preview-dialog" role="dialog" aria-modal="true" aria-label={`Version history for ${history.template.documentName}`} onClick={(event) => event.stopPropagation()}>
            <div className="preview-header"><div><p className="eyebrow">Template version history</p><h2>{history.template.documentName}</h2></div><button className="icon-button" title="Close version history" onClick={() => setHistory(null)}><X size={18} /></button></div>
            {!history.document ? <p className="empty">No approved versions yet.</p> : <table><thead><tr><th>Version</th><th>When</th><th>Approved by</th><th>Action</th><th>Note</th></tr></thead><tbody>{history.document.history.map((version) => <tr key={version.version}><td>v{version.version}</td><td>{new Date(version.timestamp || version.createdAt).toLocaleString()}</td><td>{version.approvedBy || "System"}</td><td>{version.action}</td><td>{version.note || "-"}</td></tr>)}</tbody></table>}
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
                <a className="download-button" href={`/api/admin/template-library/download?programme=${encodeURIComponent(programme)}&path=${encodeURIComponent(preview.templatePath)}`}><Download size={16} /> Download template</a>
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