import { useEffect, useMemo, useState } from "react";
import { Download, Eye, FileSearch, FileSpreadsheet, FileText, FolderOpen, Presentation, Search, X } from "lucide-react";
import hospitalLogo from "./assets/logo.png";

const typeIcons = { DOCX: FileText, XLSX: FileSpreadsheet, PPTX: Presentation };

export default function TemplateLibrary() {
  const [departments, setDepartments] = useState(null);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    fetch("/api/admin/template-library")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load the template library.");
        return result;
      })
      .then((result) => {
        setDepartments(result.departments);
        setSelectedDepartment(Object.keys(result.departments)[0] || "");
      })
      .catch((requestError) => setError(requestError.message));
  }, []);

  const departmentEntries = useMemo(() => Object.entries(departments || {}).sort(([left], [right]) => left.localeCompare(right)), [departments]);
  const filteredDepartments = useMemo(() => departmentEntries.filter(([department]) => department.toLowerCase().includes(departmentFilter.trim().toLowerCase())), [departmentEntries, departmentFilter]);
  const templates = useMemo(() => (departments?.[selectedDepartment] || []).filter((template) => `${template.documentName} ${template.documentId} ${template.fileName || ""}`.toLowerCase().includes(query.trim().toLowerCase())), [departments, selectedDepartment, query]);
  const total = useMemo(() => departmentEntries.reduce((count, [, documents]) => count + documents.length, 0), [departmentEntries]);
  const available = useMemo(() => templates.filter((template) => template.templatePath).length, [templates]);

  if (error) return <main className="admin-main"><p className="status error">{error}</p></main>;
  if (!departments) return <main className="admin-main"><p className="empty">Loading template library...</p></main>;

  return <main className="template-library"><header><div className="brand"><img src={hospitalLogo} alt="NABH Docs" /><div><p className="eyebrow">NABH document workspace</p><h1>Template library</h1></div></div><p className="intro">{departmentEntries.length} departments &middot; {total} Master List documents &middot; <span className="active-count">finalized templates</span></p></header><section className="layout"><nav className="department-list"><label className="filter-box"><Search size={14} /><input value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} placeholder="Filter departments" /></label>{filteredDepartments.map(([department, documents]) => <button className={department === selectedDepartment ? "active" : ""} key={department} onClick={() => setSelectedDepartment(department)}><FolderOpen size={16} /><span>{department}</span><span className="count-pill count-pill-active">{documents.filter((template) => template.templatePath).length}</span><span className="count-pill count-pill-inactive">{documents.filter((template) => !template.templatePath).length}</span></button>)}{filteredDepartments.length === 0 && <p className="empty">No departments match.</p>}</nav><section className="document-panel"><div className="panel-heading"><FileSearch size={18} /><h2>{selectedDepartment}</h2><span className="count">{templates.length} of {departments[selectedDepartment]?.length || 0} document(s)</span><span className="active-count">{available} available</span><span className="inactive-count">{templates.length - available} unavailable</span></div><label className="filter-box document-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by document name, ID, or matched file" /></label><div className="toolbar"><div className="confidence-chips"><span className="chip chip-active">All ({templates.length})</span></div></div>{templates.length === 0 ? <p className="empty">No Master List documents match this search.</p> : <table><thead><tr><th>Master List ID</th><th>Document Name</th><th>Matched template</th><th>Type</th><th aria-label="Actions" /></tr></thead><tbody>{templates.map((template) => { const Icon = typeIcons[template.fileType] || FileText; return <tr key={`${selectedDepartment}-${template.documentId}`}><td className="mono">{template.documentId}</td><td><strong>{template.documentName}</strong></td><td className="file-cell" title={template.templatePath || ""}>{template.fileName || <span className="no-match">No file matched</span>}</td><td>{template.fileType && <span className="template-type"><Icon size={15} /> {template.fileType}</span>}</td><td>{template.templatePath && <span className="template-actions"><button className="icon-button" title={`Preview ${template.fileName} as PDF`} onClick={() => setPreview(template)}><Eye size={17} /></button><a className="icon-button" href={`/api/admin/template-library/download?path=${encodeURIComponent(template.templatePath)}`} title={`Download ${template.fileName}`}><Download size={17} /></a></span>}</td></tr>; })}</tbody></table>}</section></section>{preview && <div className="preview-backdrop" role="presentation" onClick={() => setPreview(null)}><section className="preview-dialog" role="dialog" aria-modal="true" aria-label={`PDF preview of ${preview.documentName}`} onClick={(event) => event.stopPropagation()}><div className="preview-header"><div><p className="eyebrow">Template PDF preview</p><h2>{preview.documentName}</h2><p className="editor-file-name">{preview.fileName}</p></div><div className="preview-actions"><a className="download-button" href={`/api/admin/template-library/download?path=${encodeURIComponent(preview.templatePath)}`}><Download size={16} /> Download template</a><button className="icon-button" title="Close preview" onClick={() => setPreview(null)}><X size={18} /></button></div></div><iframe className="policy-preview" src={`/api/admin/template-library/preview?path=${encodeURIComponent(preview.templatePath)}`} title={`PDF preview of ${preview.documentName}`} /></section></div>}</main>;
}