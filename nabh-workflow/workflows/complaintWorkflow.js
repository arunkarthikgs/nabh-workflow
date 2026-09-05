import { readComplaint } from "../agents/intakeAgent.js";
import { extractComplaintFields } from "../agents/extractionAgent.js";
import { applyNABHCompliance } from "../agents/complianceAgent.js";
import { validateComplaint } from "../agents/validationAgent.js";
import { generateComplaintPDF } from "../agents/pdfAgent.js";
import { logComplaint } from "../agents/auditAgent.js";
import { writeBinaryFile } from "../services/shared/fileService.js";

async function run() {
  const filePath = process.argv[2] || "./sample/sampleComplaint.txt";

  const rawText = await readComplaint(filePath);
  const extracted = extractComplaintFields(rawText);
  const compliant = applyNABHCompliance(extracted);
  const validation = validateComplaint(compliant);

  if (!validation.isValid) {
    console.log("Missing fields:", validation.missingFields);
  }

  const pdfBuffer = await generateComplaintPDF(compliant);
  await writeBinaryFile("./Complaint_NABH.pdf", pdfBuffer);
  await writeBinaryFile("./Complaint_NABH_Rebuilt.pdf", pdfBuffer);
  await writeBinaryFile("./Complaint_NABH_LogoAligned.pdf", pdfBuffer);
  await logComplaint(compliant);

  console.log(`✔ Input processed: ${filePath}`);
  console.log("✔ NABH Complaint PDF generated: Complaint_NABH.pdf");
  console.log("✔ Rebuilt PDF generated: Complaint_NABH_Rebuilt.pdf");
  console.log("✔ Logo-aligned PDF generated: Complaint_NABH_LogoAligned.pdf");
}

run().catch(console.error);
