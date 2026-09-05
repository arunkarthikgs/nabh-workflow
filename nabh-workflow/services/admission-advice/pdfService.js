import fs from "fs/promises";
import { fileURLToPath } from "url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ADMISSION_ADVICE_DOCUMENT_ID } from "../shared/documentIds.js";

const green = rgb(0.02, 0.43, 0.29);
const charcoal = rgb(0.18, 0.18, 0.18);
const lightGray = rgb(0.83, 0.83, 0.83);
const paleGray = rgb(0.97, 0.97, 0.97);

function text(page, font, value, x, y, size = 10, color = charcoal) {
  page.drawText(String(value || ""), { x, y, size, font, color });
}

function line(page, x1, y1, x2, y2, color = lightGray, thickness = 0.6) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness });
}

function checkbox(page, font, x, y, label, checked) {
  page.drawRectangle({ x, y, width: 10, height: 10, borderColor: charcoal, borderWidth: 0.7 });
  if (checked) text(page, font, "X", x + 2, y + 1, 8, green);
  text(page, font, label, x + 15, y + 1, 9);
}

function field(page, regularFont, boldFont, label, value, x, y, width) {
  text(page, boldFont, label, x, y, 8.5);
  line(page, x, y - 22, x + width, y - 22, lightGray, 0.6);
  text(page, regularFont, value, x, y - 18, 9.5);
}

function compactField(page, regularFont, boldFont, label, value, x, y, width) {
  text(page, boldFont, label, x, y, 8.5);
  text(page, regularFont, value, x, y - 13, 9.5);
  line(page, x, y - 16, x + width, y - 16, lightGray, 0.6);
}

function section(page, boldFont, number, label, y) {
  page.drawRectangle({ x: 45, y: y - 5, width: 505, height: 24, color: charcoal });
  page.drawCircle({ x: 59, y: y + 7, size: 8, color: green });
  text(page, boldFont, String(number), 56.5, y + 3.5, 8, rgb(1, 1, 1));
  text(page, boldFont, label, 72, y + 3, 11, rgb(1, 1, 1));
}

function wrappedText(page, font, value, x, y, width, size = 9, leading = 14) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  let currentLine = "";
  let currentY = y;
  for (const word of words) {
    const proposed = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(proposed, size) > width && currentLine) {
      text(page, font, currentLine, x, currentY, size);
      currentLine = word;
      currentY -= leading;
    } else {
      currentLine = proposed;
    }
  }
  if (currentLine) text(page, font, currentLine, x, currentY, size);
}

