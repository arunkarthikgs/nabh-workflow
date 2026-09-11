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

// Calls the AI provider's Messages API with the document_prompt as the sole user message.
export async function callAiProvider(documentPrompt) {
  if (!apiKey()) throw new Error("Template generation is not configured. Set AI_PROVIDER_API_KEY in config.properties.");
  const headers = { "Content-Type": "application/json", "x-api-key": apiKey(), "anthropic-version": API_VERSION_HEADER };
  if (workspaceId()) headers["anthropic-workspace-id"] = workspaceId();
  const response = await fetch(`${baseUrl()}/v1/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: model(),
      max_tokens: maxTokens(),
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: documentPrompt }]
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "The AI provider request failed.");
  if (data?.stop_reason === "max_tokens") throw new Error(`The AI provider's response was truncated at ${maxTokens()} tokens before finishing the JSON. Increase AI_PROVIDER_MAX_TOKENS in config.properties or shorten the document prompt.`);
  const text = firstTextBlock(data?.content);
  if (!text) throw new Error(`The AI provider returned no text content (stop_reason: ${data?.stop_reason || "unknown"}, content block types: ${(data?.content || []).map((block) => block?.type).join(", ") || "none"}).`);
  return extractJson(text);
}

// End-to-end: document_prompt -> AI provider JSON -> styled .docx buffer. `context` (department,
// standardRef) comes from the seed document, when the job was generated from one - see
// styledDocxRenderer.js for how it's used in the header/footer/title block.
export async function generateTemplateDocx(documentPrompt, context = {}) {
  const template = await callAiProvider(documentPrompt);
  const buffer = await buildStyledDocx(template, context);
  return { template, buffer };
}
