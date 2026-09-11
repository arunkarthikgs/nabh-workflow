// Converts a free-form "story" describing a form into a structured section/field outline via an
// LLM, then renders that outline into a clean, ready-to-edit DOCX template. No AI provider SDK is
// required - this calls the OpenAI-compatible chat completions endpoint directly over fetch, so any
// OpenAI-compatible endpoint (Azure OpenAI, local proxy, etc.) can be used via AI_TEMPLATE_BASE_URL.
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, WidthType, TextRun } from "docx";
import { configValue } from "./config.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

const STRUCTURE_SYSTEM_PROMPT = `You turn a hospital administrator's plain-language description of a form ("story") into a clean, structured document outline for an NABH-compliant controlled document.
Respond with strict JSON only, matching this shape:
{
  "title": "Document title",
  "purpose": "One paragraph describing the document's purpose",
  "sections": [
    {
      "heading": "Section heading",
      "description": "Optional short description of what this section captures",
      "fields": [ { "label": "Field label", "type": "text|date|number|checkbox|signature|table" } ]
    }
  ]
}
Keep section headings short and in title case. Infer reasonable sections and fields even if the story is brief. Do not include any commentary outside the JSON.`;

function apiKey() {
  return configValue("AI_TEMPLATE_API_KEY") || configValue("OPENAI_API_KEY");
}

function baseUrl() {
  return configValue("AI_TEMPLATE_BASE_URL", DEFAULT_BASE_URL);
}

function model() {
  return configValue("AI_TEMPLATE_MODEL", DEFAULT_MODEL);
}

function extractJson(rawText) {
  const text = String(rawText || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  try { return JSON.parse(candidate); }
  catch { throw new Error("The AI response could not be parsed as structured template data."); }
}

function normalizeStructure(structure) {
  const title = String(structure?.title || "").trim() || "Untitled document";
  const purpose = String(structure?.purpose || "").trim();
  const sections = Array.isArray(structure?.sections) ? structure.sections : [];
  return {
    title,
    purpose,
    sections: sections.map((section) => ({
      heading: String(section?.heading || "Untitled section").trim(),
      description: String(section?.description || "").trim(),
      fields: Array.isArray(section?.fields)
        ? section.fields.map((field) => ({
            label: String(field?.label || "Field").trim(),
            type: ["text", "date", "number", "checkbox", "signature", "table"].includes(field?.type) ? field.type : "text"
          }))
        : []
    }))
  };
}

// Calls the configured LLM to turn a story into a structured section/field outline.
export async function generateTemplateStructure(story) {
  const trimmedStory = String(story || "").trim();
  if (!trimmedStory) throw new Error("Describe the form before generating a structure.");
  if (!apiKey()) throw new Error("AI template generation is not configured. Set AI_TEMPLATE_API_KEY (or OPENAI_API_KEY) in config.properties.");

  const response = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({
      model: model(),
      temperature: 0.4,
      messages: [
        { role: "system", content: STRUCTURE_SYSTEM_PROMPT },
        { role: "user", content: trimmedStory }
      ]
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "The AI template service could not generate a structure.");
  const structure = extractJson(data?.choices?.[0]?.message?.content);
  return normalizeStructure(structure);
}

function fieldParagraph(field) {
  const suffix = field.type === "signature" ? "  ____________________"
    : field.type === "checkbox" ? "  ☐"
    : field.type === "date" ? "  ____ / ____ / ______"
    : "  ______________________________";
  return new Paragraph({ children: [new TextRun({ text: `${field.label}:`, bold: true }), new TextRun(suffix)] });
}

// Renders a (possibly user-edited) structure into a DOCX buffer ready for review in the Template Library.
export async function renderTemplateDocx(structure) {
  const normalized = normalizeStructure(structure);
  const children = [
    new Paragraph({ text: normalized.title, heading: HeadingLevel.TITLE }),
  ];
  if (normalized.purpose) children.push(new Paragraph({ text: normalized.purpose }));

  for (const section of normalized.sections) {
    children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }));
    if (section.description) children.push(new Paragraph({ text: section.description }));
    if (section.fields.some((field) => field.type === "table")) {
      const tableFields = section.fields.filter((field) => field.type === "table");
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: tableFields.map((field) => new TableCell({ children: [new Paragraph(field.label)] })) })]
      }));
    }
    for (const field of section.fields.filter((f) => f.type !== "table")) children.push(fieldParagraph(field));
  }

  const document = new Document({ sections: [{ children }] });
  return Packer.toBuffer(document);
}
