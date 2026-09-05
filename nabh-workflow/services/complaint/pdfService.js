import fs from "fs/promises";
import { fileURLToPath } from "url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const green = rgb(0.02, 0.43, 0.29);
const charcoal = rgb(0.18, 0.18, 0.18);
const lightGray = rgb(0.83, 0.83, 0.83);
const paleGray = rgb(0.97, 0.97, 0.97);
const black = rgb(0, 0, 0);

async function tryEmbedLogo(pdf, page) {
  const candidates = [
    new URL("../../logo.png", import.meta.url),
    new URL("../../assets/logo.png", import.meta.url),
    new URL("../../images/logo.png", import.meta.url),
    new URL("../../logo.jpg", import.meta.url),
  ];

  for (const candidate of candidates) {
    try {
      const filePath = fileURLToPath(candidate);
      const bytes = await fs.readFile(filePath);
      const image = filePath.toLowerCase().endsWith(".png")
        ? await pdf.embedPng(bytes)
        : await pdf.embedJpg(bytes);
      page.drawImage(image, { x: 50, y: 764, width: 45, height: 45 });
      return;
    } catch {
      // Try the next supported logo location.
    }
  }
}

function drawText(page, font, text, x, y, size = 10, color = black) {
  page.drawText(String(text || ""), { x, y, font, size, color });
}

function drawRule(page, x1, y1, x2, y2, color = charcoal, thickness = 0.6) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness });
}

function drawCheckbox(page, font, x, y, checked, label) {
  page.drawRectangle({ x, y: y - 2, width: 10, height: 10, borderColor: charcoal, borderWidth: 0.7 });
  if (checked) drawText(page, font, "X", x + 1.5, y, 8, green);
  drawText(page, font, label, x + 15, y, 9);
}

function drawField(page, regularFont, boldFont, label, value, x, y, width) {
  drawText(page, boldFont, label, x, y, 8.5, charcoal);
  drawRule(page, x, y - 14, x + width, y - 14, lightGray, 0.45);
  drawText(page, regularFont, value, x, y - 11, 9.5);
}

function drawSection(page, boldFont, number, label, y) {
  page.drawRectangle({ x: 45, y: y - 5, width: 505, height: 24, color: charcoal });
  page.drawCircle({ x: 59, y: y + 7, size: 8, color: green });
  drawText(page, boldFont, String(number), 56.5, y + 3.5, 8, rgb(1, 1, 1));
  drawText(page, boldFont, label, 72, y + 3, 11, rgb(1, 1, 1));
}

function drawWrappedText(page, font, text, x, y, maxWidth, size, lineHeight) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let line = "";
  let lineY = y;

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(nextLine, size) > maxWidth && line) {
      drawText(page, font, line, x, lineY, size);
      line = word;
      lineY -= lineHeight;
    } else {
      line = nextLine;
    }
  }

  if (line) drawText(page, font, line, x, lineY, size);
}

function normalizeCategory(category) {
  const value = String(category || "").toLowerCase();
  if (value === "nursing care" || value === "clinical care" || value === "clinical care quality") return "Clinical Care";
  if (value === "professional behavior") return "Staff Behavior";
  if (value === "facility environment") return "Facility & Amenities";
  if (value === "operational processing") return "Operational Delays";
  return category;
}

