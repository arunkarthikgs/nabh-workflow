import { readFile, writeFile } from "fs/promises";
import { readAssetRegister } from "./agents/intakeAgent.js";
import { applyAssetCareCompliance } from "./agents/complianceAgent.js";
import { validateAssetRegister } from "./agents/validationAgent.js";
import { buildAuditReport } from "./agents/auditAgent.js";

async function run() {
  const inputPath = process.argv[2] || "./sample/assetRegister.json";
  const outputPath = process.argv[3] || "./output/assetcare-audit-report.json";
  const rawAssets = await readAssetRegister(inputPath);
  const assets = applyAssetCareCompliance(rawAssets);
  const findings = validateAssetRegister(assets);
  const report = buildAuditReport(assets, findings);

  await writeFile(outputPath, JSON.stringify(report, null, 2));
  console.log(`AssetCare audit report generated: ${outputPath}`);
  console.log(`Assets: ${report.summary.totalAssets}; exceptions: ${report.exceptionCount}; incomplete: ${report.incompleteAssetCount}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
