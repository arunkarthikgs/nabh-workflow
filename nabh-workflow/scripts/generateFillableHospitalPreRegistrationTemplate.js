// One-off script: generates a fillable AcroForm PDF matching the Hospital Pre-Registration
// layout, as a stand-in for a template designed by the business team and uploaded to Google Drive.
// Run: node scripts/generateFillableHospitalPreRegistrationTemplate.js
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { HOSPITAL_PRE_REGISTRATION_DOCUMENT_ID } from "../services/shared/documentIds.js";

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

function section(page, boldFont, number, label, y) {
  page.drawRectangle({ x: 45, y: y - 5, width: 505, height: 24, color: charcoal });
  page.drawCircle({ x: 59, y: y + 7, size: 8, color: green });
  text(page, boldFont, String(number), 56.5, y + 3.5, 8, rgb(1, 1, 1));
  text(page, boldFont, label, 72, y + 3, 11, rgb(1, 1, 1));
}

async function drawLogo(pdf, page) {
  try {
    const bytes = await fs.readFile(fileURLToPath(new URL("../logo.png", import.meta.url)));
    const image = await pdf.embedPng(bytes);
    page.drawImage(image, { x: 50, y: 764, width: 45, height: 45 });
  } catch {
    // Logo optional for the template.
  }
}

// Adds a single-line text form field at the same position/width the static field() helper
// would use for the underline, so the fillable widget visually replaces the value text.
function addTextField(form, page, font, name, x, y, width) {
  const field = form.createTextField(name);
  field.setText("");
  field.addToPage(page, { x, y: y - 22, width, height: 16, font, borderWidth: 0 });
}

