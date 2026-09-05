import { readFile, writeFile } from "fs/promises";
import { readComplaint } from "./agents/intakeAgent.js";
import { extractComplaintFields } from "./agents/extractionAgent.js";
import { applyNABHCompliance } from "./agents/complianceAgent.js";
import { validateComplaint } from "./agents/validationAgent.js";
import { generateComplaintPDF } from "./agents/pdfAgent.js";
import { logComplaint } from "./agents/auditAgent.js";

function usage() {
  console.log("Usage: npm run agent -- <intake|extract|compliance|validate|pdf|audit> <input-file> [output-file]");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function run() {
  const [agentName, inputPath, outputPath] = process.argv.slice(2);
  if (!agentName || !inputPath) {
    usage();
    process.exitCode = 1;
    return;
  }

  if (agentName === "intake") {
    console.log(await readComplaint(inputPath));
    return;
  }

  if (agentName === "extract") {
    const rawText = await readComplaint(inputPath);
    console.log(JSON.stringify(extractComplaintFields(rawText), null, 2));
    return;
  }

  const data = await readJson(inputPath);
  if (agentName === "compliance") {
    console.log(JSON.stringify(applyNABHCompliance(data), null, 2));
    return;
  }

  if (agentName === "validate") {
    console.log(JSON.stringify(validateComplaint(data), null, 2));
    return;
  }

  if (agentName === "pdf") {
    const pdf = await generateComplaintPDF(data);
    const destination = outputPath || "./Complaint_NABH_Agent.pdf";
    await writeFile(destination, pdf);
    console.log(`PDF generated: ${destination}`);
    return;
  }

  if (agentName === "audit") {
    await logComplaint(data);
    return;
  }

  usage();
  process.exitCode = 1;
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
