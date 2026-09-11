import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, Download, Plus, Trash2, FolderOpen, FileSearch, Search } from "lucide-react";

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

const fieldTypes = ["text", "date", "number", "checkbox", "signature", "table"];

function blankField() {
  return { label: "", type: "text" };
}

function blankSection() {
  return { heading: "", description: "", fields: [blankField()] };
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
  const [structure, setStructure] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/template-studio/categories")
      .then((response) => (response.ok ? response.json() : { categories: [] }))
      .then((result) => setCategories(result.categories || []))
      .catch(() => setCategories([]))
      .finally(() => setCategoriesLoading(false));
  }, []);

  const filteredCategories = categories.filter((item) => item.name.toLowerCase().includes(departmentFilter.trim().toLowerCase()));
  const selectedDocument = documents.find((doc) => String(doc.id) === String(selectedDocumentId)) || null;

  function chooseProgramme(nextProgramme) {
    setProgramme(nextProgramme);
    setCategory(null);
    setDocuments([]);
    setSelectedDocumentId("");
    setStory("");
    setStructure(null);
    setError("");
  }

  // Documents for a department are loaded by category_id as soon as it's selected.
  function chooseDepartment(nextCategory) {
    setCategory(nextCategory);
    setSelectedDocumentId("");
    setStory("");
    setStructure(null);
    setError("");
    setDocumentsLoading(true);
    fetch(`/api/admin/template-studio/categories/${nextCategory.id}/documents`)
      .then((response) => (response.ok ? response.json() : { documents: [] }))
      .then((result) => setDocuments(result.documents || []))
      .catch(() => setDocuments([]))
      .finally(() => setDocumentsLoading(false));
  }

  async function generateStructure(event) {
    event.preventDefault();
    if (!story.trim() && !selectedDocumentId) return setError("Describe the form, or pick a seed document, before generating a structure.");
    setGenerating(true);
    setError("");
    try {
      const response = await fetch("/api/admin/template-studio/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story: `Accreditation programme: ${programme}\nDepartment: ${category.name}\n${story}`,
          documentId: selectedDocumentId || undefined
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to generate a template structure.");
      setStructure({ ...result.structure, programme, department: category.name });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setGenerating(false);
    }
  }

  async function downloadDocx() {
    if (!structure) return;
    setRendering(true);
    setError("");
    try {
      const response = await fetch("/api/admin/template-studio/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structure })
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Unable to render the template.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(structure.title || "template").replace(/[^a-z0-9]+/gi, "_")}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRendering(false);
    }
  }

  function updateField(sectionIndex, fieldIndex, key, value) {
    setStructure((current) => ({
      ...current,
      sections: current.sections.map((section, index) => index !== sectionIndex ? section : {
        ...section,
        fields: section.fields.map((field, fIndex) => fIndex !== fieldIndex ? field : { ...field, [key]: value })
      })
    }));
  }

  function updateSection(sectionIndex, key, value) {
    setStructure((current) => ({
      ...current,
      sections: current.sections.map((section, index) => index !== sectionIndex ? section : { ...section, [key]: value })
    }));
  }

  function addField(sectionIndex) {
    setStructure((current) => ({
      ...current,
      sections: current.sections.map((section, index) => index !== sectionIndex ? section : { ...section, fields: [...section.fields, blankField()] })
    }));
  }

  function removeField(sectionIndex, fieldIndex) {
    setStructure((current) => ({
      ...current,
      sections: current.sections.map((section, index) => index !== sectionIndex ? section : { ...section, fields: section.fields.filter((_, fIndex) => fIndex !== fieldIndex) })
    }));
  }

  function addSection() {
    setStructure((current) => ({ ...current, sections: [...current.sections, blankSection()] }));
  }

  function removeSection(sectionIndex) {
    setStructure((current) => ({ ...current, sections: current.sections.filter((_, index) => index !== sectionIndex) }));
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
        <p className="intro">Describe a form in plain language and generate a clean, editable NABH document template.</p>
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

                {category.metaPrompt && (
                  <div className="template-studio-prompt-preview">
                    <small>Category meta-prompt</small>
                    <p>{category.metaPrompt}</p>
                  </div>
                )}

                <section className="users-panel template-studio-story">
                  {documentsLoading && <p className="loading-state"><RefreshCw size={15} className="spin-icon" /> Loading seed documents...</p>}
                  {!documentsLoading && documents.length > 0 && (
                    <label className="role-name">
                      Start from a seed document (optional)
                      <select value={selectedDocumentId} onChange={(event) => setSelectedDocumentId(event.target.value)}>
                        <option value="">None - describe the form from scratch</option>
                        {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}{doc.standardRef ? ` (${doc.standardRef})` : ""}</option>)}
                      </select>
                    </label>
                  )}
                  {!documentsLoading && documents.length === 0 && <p className="empty">No seed documents yet for this department - describe the form from scratch below.</p>}

                  {selectedDocument && (
                    <div className="template-studio-prompt-preview">
                      {selectedDocument.standardRef && <p><small>Standard reference</small><strong>{selectedDocument.standardRef}</strong></p>}
                      {selectedDocument.expectedContent && <p><small>Expected content</small>{selectedDocument.expectedContent}</p>}
                      <p><small>Document prompt</small>{selectedDocument.documentPrompt}</p>
                    </div>
                  )}

                  <form onSubmit={generateStructure}>
                    <label>
                      Hospital-specific notes {selectedDocumentId ? "(optional)" : ""}
                      <textarea rows={6} value={story} onChange={(event) => setStory(event.target.value)} placeholder="Example: We need a Patient Consent form for surgical procedures. It should capture patient identification, the procedure details, risks explained, consent statement, and signatures from the patient and the consenting doctor." />
                    </label>
                    {error && <p className="status error">{error}</p>}
                    <button className="primary-button" type="submit" disabled={generating}>
                      {generating ? <><RefreshCw size={16} className="spin-icon" /> Generating...</> : <><Sparkles size={16} /> Generate structure</>}
                    </button>
                  </form>
                </section>

                {structure && (
                  <section className="users-panel template-studio-structure">
                    <div className="panel-heading">
                      <Sparkles size={18} />
                      <h2>Review and refine</h2>
                    </div>
                    <label className="role-name">Document title<input value={structure.title} onChange={(event) => setStructure((current) => ({ ...current, title: event.target.value }))} /></label>
                    <label className="role-name">Purpose<textarea rows={2} value={structure.purpose || ""} onChange={(event) => setStructure((current) => ({ ...current, purpose: event.target.value }))} /></label>

                    {structure.sections.map((section, sectionIndex) => (
                      <section className="template-studio-section" key={sectionIndex}>
                        <div className="template-studio-section-heading">
                          <input value={section.heading} onChange={(event) => updateSection(sectionIndex, "heading", event.target.value)} placeholder="Section heading" />
                          <button className="icon-button" type="button" title="Remove section" onClick={() => removeSection(sectionIndex)}><Trash2 size={15} /></button>
                        </div>
                        <input value={section.description} onChange={(event) => updateSection(sectionIndex, "description", event.target.value)} placeholder="Section description (optional)" />
                        {section.fields.map((field, fieldIndex) => (
                          <div className="template-studio-field" key={fieldIndex}>
                            <input value={field.label} onChange={(event) => updateField(sectionIndex, fieldIndex, "label", event.target.value)} placeholder="Field label" />
                            <select value={field.type} onChange={(event) => updateField(sectionIndex, fieldIndex, "type", event.target.value)}>
                              {fieldTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                            </select>
                            <button className="icon-button" type="button" title="Remove field" onClick={() => removeField(sectionIndex, fieldIndex)}><Trash2 size={15} /></button>
                          </div>
                        ))}
                        <button className="secondary-button" type="button" onClick={() => addField(sectionIndex)}><Plus size={15} /> Add field</button>
                      </section>
                    ))}
                    <button className="secondary-button" type="button" onClick={addSection}><Plus size={16} /> Add section</button>

                    <div className="template-studio-actions">
                      <button className="primary-button" type="button" disabled={rendering} onClick={downloadDocx}>
                        {rendering ? <><RefreshCw size={16} className="spin-icon" /> Rendering...</> : <><Download size={16} /> Generate DOCX</>}
                      </button>
                    </div>
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