async function build() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const form = pdf.getForm();

  await drawLogo(pdf, page);
  text(page, bold, "Shippu Hospital", 215, 794, 20, green);
  text(page, italic, "Quality Management Systems Compliance Framework - NABH Entry-Level v2", 160, 778, 9, charcoal);
  line(page, 45, 762, 550, 762, green, 2);
  page.drawRectangle({ x: 45, y: 730, width: 505, height: 24, color: green });
  text(page, bold, "HOSPITAL PRE-REGISTRATION FORM", 175, 737, 14, rgb(1, 1, 1));
  text(page, regular, `Document ID: ${HOSPITAL_PRE_REGISTRATION_DOCUMENT_ID}  |  Version: 1.0  |  Effective Date: 01-10-2026`, 155, 716, 8.5, rgb(0.38, 0.46, 0.57));

  section(page, bold, 1, "PATIENT DEMOGRAPHICS", 690);
  page.drawRectangle({ x: 45, y: 502, width: 505, height: 178, color: paleGray, borderColor: lightGray, borderWidth: 0.6 });
  line(page, 298, 565, 298, 680);
  line(page, 45, 646, 550, 646);
  line(page, 45, 608, 550, 608);
  line(page, 45, 565, 550, 565);
  text(page, bold, "Full Name", 57, 663, 8.5);
  addTextField(form, page, regular, "fullName", 57, 663, 220);
  text(page, bold, "Gender", 310, 663, 8.5);
  addTextField(form, page, regular, "gender", 310, 647, 220);
  text(page, bold, "Date of Birth", 57, 625, 8.5);
  addTextField(form, page, regular, "dateOfBirth", 57, 625, 220);
  text(page, bold, "Aadhar / Passport", 310, 625, 8.5);
  addTextField(form, page, regular, "idNumber", 310, 625, 220);
  text(page, bold, "Contact Number", 57, 587, 8.5);
  addTextField(form, page, regular, "contactNumber", 57, 587, 220);
  text(page, bold, "Email Address", 310, 587, 8.5);
  addTextField(form, page, regular, "emailAddress", 310, 587, 220);
  text(page, bold, "Permanent Address", 57, 545, 8.5);
  addTextField(form, page, regular, "permanentAddress", 57, 545, 490);

  section(page, bold, 2, "CLINICAL ADMISSION DETAILS", 478);
  page.drawRectangle({ x: 45, y: 382, width: 505, height: 86, color: paleGray, borderColor: lightGray, borderWidth: 0.6 });
  line(page, 298, 413, 298, 468);
  line(page, 45, 432, 550, 432);
  text(page, bold, "Admitting Doctor", 57, 451, 8.5);
  addTextField(form, page, regular, "admittingDoctor", 57, 451, 220);
  text(page, bold, "Department", 310, 451, 8.5);
  addTextField(form, page, regular, "department", 310, 451, 220);
  text(page, bold, "Proposed Date", 57, 413, 8.5);
  addTextField(form, page, regular, "proposedDate", 57, 413, 220);
  text(page, bold, "Stay Type", 310, 413, 8.5);
  addTextField(form, page, regular, "stayType", 310, 413, 220);

  section(page, bold, 3, "INSURANCE / TPA DETAILS", 364);
  page.drawRectangle({ x: 45, y: 214, width: 505, height: 140, color: paleGray, borderColor: lightGray, borderWidth: 0.6 });
  line(page, 298, 214, 298, 306);
  line(page, 45, 306, 550, 306);
  line(page, 45, 266, 550, 266);
  text(page, bold, "Payment Mode", 57, 339, 8.5);
  addTextField(form, page, regular, "paymentMode", 57, 323, 460);
  text(page, bold, "Insurance Company", 57, 285, 8.5);
  addTextField(form, page, regular, "insuranceCompany", 57, 285, 220);
  text(page, bold, "TPA Name", 310, 285, 8.5);
  addTextField(form, page, regular, "tpaName", 310, 285, 220);
  text(page, bold, "Policy / Corporate ID", 57, 247, 8.5);
  addTextField(form, page, regular, "policyId", 57, 247, 220);
  text(page, bold, "Pre-Auth Status", 310, 247, 8.5);
  addTextField(form, page, regular, "preAuthStatus", 310, 247, 220);

  section(page, bold, 4, "EMERGENCY CONTACT / NEXT OF KIN", 200);
  page.drawRectangle({ x: 45, y: 105, width: 505, height: 85, color: paleGray, borderColor: lightGray, borderWidth: 0.6 });
  line(page, 298, 135, 298, 190);
  line(page, 45, 154, 550, 154);
  text(page, bold, "Contact Name", 57, 173, 8.5);
  addTextField(form, page, regular, "emergencyContactName", 57, 173, 220);
  text(page, bold, "Relationship", 310, 173, 8.5);
  addTextField(form, page, regular, "relationship", 310, 173, 220);
  text(page, bold, "Contact Phone 1", 57, 135, 8.5);
  addTextField(form, page, regular, "contactPhone1", 57, 135, 220);
  text(page, bold, "Contact Phone 2", 310, 135, 8.5);
  addTextField(form, page, regular, "contactPhone2", 310, 135, 220);

  section(page, bold, 5, "ACKNOWLEDGEMENT AND DECLARATION", 96);
  text(page, italic, "1. I hereby declare that the information provided above is true and accurate to the best of my knowledge.", 45, 76, 8, charcoal);
  text(page, italic, "2. I agree to comply with the hospital rules, room rent limitations, and billing guidelines.", 45, 66, 8, charcoal);
  text(page, italic, "3. For cashless treatment: pre-authorization approval is subject to insurance/TPA terms; I undertake to clear all", 45, 56, 8, charcoal);
  text(page, italic, "non-payable or denied amounts at the time of discharge.", 45, 46, 8, charcoal);
  line(page, 55, 29, 250, 29, charcoal, 0.7);
  line(page, 345, 29, 540, 29, charcoal, 0.7);
  text(page, bold, "Signature of Patient / Next of Kin", 75, 19, 7.5);
  text(page, bold, "Hospital Admissions Officer Sign & Date", 355, 19, 7.5);

  const outputPath = fileURLToPath(new URL("../templates/hospital-pre-registration/fillable-template.pdf", import.meta.url));
  await fs.writeFile(outputPath, await pdf.save());
  console.log(`Fillable template generated: ${outputPath}`);
}

build().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
