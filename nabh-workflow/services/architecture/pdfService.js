import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const green = rgb(0.02, 0.43, 0.29);
const charcoal = rgb(0.16, 0.18, 0.18);
const gray = rgb(0.42, 0.45, 0.45);
const lightGreen = rgb(0.91, 0.96, 0.93);
const blue = rgb(0.08, 0.32, 0.48);
const lightBlue = rgb(0.91, 0.95, 0.98);

function drawText(page, font, value, x, y, size, color = charcoal) {
  page.drawText(value, { x, y, size, font, color });
}

function wrap(font, value, size, width) {
  const lines = [];
  let line = "";

  for (const word of value.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function addHeader(page, bold, title, pageNumber) {
  page.drawRectangle({ x: 42, y: 776, width: 511, height: 28, color: green });
  drawText(page, bold, "NABH DOCUMENT WORKFLOWS", 56, 786, 12, rgb(1, 1, 1));
  drawText(page, bold, title, 42, 748, 16, green);
  drawText(page, bold, `Page ${pageNumber}`, 508, 786, 8, rgb(1, 1, 1));
}

function drawArrow(page, x1, y1, x2, y2, color = gray) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness: 1.2 });
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headSize = 5;
  page.drawLine({
    start: { x: x2, y: y2 },
    end: { x: x2 - headSize * Math.cos(angle - Math.PI / 6), y: y2 - headSize * Math.sin(angle - Math.PI / 6) },
    color,
    thickness: 1.2
  });
  page.drawLine({
    start: { x: x2, y: y2 },
    end: { x: x2 - headSize * Math.cos(angle + Math.PI / 6), y: y2 - headSize * Math.sin(angle + Math.PI / 6) },
    color,
    thickness: 1.2
  });
}

function drawNode(page, regular, bold, label, x, y, width, color = green) {
  page.drawRectangle({ x, y, width, height: 32, color: rgb(1, 1, 1), borderColor: color, borderWidth: 1.1 });
  const lines = label.split("\n");
  lines.forEach((line, index) => {
    const font = index === 0 ? bold : regular;
    const size = index === 0 ? 8.5 : 7.5;
    const textWidth = font.widthOfTextAtSize(line, size);
    drawText(page, font, line, x + (width - textWidth) / 2, y + 19 - index * 10, size, color);
  });
}

function drawSystemDiagram(page, regular, bold) {
  drawText(page, bold, "System Flow", 50, 628, 11, green);
  drawNode(page, regular, bold, "INPUT FILES\nText or JSON", 55, 570, 100);
  drawNode(page, regular, bold, "WORKFLOWS\nCLI commands", 205, 570, 100, blue);
  drawNode(page, regular, bold, "SERVICES\nPDF and file I/O", 355, 570, 100, blue);
  drawNode(page, regular, bold, "OUTPUTS\nPDF and audit log", 205, 510, 100);
  drawArrow(page, 155, 586, 205, 586);
  drawArrow(page, 305, 586, 355, 586);
  drawArrow(page, 405, 570, 285, 542);
  drawArrow(page, 255, 570, 255, 542);
}

function drawComplaintDiagram(page, regular, bold) {
  drawText(page, bold, "Complaint Data Pipeline", 50, 704, 11, green);
  const nodes = [
    ["INTAKE", 45, 646], ["EXTRACTION", 170, 646], ["COMPLIANCE", 295, 646], ["VALIDATION", 420, 646],
    ["PDF", 150, 576], ["AUDIT", 335, 576]
  ];
  nodes.forEach(([label, x, y]) => drawNode(page, regular, bold, label, x, y, 95));
  drawArrow(page, 140, 662, 170, 662);
  drawArrow(page, 265, 662, 295, 662);
  drawArrow(page, 390, 662, 420, 662);
  drawArrow(page, 467, 646, 197, 608);
  drawArrow(page, 245, 592, 335, 592);
}

function drawAdmissionDiagram(page, regular, bold) {
  drawText(page, bold, "Admission Advice Flow", 50, 704, 11, green);
  drawNode(page, regular, bold, "ADMISSION JSON\nPatient record", 55, 640, 125);
  drawNode(page, regular, bold, "WORKFLOW\nRead input", 235, 640, 125, blue);
  drawNode(page, regular, bold, "PDF SERVICE\nRender form", 415, 640, 125, blue);
  drawNode(page, regular, bold, "ADMISSION ADVICE NOTE\nOne-page PDF", 235, 574, 125);
  drawArrow(page, 180, 656, 235, 656);
  drawArrow(page, 360, 656, 415, 656);
  drawArrow(page, 477, 640, 297, 606);
}

