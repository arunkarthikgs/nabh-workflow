import { useState } from "react";
import { Sparkles, RefreshCw, Download, Plus, Trash2 } from "lucide-react";

const fieldTypes = ["text", "date", "number", "checkbox", "signature", "table"];

function blankField() {
  return { label: "", type: "text" };
}

function blankSection() {
  return { heading: "", description: "", fields: [blankField()] };
}

export default function TemplateStudio() {
  const [story, setStory] = useState("");
  const [structure, setStructure] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");

  async function generateStructure(event) {
    event.preventDefault();
    if (!story.trim()) return setError("Describe the form before generating a structure.");
    setGenerating(true);
    setError("");
    try {
      const response = await fetch("/api/admin/template-studio/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to generate a template structure.");
      setStructure(result.structure);
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
      </header>
      <section className="users-panel template-studio-story">
        <form onSubmit={generateStructure}>
          <label>
            Describe the form
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
    </main>
  );
}