export async function createComplaintPDF(data) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const officePage = pdf.addPage([595, 842]);
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const category = normalizeCategory(data.complaintCategory);

  await tryEmbedLogo(pdf, page);
  drawText(page, boldFont, "Shippu Hospital", 215, 794, 20, green);
  drawText(page, italicFont, "Quality Management Systems Compliance Framework - NABH Entry-Level v2", 160, 778, 9, charcoal);
  drawRule(page, 45, 762, 550, 762, green, 2);
  page.drawRectangle({ x: 45, y: 730, width: 505, height: 24, color: green });
  drawText(page, boldFont, "PATIENT COMPLAINT / GRIEVANCE REDRESSAL FORM", 98, 737, 14, rgb(1, 1, 1));
  drawText(page, regularFont, "Document ID: [HOSP]/PRE/F-04  |  Version: 2.0  |  Effective Date: 01-10-2026", 126, 716, 8.5, rgb(0.38, 0.46, 0.57));

  drawSection(page, boldFont, 1, "COMPLAINANT & PATIENT METADATA", 682);
  page.drawRectangle({ x: 45, y: 526, width: 505, height: 132, color: paleGray, borderColor: lightGray, borderWidth: 0.6 });
  drawRule(page, 297, 526, 297, 658, lightGray, 0.6);
  for (const y of [625, 592, 559]) drawRule(page, 45, y, 550, y, lightGray, 0.6);

  drawField(page, regularFont, boldFont, "Date of Lodging", data.dateOfComplaint, 57, 642, 220);
  drawField(page, regularFont, boldFont, "Time of Lodging", data.timeOfLodging, 310, 642, 90);
  drawCheckbox(page, regularFont, 410, 631, data.timeAmPm === "AM", "AM");
  drawCheckbox(page, regularFont, 467, 631, data.timeAmPm === "PM", "PM");
  drawField(page, regularFont, boldFont, "Name of Complainant", data.reportedBy, 57, 609, 220);
  drawText(page, boldFont, "Relationship to Patient", 310, 609, 8.5, charcoal);
  drawCheckbox(page, regularFont, 420, 598, data.relationshipToPatient === "Self", "Self");
  drawCheckbox(page, regularFont, 470, 598, ["Spouse", "Parent", "Child"].includes(data.relationshipToPatient), "Kin");
  drawField(page, regularFont, boldFont, "Patient Name (if different)", data.patientName, 57, 576, 220);
  drawField(page, regularFont, boldFont, "UHID (Unique ID Number)", data.uhid, 310, 576, 220);
  drawField(page, regularFont, boldFont, "Contact Mobile Number", data.contactNumber, 57, 543, 220);
  drawField(page, regularFont, boldFont, "IPD / OPD Transaction ID", data.ipdOpdNumber, 310, 543, 220);

  drawSection(page, boldFont, 2, "CLASSIFICATION OF QUALITY INCONVENIENCE", 490);
  const categories = [
    ["Clinical Care", "Clinical Care Quality"],
    ["Staff Behavior", "Professional Behavior"],
    ["Billing & Tariff", "Billing & Tariff Schemes"],
    ["Facility & Amenities", "Facility Environment"],
    ["Operational Delays", "Operational Processing"],
  ];
  categories.forEach(([value, label], index) => drawCheckbox(page, boldFont, 57, 463 - index * 20, category === value, label));

  drawSection(page, boldFont, 3, "DETAILED DESCRIPTION OF GRIEVANCE EVENT", 343);
  drawText(page, regularFont, "Locations, dates, staff names involved, and summary of events:", 45, 323, 9, rgb(0.4, 0.4, 0.4));
  page.drawRectangle({ x: 45, y: 184, width: 505, height: 122, borderColor: lightGray, borderWidth: 0.6 });
  drawWrappedText(page, regularFont, data.complaintDescription, 57, 285, 480, 10, 17);
  drawRule(page, 57, 162, 245, 162, charcoal, 0.7);
  drawText(page, regularFont, "Signature / Thumb Impression of Complainant", 57, 148, 8.5, charcoal);

  await tryEmbedLogo(pdf, officePage);
  drawText(officePage, boldFont, "Shippu Hospital", 215, 794, 20, green);
  drawSection(officePage, boldFont, 4, "FOR INTERNAL QUALITY OFFICE USE ONLY", 730);
  officePage.drawRectangle({ x: 45, y: 540, width: 505, height: 135, color: paleGray, borderColor: lightGray, borderWidth: 0.6 });
  drawRule(officePage, 297, 540, 297, 675, lightGray, 0.6);
  for (const y of [630, 585]) drawRule(officePage, 45, y, 550, y, lightGray, 0.6);
  drawField(officePage, regularFont, boldFont, "Grievance Reference ID", data.complaintId, 57, 650, 220);
  drawText(officePage, boldFont, "Mode of Intake", 310, 650, 8.5, charcoal);
  drawCheckbox(officePage, regularFont, 405, 639, data.modeOfReceipt === "Suggestion Box", "Box");
  drawCheckbox(officePage, regularFont, 455, 639, data.modeOfReceipt === "Verbal", "Verbal");
  drawCheckbox(officePage, regularFont, 515, 639, data.modeOfReceipt === "Email", "Email");
  drawField(officePage, regularFont, boldFont, "Assigned Grievance Officer", data.responsibleDepartment, 57, 605, 220);
  drawField(officePage, regularFont, boldFont, "Assessment Date", data.closureDate, 310, 605, 220);
  drawCheckbox(officePage, regularFont, 57, 549, true, "Target Resolution: <7 Days Normal");
  drawRule(officePage, 340, 470, 535, 470, charcoal, 0.7);
  drawText(officePage, regularFont, "Signature of Receiving Quality Officer with Date", 340, 456, 8.5, charcoal);

  return pdf.save();
}