function addSection(page, regular, bold, heading, items, startY) {
  let y = startY;
  drawText(page, bold, heading, 50, y, 11, green);
  y -= 19;

  for (const item of items) {
    const lines = wrap(regular, item, 9.5, 465);
    page.drawCircle({ x: 55, y: y + 3, size: 2.2, color: green });
    lines.forEach((line, index) => drawText(page, regular, line, 66, y - index * 13, 9.5));
    y -= lines.length * 13 + 8;
  }

  return y;
}

export async function createArchitecturePDF() {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const overview = pdf.addPage([595, 842]);
  addHeader(overview, bold, "Architecture Overview", 1);
  overview.drawRectangle({ x: 42, y: 650, width: 511, height: 68, color: lightGreen });
  drawText(overview, bold, "Purpose", 58, 694, 10, green);
  drawText(overview, regular, "A local Node.js workflow for producing NABH-aligned Complaint Forms", 58, 676, 10);
  drawText(overview, regular, "and Admission Advice Notes from structured or plain-text input files.", 58, 662, 10);
  drawSystemDiagram(overview, regular, bold);

  let y = addSection(overview, regular, bold, "Technology", [
    "Node.js runs standalone command-line workflows. The project uses ECMAScript modules via the package type setting.",
    "pdf-lib is the sole external dependency and renders PDFs directly in JavaScript using standard fonts, text, lines, panels, and checkboxes.",
    "JSON supplies structured document data; the Complaint workflow can also accept colon-delimited text input.",
    "The system is file-based. It has no database, HTTP API, authentication layer, or external AI integration."
  ], 468);

  addSection(overview, regular, bold, "Project Layout", [
    "workflows/: command-line orchestration for complaint, interactive complaint, admission-advice, and architecture document generation.",
    "agents/: focused complaint pipeline stages for intake, extraction, compliance, validation, PDF handoff, and audit logging.",
    "services/: shared file and logging utilities plus independent PDF renderers for each document type.",
    "templates/, models/, sample/, and inputs/: input contracts, schema, examples, and saved records."
  ], y - 12);

  const complaint = pdf.addPage([595, 842]);
  addHeader(complaint, bold, "Complaint Processing Pipeline", 2);
  drawComplaintDiagram(complaint, regular, bold);

  y = addSection(complaint, regular, bold, "Pipeline Stages", [
    "Intake reads the supplied file as text through the shared file service.",
    "Extraction accepts JSON directly or maps Label: Value text lines into the complaint record shape.",
    "Compliance applies complaintSchema.json as the canonical field list. Missing required values become NOT PROVIDED, while selected optional values remain blank.",
    "Validation returns an isValid flag and the list of fields that remain NOT PROVIDED.",
    "PDF delegates to the Complaint PDF service, which renders the NABH complaint form.",
    "Audit writes the complaint ID, patient name, complaint date, and closure status to the console log."
  ], 530);

  addSection(complaint, regular, bold, "Outputs", [
    "The complete complaint workflow creates Complaint_NABH.pdf and its two existing variant filenames in the project root.",
    "Individual agents may be run with npm run agent:<name> to inspect their intermediate console output."
  ], y - 14);

  const admission = pdf.addPage([595, 842]);
  addHeader(admission, bold, "Admission Advice and Commands", 3);
  drawAdmissionDiagram(admission, regular, bold);
  y = addSection(admission, regular, bold, "Admission Advice Flow", [
    "The admission-advice workflow reads an admission JSON record and passes it directly to its PDF service; it does not use the complaint agents.",
    "The renderer produces a one-page note with patient identification, clinical assessment, routing and ward directives, STAT orders, and financial counseling fields.",
    "Checkboxes are selected by matching JSON values such as source, priority status, ward, safety precautions, monitoring frequency, diet, and payment pathway.",
    "Long clinical values are wrapped to fit the designed form layout."
  ], 530);

  addSection(admission, regular, bold, "Primary Commands", [
    "npm run complaint - process the default complaint sample and generate complaint PDFs.",
    "npm run complaint -- ./path/to/complaint.json - process a specific complaint input file.",
    "npm run complaint:interactive - collect complaint data interactively.",
    "npm run admission-advice - generate a populated admission note from the sample admission JSON.",
    "npm run admission-advice -- ./my-admission.json ./My_Admission_Advice.pdf - generate a named PDF from custom data.",
    "npm run architecture - regenerate this architecture document."
  ], y - 16);

  drawText(admission, regular, "Generated locally from the project implementation.", 42, 28, 8, gray);
  return pdf.save();
}