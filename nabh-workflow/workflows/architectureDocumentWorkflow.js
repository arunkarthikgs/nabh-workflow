import { createArchitecturePDF } from "../services/architecture/pdfService.js";
import { writeBinaryFile } from "../services/shared/fileService.js";

async function run() {
  const outputPath = process.argv[2] || "./NABH_Workflow_Architecture.pdf";
  const pdf = await createArchitecturePDF();
  await writeBinaryFile(outputPath, pdf);
  console.log(`Architecture PDF generated: ${outputPath}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});