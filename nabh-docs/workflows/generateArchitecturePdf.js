import { readFile, writeFile, mkdir } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

async function generatePdf() {
  const mdPath = path.join(rootDir, "docs", "CLOUDFLARE_DEPLOYMENT.md");
  const mdContent = await readFile(mdPath, "utf8");

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>NABH Workflow & Docs - Cloudflare & PostgreSQL Architecture</title>
<style>
  @page {
    size: A4;
    margin: 20mm 15mm 20mm 15mm;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #1e293b;
    line-height: 1.6;
    font-size: 11pt;
    margin: 0;
    padding: 0;
  }
  .header-banner {
    background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
    color: #ffffff;
    padding: 24px 32px;
    border-radius: 8px;
    margin-bottom: 28px;
  }
  .header-banner h1 {
    margin: 0 0 6px 0;
    font-size: 22pt;
    font-weight: 700;
    letter-spacing: -0.5px;
  }
  .header-banner p {
    margin: 0;
    font-size: 11pt;
    opacity: 0.9;
  }
  .doc-meta {
    display: flex;
    justify-content: space-between;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 9.5pt;
    color: #64748b;
    margin-bottom: 24px;
  }
  h2 {
    color: #0f172a;
    font-size: 15pt;
    font-weight: 700;
    border-bottom: 2px solid #3b82f6;
    padding-bottom: 6px;
    margin-top: 28px;
    margin-bottom: 14px;
    page-break-after: avoid;
  }
  h3 {
    color: #1e3a8a;
    font-size: 12.5pt;
    font-weight: 600;
    margin-top: 20px;
    margin-bottom: 10px;
    page-break-after: avoid;
  }
  p, li {
    color: #334155;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 10pt;
    page-break-inside: avoid;
  }
  th {
    background: #f1f5f9;
    color: #0f172a;
    font-weight: 700;
    text-align: left;
    padding: 10px 12px;
    border: 1px solid #cbd5e1;
  }
  td {
    padding: 9px 12px;
    border: 1px solid #e2e8f0;
    vertical-align: top;
  }
  tr:nth-child(even) td {
    background: #f8fafc;
  }
  pre, code {
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
  }
  code {
    background: #f1f5f9;
    color: #2563eb;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 9.5pt;
  }
  pre {
    background: #0f172a;
    color: #f8fafc;
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 9.5pt;
    line-height: 1.45;
    page-break-inside: avoid;
    white-space: pre-wrap;
    word-break: break-all;
  }
  pre code {
    background: transparent;
    color: inherit;
    padding: 0;
  }
  .mermaid-box {
    background: #f8fafc;
    border: 1px dashed #cbd5e1;
    padding: 16px;
    border-radius: 8px;
    margin: 16px 0;
    font-family: monospace;
    font-size: 9pt;
    color: #334155;
    page-break-inside: avoid;
  }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 8.5pt;
    font-weight: 600;
    text-transform: uppercase;
  }
  .badge-primary { background: #dbeafe; color: #1e40af; }
  .badge-success { background: #dcfce7; color: #166534; }
  .footer {
    margin-top: 40px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    font-size: 8.5pt;
    color: #94a3b8;
    display: flex;
    justify-content: space-between;
  }
</style>
</head>
<body>

<div class="header-banner">
  <h1>NABH Workflow & Governance Workspace</h1>
  <p>Cloudflare + PostgreSQL Enterprise Architecture & Production Design Specification</p>
</div>

<div class="doc-meta">
  <span><strong>Author:</strong> NABH Architecture Team</span>
  <span><strong>Target Platform:</strong> Cloudflare Workers + R2 + Hyperdrive + PostgreSQL</span>
  <span><strong>Date:</strong> ${new Date().toISOString().slice(0, 10)}</span>
  <span><strong>Status:</strong> Approved Architecture Spec</span>
</div>

${markdownToHtml(mdContent)}

<div class="footer">
  <span>NABH Docs & Governance System Specification</span>
  <span>Confidential - Internal Deployment Blueprint</span>
</div>

</body>
</html>`;

  const tempHtmlPath = path.join(rootDir, "docs", "CLOUDFLARE_POSTGRESQL_ARCHITECTURE.html");
  const outputPdfPath = path.join(rootDir, "docs", "CLOUDFLARE_POSTGRESQL_ARCHITECTURE.pdf");
  const outputCopyPdfPath = path.join(rootDir, "output", "Cloudflare_PostgreSQL_Architecture_Design.pdf");

  await writeFile(tempHtmlPath, htmlContent, "utf8");
  console.log(`HTML generated at ${tempHtmlPath}`);

  try {
    await execFileAsync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", path.join(rootDir, "docs"), tempHtmlPath]);
    console.log(`PDF created successfully at ${outputPdfPath}`);

    await mkdir(path.join(rootDir, "output"), { recursive: true });
    await writeFile(outputCopyPdfPath, await readFile(outputPdfPath));
    console.log(`PDF copy saved to ${outputCopyPdfPath}`);
  } catch (err) {
    console.error("Error converting HTML to PDF via LibreOffice:", err);
  }
}

function markdownToHtml(md) {
  let html = md;

  // Escape HTML tags except code blocks
  html = html.replace(/```(mermaid|sql|jsonc|typescript|toml|text|bash)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    if (lang === "mermaid") {
      return `<div class="mermaid-box"><strong>Diagram (${lang}):</strong><pre>${escaped}</pre></div>`;
    }
    return `<pre><code>${escaped}</code></pre>`;
  });

  // Convert headers
  html = html.replace(/^# (.*$)/gim, '<h1 style="display:none;">$1</h1>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^---$/gim, '<hr style="border:0; border-top:1px solid #e2e8f0; margin:24px 0;" />');

  // Convert lists
  html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Convert tables
  html = html.replace(/\|(.+)\|/g, (match) => {
    const cells = match.split("|").slice(1, -1).map(c => c.trim());
    if (cells.every(c => c.startsWith("---"))) return ""; // Header separator line
    return `<tr>${cells.map(c => `<td>${c}</td>`).join("")}</tr>`;
  });
  html = html.replace(/(<tr>.*<\/tr>\n?)+/g, (match) => {
    const rows = match.trim().split("\n");
    if (rows.length === 0) return "";
    const firstRow = rows[0].replace(/<td>/g, "<th>").replace(/<\/td>/g, "</th>");
    const restRows = rows.slice(1).join("\n");
    return `<table><thead>${firstRow}</thead><tbody>${restRows}</tbody></table>`;
  });

  // Convert inline markdown formatting
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Convert paragraphs
  html = html.split("\n\n").map(p => {
    const trimmed = p.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("<h") || trimmed.startsWith("<table") || trimmed.startsWith("<pre") || trimmed.startsWith("<div") || trimmed.startsWith("<ul") || trimmed.startsWith("<hr")) {
      return trimmed;
    }
    return `<p>${trimmed}</p>`;
  }).join("\n");

  return html;
}

generatePdf();
