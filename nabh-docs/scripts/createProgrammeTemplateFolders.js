// One-off maintenance script: creates an empty placeholder folder in R2 for each NABH
// accreditation programme under Templates/<programme-slug>/, so administrators have a
// place to upload programme-specific templates. Safe to re-run (skips existing folders).
// Run: node scripts/createProgrammeTemplateFolders.js
import { loadConfig } from "../services/shared/config.js";
import { ensureProgrammeTemplateFolders, r2TemplateStorageEnabled } from "../services/shared/r2TemplateService.js";

loadConfig();

if (!r2TemplateStorageEnabled()) {
  console.log("R2_ENABLED is not true; nothing to do.");
  process.exit(0);
}

const { created, existing } = await ensureProgrammeTemplateFolders();
console.log(`Created ${created.length} programme folder(s):`);
for (const item of created) console.log(`  + ${item.prefix}`);
console.log(`Already present: ${existing.length} programme folder(s):`);
for (const item of existing) console.log(`  = ${item.prefix}`);
