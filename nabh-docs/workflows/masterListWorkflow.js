// Master List of Documents workflow: reads the department document register (Google Sheets by
// default, or a local .xlsx export with --local) and writes the parsed result to output/masterList.json.
// Run: node workflows/masterListWorkflow.js
//      node workflows/masterListWorkflow.js --local /path/to/MasterList.xlsx
import { writeFile, mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { readMasterListSource } from "../agents/masterListIntakeAgent.js";
import { logMasterListSummary } from "../agents/masterListAuditAgent.js";

const DEFAULT_SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1iZasVBmjayMtecLyMp94c8zK0dALj9-F/edit?usp=drive_link&ouid=111928607204974965190&rtpof=true&sd=true";

function parseArgs(argv) {
  const localIndex = argv.indexOf("--local");
  if (localIndex !== -1) {
    return { localFilePath: argv[localIndex + 1] };
  }
  return { spreadsheetUrl: argv[0] || DEFAULT_SPREADSHEET_URL };
}

async function run() {
  const source = parseArgs(process.argv.slice(2));
  const departments = await readMasterListSource(source);

  logMasterListSummary(departments);

  const outputDir = fileURLToPath(new URL("../output", import.meta.url));
  await mkdir(outputDir, { recursive: true });
  const outputPath = fileURLToPath(new URL("../output/masterList.json", import.meta.url));
  await writeFile(outputPath, JSON.stringify(departments, null, 2));

  console.log(`\nParsed ${Object.keys(departments).length} department tab(s). Written to ${outputPath}`);
  for (const [department, documents] of Object.entries(departments)) {
    console.log(`- ${department}: ${documents.length} applicable document(s)`);
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
