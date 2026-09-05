// Document Matching workflow: matches every document in the parsed Master List to its
// physical file on disk, using fuzzy name matching + a department-folder boost.
// Run: node workflows/documentMatchingWorkflow.js "/path/to/Final" [--local /path/to/MasterList.xlsx]
import { writeFile, mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
import { readMasterListSource } from "../agents/masterListIntakeAgent.js";
import { matchDocumentsToFiles } from "../agents/documentMatchingAgent.js";
import { indexFiles } from "../services/shared/fileIndexer.js";

const DEFAULT_SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1iZasVBmjayMtecLyMp94c8zK0dALj9-F/edit?usp=drive_link&ouid=111928607204974965190&rtpof=true&sd=true";

function parseArgs(argv) {
  const localIndex = argv.indexOf("--local");
  const source = localIndex !== -1 ? { localFilePath: argv[localIndex + 1] } : { spreadsheetUrl: DEFAULT_SPREADSHEET_URL };
  const filesRoot = argv.find((arg, index) => index !== localIndex && index !== localIndex + 1 && !arg.startsWith("--"));
  return { source, filesRoot };
}

async function run() {
  const { source, filesRoot } = parseArgs(process.argv.slice(2));
  if (!filesRoot) {
    console.log("Usage: node workflows/documentMatchingWorkflow.js \"/path/to/Final\" [--local /path/to/MasterList.xlsx]");
    process.exitCode = 1;
    return;
  }

  console.log(`Indexing physical files under: ${filesRoot}`);
  const fileIndex = await indexFiles(filesRoot);
  console.log(`Indexed ${fileIndex.length} file(s).`);

  const departments = await readMasterListSource(source);
  const matches = matchDocumentsToFiles(departments, fileIndex);

  for (const documents of Object.values(matches)) {
    for (const doc of documents) {
      doc.relativeFilePath = doc.matchedFilePath ? path.relative(filesRoot, doc.matchedFilePath) : null;
    }
  }

  const outputDir = fileURLToPath(new URL("../output", import.meta.url));
  await mkdir(outputDir, { recursive: true });
  const outputPath = fileURLToPath(new URL("../output/documentMatches.json", import.meta.url));
  await writeFile(outputPath, JSON.stringify(matches, null, 2));

  let totalDocuments = 0;
  let highConfidence = 0;
  let mediumConfidence = 0;
  let lowConfidence = 0;
  let reusedCount = 0;

  console.log(`\nMatch summary by department:\n`);
  for (const [department, documents] of Object.entries(matches)) {
    const counts = { high: 0, medium: 0, low: 0 };
    for (const doc of documents) {
      counts[doc.confidence]++;
      if (doc.reusedAcrossDocuments) reusedCount++;
    }
    totalDocuments += documents.length;
    highConfidence += counts.high;
    mediumConfidence += counts.medium;
    lowConfidence += counts.low;
    console.log(`- ${department}: ${documents.length} document(s) — high: ${counts.high}, medium: ${counts.medium}, low: ${counts.low}`);
  }

  console.log(`\nTotal: ${totalDocuments} document(s) — high: ${highConfidence}, medium: ${mediumConfidence}, low: ${lowConfidence}`);
  console.log(`(${reusedCount} of those are flagged "low" because the same file was reused across 3+ documents — likely a generic file, not a dedicated one.)`);
  console.log(`Written to ${outputPath}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
