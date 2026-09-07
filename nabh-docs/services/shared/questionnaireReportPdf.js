import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getHospitalLogoBuffer } from "./documentCustomizer.js";

const colors = {
  ink: rgb(0.16, 0.18, 0.28),
  muted: rgb(0.42, 0.45, 0.54),
  accent: rgb(0.05, 0.43, 0.60),
  line: rgb(0.86, 0.88, 0.92),
  soft: rgb(0.96, 0.97, 0.99)
};

function wrapText(text, font, size, maxWidth) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function createQuestionnaireReportPdf({ hospital, documentName, programme, questions, answers, generatedAt }) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize = [595.28, 841.89];
  const margin = 48;
  const contentWidth = pageSize[0] - margin * 2;
  let page;
  let y;

  async function newPage() {
    page = pdf.addPage(pageSize);
    y = pageSize[1] - margin;
    page.drawLine({ start: { x: margin, y: y - 9 }, end: { x: pageSize[0] - margin, y: y - 9 }, thickness: 1, color: colors.line });
    y -= 28;
  }

  function ensure(height) {
    if (y - height < margin) return newPage();
    return Promise.resolve();
  }

  await newPage();
  const logo = await getHospitalLogoBuffer(hospital, "png");
  if (logo?.buffer) {
    try {
      const image = await pdf.embedPng(logo.buffer);
      const scale = Math.min(70 / image.width, 48 / image.height);
      page.drawImage(image, { x: margin, y: y - image.height * scale, width: image.width * scale, height: image.height * scale });
    } catch { /* continue without an incompatible logo */ }
  }
  page.drawText("HOSPITAL QUESTIONNAIRE REPORT", { x: margin + 86, y: y - 7, size: 9, font: bold, color: colors.accent });
  page.drawText(hospital.name || "Hospital", { x: margin + 86, y: y - 28, size: 19, font: bold, color: colors.ink });
  page.drawText(`Hospital code: ${hospital.code || "-"}`, { x: margin + 86, y: y - 45, size: 9, font: regular, color: colors.muted });
  y -= 78;
  page.drawText(documentName || "Personalized document", { x: margin, y, size: 17, font: bold, color: colors.ink });
  y -= 24;
  page.drawText(`Programme: ${programme || "-"}`, { x: margin, y, size: 10, font: regular, color: colors.muted });
  page.drawText(`Generated: ${new Date(generatedAt || Date.now()).toLocaleString()}`, { x: pageSize[0] - margin - 190, y, size: 9, font: regular, color: colors.muted });
  y -= 30;
  page.drawRectangle({ x: margin, y: y - 33, width: contentWidth, height: 34, color: colors.soft });
  page.drawText("Submitted hospital-specific responses", { x: margin + 12, y: y - 21, size: 10, font: bold, color: colors.accent });
  y -= 58;

  for (const [index, question] of (questions || []).entries()) {
    const answer = answers?.[question.id];
    const answerText = Array.isArray(answer) ? answer.join(", ") : String(answer || "Not answered");
    const questionLines = wrapText(`${index + 1}. ${question.label}`, bold, 10.5, contentWidth - 24);
    const answerLines = wrapText(answerText, regular, 10, contentWidth - 30);
    const blockHeight = 20 + questionLines.length * 14 + 12 + answerLines.length * 14 + 18;
    await ensure(blockHeight);
    page.drawRectangle({ x: margin, y: y - blockHeight + 7, width: contentWidth, height: blockHeight, borderColor: colors.line, borderWidth: 0.7, color: rgb(1, 1, 1) });
    let blockY = y - 14;
    for (const line of questionLines) { page.drawText(line, { x: margin + 12, y: blockY, size: 10.5, font: bold, color: colors.ink }); blockY -= 14; }
    blockY -= 5;
    for (const line of answerLines) { page.drawText(line, { x: margin + 15, y: blockY, size: 10, font: regular, color: answerText === "Not answered" ? colors.muted : colors.ink }); blockY -= 14; }
    y -= blockHeight + 12;
  }

  for (const reportPage of pdf.getPages()) {
    reportPage.drawText("NABH Readiness System", { x: margin, y: 24, size: 8, font: regular, color: colors.muted });
    reportPage.drawText(`Page ${pdf.getPages().indexOf(reportPage) + 1} of ${pdf.getPages().length}`, { x: pageSize[0] - margin - 70, y: 24, size: 8, font: regular, color: colors.muted });
  }
  return Buffer.from(await pdf.save());
}

export async function createHospitalQuestionnaireReportPdf({ hospital, documents }) {
  const output = await PDFDocument.create();
  for (const document of documents) {
    const single = await createQuestionnaireReportPdf({ hospital, ...document });
    const source = await PDFDocument.load(single);
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  if (!documents.length) {
    const page = output.addPage([595.28, 841.89]);
    page.drawText("No questionnaire data has been configured for this hospital.", { x: 48, y: 780, size: 14, font: await output.embedFont(StandardFonts.Helvetica), color: colors.ink });
  }
  return Buffer.from(await output.save());
}

export async function createTemplateQuestionnaireReportPdf({ documents }) {
  return createHospitalQuestionnaireReportPdf({ hospital: { name: "NABH Readiness System", code: "TEMPLATE-LIBRARY" }, documents });
}