async function drawLogo(pdf, page) {
  for (const candidate of [new URL("../../logo.png", import.meta.url), new URL("../../logo.jpg", import.meta.url)]) {
    try {
      const path = fileURLToPath(candidate);
      const bytes = await fs.readFile(path);
      const image = path.endsWith(".png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      page.drawImage(image, { x: 50, y: 764, width: 45, height: 45 });
      return;
    } catch {
      // Try next logo format.
    }
  }
}

export async function createAdmissionAdvicePDF(data) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  await drawLogo(pdf, page);
  text(page, bold, "Shippu Hospital", 215, 794, 20, green);
  text(page, italic, "Quality Management Systems Compliance Framework - NABH Entry-Level v2", 160, 778, 9, charcoal);
  line(page, 45, 762, 550, 762, green, 2);
  page.drawRectangle({ x: 45, y: 730, width: 505, height: 24, color: green });
  text(page, bold, "ADMISSION ADVICE NOTE (AAC CHAPTER)", 164, 737, 14, rgb(1, 1, 1));
  text(page, regular, `Document ID: ${ADMISSION_ADVICE_DOCUMENT_ID}  |  Version: 1.0  |  Effective Date: 01-10-2026`, 145, 716, 8.5, rgb(0.38, 0.46, 0.57));

  section(page, bold, 1, "PATIENT IDENTIFICATION & TRACKING", 690);
  page.drawRectangle({ x: 45, y: 524, width: 505, height: 156, color: paleGray, borderColor: lightGray, borderWidth: 0.6 });
  line(page, 298, 524, 298, 680);
  for (const y of [638, 596]) line(page, 45, y, 550, y);
  field(page, regular, bold, "Patient Full Name", data.patientFullName, 57, 663, 220);
  field(page, regular, bold, "UHID (Unique Health ID)", data.uhid, 310, 663, 220);
  field(page, regular, bold, "Age", data.age, 57, 621, 65);
  text(page, bold, "Biological Gender", 140, 621, 8.5);
  checkbox(page, regular, 140, 604, "M", data.biologicalGender === "M");
  checkbox(page, regular, 180, 604, "F", data.biologicalGender === "F");
  field(page, regular, bold, "Date & Time of Advice", `${data.dateOfAdvice || ""}  ${data.timeOfAdvice || ""}`, 310, 621, 220);
  field(page, regular, bold, "Admitting Department", data.admittingDepartment, 57, 579, 220);
  field(page, regular, bold, "Attending Consultant", data.attendingConsultant, 310, 579, 220);
  text(page, bold, "Source", 57, 549, 8.5);
  checkbox(page, regular, 57, 537, "OPD", data.source === "OPD");
  checkbox(page, regular, 105, 537, "Emergency / ER", data.source === "Emergency / ER");
  checkbox(page, regular, 205, 537, "Day Care", data.source === "Day Care");
  compactField(page, regular, bold, "Contact Number", data.contactNumber, 310, 548, 220);

  section(page, bold, 2, "CLINICAL ASSESSMENT & DIAGNOSIS", 505);
  text(page, bold, "Provisional Diagnosis / Reason for Admission", 45, 480, 9);
  line(page, 45, 462, 550, 462);
  wrappedText(page, regular, data.provisionalDiagnosis, 50, 468, 490, 9);
  text(page, bold, "Brief Presenting Complaints & Clinical Status", 45, 435, 9);
  line(page, 45, 417, 550, 417);
  line(page, 45, 397, 550, 397);
  wrappedText(page, regular, data.clinicalStatus, 50, 423, 490, 9);

  section(page, bold, 3, "IMMEDIATE ROUTING & WARD DIRECTIVES", 367);
  text(page, bold, "Priority Status", 45, 345, 8.5);
  checkbox(page, regular, 120, 337, "Routine / Planned Admission", data.priorityStatus === "Routine / Planned Admission");
  checkbox(page, regular, 300, 337, "Urgent / Emergency Admission", data.priorityStatus === "Urgent / Emergency Admission");
  text(page, bold, "Assigned Ward", 45, 321, 8.5);
  ["General", "Semi-Private", "Private Room", "ICU / ICCU", "Day Care"].forEach((label, index) => {
    checkbox(page, regular, 120 + index * 82, 313, label, data.assignedWard === label);
  });
  text(page, bold, "Mandatory Safety Precautions", 45, 297, 8.5);
  ["Fall Risk", "Isolation Needed", "Vulnerable Patient", "None"].forEach((label, index) => {
    checkbox(page, regular, 180 + index * 88, 289, label, data.safetyPrecautions?.includes(label));
  });

  section(page, bold, 4, "STAT CLINICAL ORDERS (PRE-BED ASSIGNMENT)", 262);
  text(page, bold, "Vitals Monitoring Frequency", 45, 240, 8.5);
  ["Continuous", "Every 1 Hour", "Every 4 Hours", "Stable Routine"].forEach((label, index) => {
    checkbox(page, regular, 175 + index * 95, 232, label, data.vitalsMonitoringFrequency === label);
  });
  text(page, bold, "Dietary Directive", 45, 216, 8.5);
  ["NPO (Fasting)", "Soft Diet", "Regular Diet", "Diabetic Diet"].forEach((label, index) => {
    checkbox(page, regular, 125 + index * 90, 208, label, data.dietaryDirective === label);
  });
  text(page, bold, "Urgent Investigations Needed (STAT)", 45, 184, 8.5);
  line(page, 45, 168, 550, 168);
  text(page, regular, data.urgentInvestigations, 50, 172, 9);
  text(page, bold, "STAT Medications / Infusions", 45, 147, 8.5);
  line(page, 45, 131, 550, 131);
  text(page, regular, data.statMedications, 50, 135, 9);

  section(page, bold, 5, "FINANCIAL COUNSELING & ADMINISTRATIVE CLOSURE", 103);
  text(page, bold, "Expected Payment Pathway", 45, 81, 8.5);
  ["Self-Paying / Cash", "TPA / Insurance", "Corporate / Government (CGHS)"].forEach((label, index) => {
    checkbox(page, regular, 165 + index * 120, 73, label, data.expectedPaymentPathway === label);
  });
  text(page, bold, "Financial Counseling", 45, 55, 8.5);
  checkbox(page, regular, 150, 47, "Yes", data.financialCounselingCompleted === "Yes");
  checkbox(page, regular, 195, 47, "No", data.financialCounselingCompleted === "No");
  text(page, bold, "Estimated Treatment Cost: Rs.", 270, 55, 8.5);
  line(page, 410, 48, 545, 48);
  text(page, regular, data.estimatedTreatmentCost, 413, 52, 9);

  line(page, 55, 31, 250, 31, charcoal, 0.7);
  line(page, 345, 31, 540, 31, charcoal, 0.7);
  text(page, bold, "Signature / Thumb Impression of Patient/Kin", 75, 21, 7.5);
  text(page, bold, "Doctor Stamp & Signature (with Reg No.)", 360, 21, 7.5);
  text(page, regular, "Template document - complete hospital identity, logo, and version control fields before clinical use.", 105, 11, 5.8, rgb(0.48, 0.48, 0.48));
  text(page, regular, "CONFIDENTIAL - MEDICAL RECORD DOCUMENT - PREVENT LOSS", 160, 3, 6.5, rgb(0.5, 0.5, 0.5));

  return pdf.save();
}
