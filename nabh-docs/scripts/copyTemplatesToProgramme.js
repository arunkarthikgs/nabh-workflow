// One-off maintenance script: copies the flat legacy Templates/ file set into specific
// NABH accreditation programme folders as a starting point, until programme-specific
// content replaces it. Additive only (skips files that already exist at the destination).
// Run: node scripts/copyTemplatesToProgramme.js "Hospitals (HCO)" "Digital Health"
import { loadConfig } from "../services/shared/config.js";
import { copyFlatTemplatesIntoProgramme, r2TemplateStorageEnabled } from "../services/shared/r2TemplateService.js";
import { NABH_ACCREDITATION_PROGRAMMES } from "../services/shared/accreditationService.js";

loadConfig();

if (!r2TemplateStorageEnabled()) {
  console.log("R2_ENABLED is not true; nothing to do.");
  process.exit(0);
}

const programmes = process.argv.slice(2);
if (!programmes.length) {
  console.error("Usage: node scripts/copyTemplatesToProgramme.js \"<programme 1>\" [\"<programme 2>\" ...]");
  console.error(`Valid programmes:\n${NABH_ACCREDITATION_PROGRAMMES.map((item) => `  - ${item}`).join("\n")}`);
  process.exit(1);
}

for (const programme of programmes) {
  if (!NABH_ACCREDITATION_PROGRAMMES.includes(programme)) {
    console.error(`Unknown programme: "${programme}"`);
    process.exit(1);
  }
}

for (const programme of programmes) {
  console.log(`Copying flat templates into "${programme}"...`);
  const result = await copyFlatTemplatesIntoProgramme(programme);
  console.log(`  ${result.copied} copied, ${result.skipped} already present, ${result.total} total source file(s) -> ${result.destinationPrefix}`);
}
