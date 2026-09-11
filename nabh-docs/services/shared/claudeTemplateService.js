// NABH Template Studio's async generation pipeline: pulls a document_prompt off the
// nabh_template_jobs queue, calls the Claude API for STRUCTURED JSON (not raw prose), and renders
// that JSON into a formatted .docx with the `docx` package. Mirrors the reference Python pipeline
// (anthropic + python-docx) but runs in-process here since this app is a long-running Node server.
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { configValue } from "./config.js";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_MODEL = "claude-sonnet-5";
const ANTHROPIC_VERSION = "2023-06-01";

const SYSTEM_PROMPT = `You are a NABH quality and accreditation documentation specialist.
You are producing a reusable MASTER TEMPLATE, not a document for a specific hospital.

Keep every bracketed placeholder from the prompt (e.g. [HOSPITAL NAME], [BED COUNT])
exactly as given, wherever that information would appear. Add further bracketed
placeholders of your own for any other hospital-specific detail (dates, staff roles,
department names, statistics) rather than inventing real-sounding values.

Respond with ONLY a JSON object - no markdown fences, no preamble, no commentary -
matching this exact shape:

{
  "title": "string - the document title",
  "document_number_label": "string - e.g. 'SOP No.' or 'Policy No.' or 'Form No.'",
  "sections": [
    {
      "heading": "string - section heading, e.g. 'Purpose'",
      "paragraphs": ["string", "string", ...],
      "numbered_list": ["string", "string", ...],
      "table": {
        "headers": ["string", ...],
        "rows": [["string", ...], ...]
      }
    }
  ]
}

Rules for the JSON:
- Use "paragraphs" for prose sections (Purpose, Scope, Policy Statement, etc.)
- Use "numbered_list" for sequential procedure steps
- Use "table" only for a document-control block (Version, Effective Date, Review Date,
  Prepared by / Reviewed by / Approved by) or a fillable-field list - omit it otherwise
- Include only the keys relevant to a given section; omit empty ones entirely
- Every section from the prompt's requested structure must appear, in order`;

function apiKey() {
  return configValue("ANTHROPIC_API_KEY");
}

function baseUrl() {
  return configValue("ANTHROPIC_BASE_URL", DEFAULT_BASE_URL);
}

function model() {
  return configValue("ANTHROPIC_MODEL", DEFAULT_MODEL);
}

function maxTokens() {
  return Number(configValue("ANTHROPIC_MAX_TOKENS", "8192")) || 8192;
}

function extractJson(rawText) {
  const text = String(rawText || "").trim();
  if (!text) throw new Error("Claude returned an empty response.");
  const fenced = text.startsWith("```") ? text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim() : text;
  try { return JSON.parse(fenced); }
  catch (error) { throw new Error(`Claude did not return valid JSON (its response may have been cut off - try again or increase ANTHROPIC_MAX_TOKENS): ${error.message}`); }
}

// Calls the Claude Messages API with the document_prompt as the sole user message, per the
// reference pipeline - no free-text story layering here, just the stored prompt.
export async function callClaude(documentPrompt) {
  if (!apiKey()) throw new Error("Template generation is not configured. Set ANTHROPIC_API_KEY in config.properties.");
  const response = await fetch(`${baseUrl()}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey(), "anthropic-version": ANTHROPIC_VERSION },
    body: JSON.stringify({
      model: model(),
      max_tokens: maxTokens(),
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: documentPrompt }]
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "The Claude API request failed.");
  if (data?.stop_reason === "max_tokens") throw new Error(`Claude's response was truncated at ${maxTokens()} tokens before finishing the JSON. Increase ANTHROPIC_MAX_TOKENS in config.properties or shorten the document prompt.`);
  return extractJson(data?.content?.[0]?.text);
}

function numberedParagraphs(items) {
  return items.map((item, index) => new Paragraph({ text: `${index + 1}. ${item}` }));
}

function sectionTable(table) {
  const headers = Array.isArray(table?.headers) ? table.headers : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  if (!headers.length) return [];
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: headers.map((header) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: header, bold: true })] })] })) }),
        ...rows.map((row) => new TableRow({ children: row.map((value) => new TableCell({ children: [new Paragraph(String(value ?? ""))] })) }))
      ]
    }),
    new Paragraph({ text: "" })
  ];
}

// Renders Claude's structured JSON into a .docx buffer - the JS equivalent of build_docx() in the
// reference Python pipeline (title, document-number line, then per-section heading/paragraphs/
// numbered list/table).
export function buildDocxFromClaudeTemplate(template) {
  const children = [
    new Paragraph({ text: template?.title || "Untitled Document", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${template?.document_number_label || "Document No."}: [DOCUMENT NUMBER]`, italics: true, size: 20 })]
    }),
    new Paragraph({ text: "" })
  ];

  for (const section of Array.isArray(template?.sections) ? template.sections : []) {
    children.push(new Paragraph({ text: section.heading || "", heading: HeadingLevel.HEADING_1 }));
    for (const paragraph of Array.isArray(section.paragraphs) ? section.paragraphs : []) children.push(new Paragraph({ text: paragraph }));
    if (Array.isArray(section.numbered_list) && section.numbered_list.length) children.push(...numberedParagraphs(section.numbered_list));
    if (section.table) children.push(...sectionTable(section.table));
  }

  const document = new Document({ sections: [{ children }] });
  return Packer.toBuffer(document);
}

// End-to-end: document_prompt -> Claude JSON -> rendered .docx buffer.
export async function generateClaudeDocx(documentPrompt) {
  const template = await callClaude(documentPrompt);
  const buffer = await buildDocxFromClaudeTemplate(template);
  return { template, buffer };
}
