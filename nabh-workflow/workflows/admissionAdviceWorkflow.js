import { readFile, writeFile } from "fs/promises";
import { createAdmissionAdvicePDF } from "../services/admission-advice/pdfService.js";
import { applyAdmissionAdviceCompliance } from "../agents/admissionAdviceComplianceAgent.js";
import { validateAdmissionAdvice } from "../agents/admissionAdviceValidationAgent.js";
import { logAdmissionAdvice } from "../agents/admissionAdviceAuditAgent.js";

async function run() {
  const inputPath = process.argv[2] || "./sample/admissionAdviceInput.json";
  const outputPath = process.argv[3] || "./Admission_Advice_Note_Aligned.pdf";
  const rawData = JSON.parse(await readFile(inputPath, "utf8"));

  const data = applyAdmissionAdviceCompliance(rawData);
  const validation = validateAdmissionAdvice(data);
  if (!validation.isValid) {
    console.log("Missing fields:", validation.missingFields);
  }

  const pdf = await createAdmissionAdvicePDF(data);
  await writeFile(outputPath, pdf);
  await logAdmissionAdvice(data);
  console.log(`Admission Advice PDF generated: ${outputPath}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
