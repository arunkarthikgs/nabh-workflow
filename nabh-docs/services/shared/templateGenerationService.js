// NABH Template Studio's async generation pipeline: pulls a document_prompt off the
// nabh_template_jobs queue, calls the configured AI provider for STRUCTURED JSON (not raw prose),
// and renders that JSON into a styled .docx via styledDocxRenderer.js.
import { configValue } from "./config.js";
import { buildStyledDocx } from "./styledDocxRenderer.js";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_MODEL = "claude-sonnet-5";
const API_VERSION_HEADER = "2023-06-01";

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
  return configValue("AI_PROVIDER_API_KEY");
}

function baseUrl() {
  return configValue("AI_PROVIDER_BASE_URL", DEFAULT_BASE_URL);
}

function model() {
  return configValue("AI_PROVIDER_MODEL", DEFAULT_MODEL);
}

function maxTokens() {
  return Number(configValue("AI_PROVIDER_MAX_TOKENS", "8192")) || 8192;
}

function workspaceId() {
  return configValue("AI_PROVIDER_WORKSPACE_ID");
}

function extractJson(rawText) {
  const text = String(rawText || "").trim();
  if (!text) throw new Error("The AI provider returned an empty response.");
  const fenced = text.startsWith("```") ? text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim() : text;
  try { return JSON.parse(fenced); }
  catch (error) { throw new Error(`The AI provider did not return valid JSON (its response may have been cut off - try again or increase AI_PROVIDER_MAX_TOKENS): ${error.message}`); }
}

// The response may include non-text blocks (e.g. "thinking") before the actual text block, so find
// the first block with type "text" rather than assuming it's at index 0.
function firstTextBlock(content) {
  return Array.isArray(content) ? content.find((block) => block?.type === "text")?.text : undefined;
}

// Low-level caller for the AI provider's Messages API with custom system prompt and user message.
export async function callAiMessageApi(systemPrompt, userMessage) {
  if (!apiKey()) throw new Error("Template generation is not configured. Set AI_PROVIDER_API_KEY in config.properties.");
  const headers = { "Content-Type": "application/json", "x-api-key": apiKey(), "anthropic-version": API_VERSION_HEADER };
  if (workspaceId()) headers["anthropic-workspace-id"] = workspaceId();
  const response = await fetch(`${baseUrl()}/v1/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: model(),
      max_tokens: maxTokens(),
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }]
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "The AI provider request failed.");
  if (data?.stop_reason === "max_tokens") throw new Error(`The AI provider's response was truncated at ${maxTokens()} tokens before finishing. Increase AI_PROVIDER_MAX_TOKENS in config.properties.`);
  const text = firstTextBlock(data?.content);
  if (!text) throw new Error(`The AI provider returned no text content (stop_reason: ${data?.stop_reason || "unknown"}, content block types: ${(data?.content || []).map((block) => block?.type).join(", ") || "none"}).`);
  return extractJson(text);
}

// System prompt to transform layman's user description (context & purpose) into a refined document prompt.
const PROMPT_MASSAGE_SYSTEM_PROMPT = `You are an expert NABH (National Accreditation Board for Hospitals & Healthcare Providers) quality and compliance documentation consultant.
Your task is to take a hospital administrator's plain-language, layman description (purpose, context, workflow notes) of a healthcare document, along with its category (e.g., SOP, Policy, Form, Manual, Checklist, Register) and the category's structural meta-prompt, and convert it into a clear, comprehensive, and professional DOCUMENT-LEVEL PROMPT for generating an NABH master template.

The generated output MUST be strict JSON only (no markdown code blocks, no preamble, no extra commentary) matching this exact shape:
{
  "name": "Clean professional document title (e.g. 'Surgical Site Infection Surveillance SOP')",
  "standardRef": "Relevant NABH standard reference code if identifiable (e.g. 'COP 8' or 'IPC 1'), or empty string",
  "expectedContent": "Concise summary of key required items and compliance expectations",
  "documentPrompt": "The detailed document-level prompt that will guide the master template generation. It must define the required sections, scope, procedures/fields, and use bracketed placeholders like [HOSPITAL NAME], [STAFF ROLE], [TIMEFRAME] for hospital variables."
}`;

// Massages a layman's description (context, purpose) into a refined document prompt, title, and expected content.
export async function massageDocumentPrompt({ categoryName, metaPrompt, description, documentName = "", standardRef = "" }) {
  const trimmed = String(description || "").trim();
  if (!trimmed) throw new Error("Please enter a description of the document's context and purpose.");

  const userContent = [
    categoryName && `Category / Document Type: ${categoryName}`,
    metaPrompt && `Category Meta-Prompt (Structural rules):\n${metaPrompt}`,
    documentName && `Working Document Name: ${documentName}`,
    standardRef && `Standard Reference: ${standardRef}`,
    `User's Layman Description (Context & Purpose):\n${trimmed}`
  ].filter(Boolean).join("\n\n");

  const result = await callAiMessageApi(PROMPT_MASSAGE_SYSTEM_PROMPT, userContent);
  return {
    name: String(result?.name || documentName || "New Document").trim(),
    standardRef: String(result?.standardRef || standardRef || "").trim(),
    expectedContent: String(result?.expectedContent || "").trim(),
    documentPrompt: String(result?.documentPrompt || "").trim()
  };
}

// Calls the AI provider's Messages API with the document_prompt as the sole user message.
export async function callAiProvider(documentPrompt) {
  return callAiMessageApi(SYSTEM_PROMPT, documentPrompt);
}

// End-to-end: document_prompt -> AI provider JSON -> styled .docx buffer. `context` (department,
// standardRef) comes from the seed document, when the job was generated from one - see
// styledDocxRenderer.js for how it's used in the header/footer/title block.
export async function generateTemplateDocx(documentPrompt, context = {}) {
  const template = await callAiProvider(documentPrompt);
  const buffer = await buildStyledDocx(template, context);
  return { template, buffer };
}
