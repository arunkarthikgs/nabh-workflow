// One-off maintenance script: permanently deletes the legacy flat files directly under
// Templates/ in R2, keeping only the per-programme subfolders (Templates/<slug>/...).
// Destructive - not reversible unless the R2 bucket has versioning enabled.
// Run: node scripts/deleteFlatTemplateRootFiles.js
import { loadConfig } from "../services/shared/config.js";
import { deleteFlatTemplateRootFiles, listFlatTemplateRootFiles, r2TemplateStorageEnabled } from "../services/shared/r2TemplateService.js";

loadConfig();

if (!r2TemplateStorageEnabled()) {
  console.log("R2_ENABLED is not true; nothing to do.");
  process.exit(0);
}

const preview = await listFlatTemplateRootFiles();
console.log(`Found ${preview.length} flat file(s) directly under Templates/ (outside any programme folder).`);

const result = await deleteFlatTemplateRootFiles();
console.log(`Deleted ${result.deleted} of ${result.total} flat file(s).`);
