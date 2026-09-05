#!/bin/bash

root="nabh-complaint-workflow"

# Create folder structure
mkdir -p "$root/agents"
mkdir -p "$root/models"
mkdir -p "$root/services"
mkdir -p "$root/sample"

# package.json
cat << 'EOF' > "$root/package.json"
{
  "name": "nabh-complaint-workflow",
  "version": "1.0.0",
  "main": "main.js",
  "type": "module",
  "scripts": {
    "start": "node main.js"
  },
  "dependencies": {
    "pdf-lib": "^1.17.1"
  }
}
EOF

# README.md
cat << 'EOF' > "$root/README.md"
# NABH Complaint Workflow

## Setup
1. Install dependencies:
   npm install

2. Run the workflow:
   npm start

3. Output:
   Complaint_NABH.pdf will be generated in the project root.
EOF

# complaintSchema.json
cat << 'EOF' > "$root/models/complaintSchema.json"
{
  "complaintId": "",
  "patientName": "",
  "uhid": "",
  "dateOfComplaint": "",
  "complaintCategory": "",
  "complaintDescription": "",
  "reportedBy": "",
  "investigationSummary": "",
  "rootCause": "",
  "correctiveAction": "",
  "preventiveAction": "",
  "responsibleDepartment": "",
  "closureStatus": "",
  "closureDate": "",
  "qualityReviewer": ""
}
EOF

# sample complaint
cat << 'EOF' > "$root/sample/sampleComplaint.txt"
Complaint ID: C-2026-001
Patient Name: Ravi Kumar
UHID: UH12345
Date of Complaint: 01-09-2026
Complaint Category: Nursing care
Complaint Description: Patient reported delay in medication administration.
Reported By: Patient
Investigation Summary: Nurse was occupied in emergency case; delay of 45 minutes.
Root Cause: Inadequate backup staffing.
Corrective Action: Reassign backup nurse during peak hours.
Preventive Action: Update staffing policy and conduct training.
Responsible Department: Nursing
Closure Status: Closed
Closure Date: 03-09-2026
Quality Reviewer: Quality Manager
EOF

# services
cat << 'EOF' > "$root/services/fileService.js"
import fs from "fs/promises";

export async function readTextFile(path) {
  return fs.readFile(path, "utf8");
}

export async function writeBinaryFile(path, buffer) {
  return fs.writeFile(path, buffer);
}
EOF

cat << 'EOF' > "$root/services/pdfService.js"
import { PDFDocument, StandardFonts } from "pdf-lib";

export async function createComplaintPDF(data) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawText("NABH Complaint Document", { x: 50, y: 750, size: 18, font });

  let y = 720;
  for (const [key, value] of Object.entries(data)) {
    page.drawText(\`\${key}: \${value}\`, { x: 50, y, size: 12, font });
    y -= 18;
  }

  return pdf.save();
}
EOF

cat << 'EOF' > "$root/services/logger.js"
export function log(message, data) {
  console.log(\`[LOG] \${message}\`, data || "");
}
EOF

# agents
cat << 'EOF' > "$root/agents/intakeAgent.js"
import { readTextFile } from "../services/fileService.js";

export async function readComplaint(path) {
  return readTextFile(path);
}
EOF

cat << 'EOF' > "$root/agents/extractionAgent.js"
export function extractComplaintFields(rawText) {
  const lines = rawText.split("\n");
  const map = {};

  for (const line of lines) {
    const [key, ...rest] = line.split(":");
    if (!key || !rest.length) continue;
    map[key.trim()] = rest.join(":").trim();
  }

  return {
    complaintId: map["Complaint ID"] || "",
    patientName: map["Patient Name"] || "",
    uhid: map["UHID"] || "",
    dateOfComplaint: map["Date of Complaint"] || "",
    complaintCategory: map["Complaint Category"] || "",
    complaintDescription: map["Complaint Description"] || "",
    reportedBy: map["Reported By"] || "",
    investigationSummary: map["Investigation Summary"] || "",
    rootCause: map["Root Cause"] || "",
    correctiveAction: map["Corrective Action"] || "",
    preventiveAction: map["Preventive Action"] || "",
    responsibleDepartment: map["Responsible Department"] || "",
    closureStatus: map["Closure Status"] || "",
    closureDate: map["Closure Date"] || "",
    qualityReviewer: map["Quality Reviewer"] || ""
  };
}
EOF

cat << 'EOF' > "$root/agents/complianceAgent.js"
import schema from "../models/complaintSchema.json" assert { type: "json" };

export function applyNABHCompliance(extracted) {
  const compliant = {};

  for (const key of Object.keys(schema)) {
    compliant[key] =
      extracted[key] && extracted[key].trim() !== ""
        ? extracted[key]
        : "NOT PROVIDED";
  }

  return compliant;
}
EOF

cat << 'EOF' > "$root/agents/validationAgent.js"
export function validateComplaint(data) {
  const missing = Object.entries(data)
    .filter(([_, v]) => v === "NOT PROVIDED")
    .map(([k]) => k);

  return {
    isValid: missing.length === 0,
    missingFields: missing
  };
}
EOF

cat << 'EOF' > "$root/agents/pdfAgent.js"
import { createComplaintPDF } from "../services/pdfService.js";

export async function generateComplaintPDF(data) {
  return createComplaintPDF(data);
}
EOF

cat << 'EOF' > "$root/agents/auditAgent.js"
import { log } from "../services/logger.js";

export async function logComplaint(data) {
  log("Complaint logged for audit", {
    complaintId: data.complaintId,
    patientName: data.patientName,
    dateOfComplaint: data.dateOfComplaint,
    closureStatus: data.closureStatus
  });
}
EOF

# main.js
cat << 'EOF' > "$root/main.js"
import { readComplaint } from "./agents/intakeAgent.js";
import { extractComplaintFields } from "./agents/extractionAgent.js";
import { applyNABHCompliance } from "./agents/complianceAgent.js";
import { validateComplaint } from "./agents/validationAgent.js";
import { generateComplaintPDF } from "./agents/pdfAgent.js";
import { logComplaint } from "./agents/auditAgent.js";
import { writeBinaryFile } from "./services/fileService.js";

async function run() {
  const filePath = "./sample/sampleComplaint.txt";

  const rawText = await readComplaint(filePath);
  const extracted = extractComplaintFields(rawText);
  const compliant = applyNABHCompliance(extracted);
  const validation = validateComplaint(compliant);

  if (!validation.isValid) {
    console.log("Missing fields:", validation.missingFields);
  }

  const pdfBuffer = await generateComplaintPDF(compliant);
  await writeBinaryFile("./Complaint_NABH.pdf", pdfBuffer);
  await logComplaint(compliant);

  console.log("✔ NABH Complaint PDF generated: Complaint_NABH.pdf");
}

run().catch(console.error);
EOF

echo "✔ Project created successfully: $root"

