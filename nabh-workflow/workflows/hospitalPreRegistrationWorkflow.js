import { readFile, writeFile } from "fs/promises";
import { createHospitalPreRegistrationPDF } from "../services/hospital-pre-registration/pdfService.js";
import { applyHospitalPreRegistrationCompliance } from "../agents/hospitalPreRegistrationComplianceAgent.js";
import { validateHospitalPreRegistration } from "../agents/hospitalPreRegistrationValidationAgent.js";
import { logHospitalPreRegistration } from "../agents/hospitalPreRegistrationAuditAgent.js";

async function run() {
  const inputPath = process.argv[2] || "./sample/hospitalPreRegistrationInput.json";
  const outputPath = process.argv[3] || "./Hospital_Pre_Registration.pdf";
  const rawData = JSON.parse(await readFile(inputPath, "utf8"));

  const data = applyHospitalPreRegistrationCompliance(rawData);
  const validation = validateHospitalPreRegistration(data);
  if (!validation.isValid) {
    console.log("Missing fields:", validation.missingFields);
  }

  const pdf = await createHospitalPreRegistrationPDF(data);
  await writeFile(outputPath, pdf);
  await logHospitalPreRegistration(data);
  console.log(`Hospital Pre-Registration PDF generated: ${outputPath}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
