import fs from "fs/promises";
import { fileURLToPath } from "url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { HOSPITAL_PRE_REGISTRATION_DOCUMENT_ID } from "../shared/documentIds.js";
import { getTemplate } from "../shared/googleDriveTemplateService.js";
import { fillTemplate } from "../shared/templateFillService.js";

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

export async function createHospitalPreRegistrationPDFLegacy(data) {
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
  text(page, bold, "HOSPITAL PRE-REGISTRATION FORM", 175, 737, 14, rgb(1, 1, 1));
  text(page, regular, `Document ID: ${HOSPITAL_PRE_REGISTRATION_DOCUMENT_ID}  |  Version: 1.0  |  Effective Date: 01-10-2026`, 155, 716, 8.5, rgb(0.38, 0.46, 0.57));

  section(page, bold, 1, "PATIENT DEMOGRAPHICS", 690);
  page.drawRectangle({ x: 45, y: 502, width: 505, height: 178, color: paleGray, borderColor: lightGray, borderWidth: 0.6 });
  line(page, 298, 562, 298, 680);
  line(page, 45, 638, 550, 638);
  line(page, 45, 600, 550, 600);
  line(page, 45, 562, 550, 562);
  field(page, regular, bold, "Full Name", data.fullName, 57, 663, 220);
  text(page, bold, "Gender", 310, 663, 8.5);
  checkbox(page, regular, 310, 647, "M", data.gender === "Male");
  checkbox(page, regular, 350, 647, "F", data.gender === "Female");
  checkbox(page, regular, 390, 647, "O", data.gender === "Other");
  field(page, regular, bold, "Date of Birth", data.dateOfBirth, 57, 625, 220);
  field(page, regular, bold, "Aadhar / Passport", data.idNumber, 310, 625, 220);
  field(page, regular, bold, "Contact Number", data.contactNumber, 57, 587, 220);
  field(page, regular, bold, "Email Address", data.emailAddress, 310, 587, 220);
  text(page, bold, "Permanent Address", 57, 545, 8.5);
  wrappedText(page, regular, data.permanentAddress, 57, 529, 490, 9);

  section(page, bold, 2, "CLINICAL ADMISSION DETAILS", 478);
  page.drawRectangle({ x: 45, y: 382, width: 505, height: 86, color: paleGray, borderColor: lightGray, borderWidth: 0.6 });
  line(page, 298, 413, 298, 468);
  line(page, 45, 426, 550, 426);
  field(page, regular, bold, "Admitting Doctor", data.admittingDoctor, 57, 451, 220);
  field(page, regular, bold, "Department", data.department, 310, 451, 220);
  field(page, regular, bold, "Proposed Date", data.proposedDate, 57, 413, 220);
  text(page, bold, "Stay Type", 310, 413, 8.5);
  checkbox(page, regular, 310, 397, "Daycare", data.stayType === "Daycare");
  checkbox(page, regular, 390, 397, "Inpatient (IPD)", data.stayType === "Inpatient (IPD)");

  section(page, bold, 3, "INSURANCE / TPA DETAILS", 364);
  page.drawRectangle({ x: 45, y: 214, width: 505, height: 140, color: paleGray, borderColor: lightGray, borderWidth: 0.6 });
  line(page, 298, 214, 298, 306);
  line(page, 45, 306, 550, 306);
  line(page, 45, 260, 550, 260);
  text(page, bold, "Payment Mode", 57, 339, 8.5);
  checkbox(page, regular, 57, 323, "Cash / Self-Pay", data.paymentMode === "Cash / Self-Pay");
  checkbox(page, regular, 175, 323, "Insurance / TPA", data.paymentMode === "Insurance / TPA");
  checkbox(page, regular, 300, 323, "Corporate Panel", data.paymentMode === "Corporate Panel");
  field(page, regular, bold, "Insurance Company", data.insuranceCompany, 57, 285, 220);
  field(page, regular, bold, "TPA Name", data.tpaName, 310, 285, 220);
  field(page, regular, bold, "Policy / Corporate ID", data.policyId, 57, 247, 220);
  text(page, bold, "Pre-Auth Status", 310, 247, 8.5);
  checkbox(page, regular, 310, 231, "Initiated", data.preAuthStatus === "Initiated");
  checkbox(page, regular, 390, 231, "Pending", data.preAuthStatus === "Pending");
  checkbox(page, regular, 460, 231, "N/A", data.preAuthStatus === "N/A");

  section(page, bold, 4, "EMERGENCY CONTACT / NEXT OF KIN", 200);
  page.drawRectangle({ x: 45, y: 105, width: 505, height: 85, color: paleGray, borderColor: lightGray, borderWidth: 0.6 });
  line(page, 298, 135, 298, 190);
  line(page, 45, 148, 550, 148);
  field(page, regular, bold, "Contact Name", data.emergencyContactName, 57, 173, 220);
  field(page, regular, bold, "Relationship", data.relationship, 310, 173, 220);
  field(page, regular, bold, "Contact Phone 1", data.contactPhone1, 57, 135, 220);
  field(page, regular, bold, "Contact Phone 2", data.contactPhone2, 310, 135, 220);

  section(page, bold, 5, "ACKNOWLEDGEMENT AND DECLARATION", 96);
  text(page, italic, "1. I hereby declare that the information provided above is true and accurate to the best of my knowledge.", 45, 76, 8, charcoal);
  text(page, italic, "2. I agree to comply with the hospital rules, room rent limitations, and billing guidelines.", 45, 66, 8, charcoal);
  text(page, italic, "3. For cashless treatment: pre-authorization approval is subject to insurance/TPA terms; I undertake to clear all", 45, 56, 8, charcoal);
  text(page, italic, "non-payable or denied amounts at the time of discharge.", 45, 46, 8, charcoal);

  line(page, 55, 29, 250, 29, charcoal, 0.7);
  line(page, 345, 29, 540, 29, charcoal, 0.7);
  text(page, bold, "Signature of Patient / Next of Kin", 75, 19, 7.5);
  text(page, bold, "Hospital Admissions Officer Sign & Date", 355, 19, 7.5);
  text(page, regular, "Template document - complete hospital identity, logo, and version control fields before clinical use.", 105, 9, 5.8, rgb(0.48, 0.48, 0.48));
  text(page, regular, "CONFIDENTIAL - MEDICAL RECORD DOCUMENT - PREVENT LOSS", 160, 1, 6.5, rgb(0.5, 0.5, 0.5));

  return pdf.save();
}

async function readLocalDevTemplate() {
  try {
    return await fs.readFile(fileURLToPath(new URL("../../templates/hospital-pre-registration/fillable-template.pdf", import.meta.url)));
  } catch {
    return null;
  }
}

/**
 * Prefers a fillable template (Google Drive, or a local dev copy at
 * templates/hospital-pre-registration/fillable-template.pdf) so the visual design can be
 * updated by the business team without a code change. Falls back to the hardcoded renderer
 * when no template is available (e.g. local dev without Drive credentials configured).
 */
export async function createHospitalPreRegistrationPDF(data) {
  const templateBytes =
    (await getTemplate(process.env.GOOGLE_DRIVE_HOSPITAL_PRE_REGISTRATION_TEMPLATE_ID)) ||
    (await readLocalDevTemplate());

  if (templateBytes) {
    return fillTemplate(templateBytes, data);
  }

  return createHospitalPreRegistrationPDFLegacy(data);
}

