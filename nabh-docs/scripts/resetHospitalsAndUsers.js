// Destructive reset for the hospital domain. Templates, document matches, and audit records are preserved.
// Run only with: DATA_STORE=postgres RESET_HOSPITAL_DOMAIN=1 node scripts/resetHospitalsAndUsers.js
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import * as postgresStore from "../services/shared/store/postgresStore.js";
import { deleteR2HospitalFolder, r2TemplateStorageEnabled } from "../services/shared/r2TemplateService.js";

if (process.env.RESET_HOSPITAL_DOMAIN !== "1") {
  throw new Error("Refusing to reset. Set RESET_HOSPITAL_DOMAIN=1 to confirm this destructive operation.");
}
if ((process.env.DATA_STORE || "").toLowerCase() !== "postgres") {
  throw new Error("Refusing to reset unless DATA_STORE=postgres is set explicitly.");
}

const outputDirectory = fileURLToPath(new URL("../output", import.meta.url));
const hospitals = JSON.parse(await readFile(path.join(outputDirectory, "hospitals.json"), "utf8"));
if (!Array.isArray(hospitals)) throw new Error("output/hospitals.json must contain an array.");

await postgresStore.initialize();
await postgresStore.resetHospitalDomain();
if (hospitals.length) await postgresStore.saveHospitals(hospitals);

if (r2TemplateStorageEnabled()) {
  for (const hospital of hospitals) {
    const result = await deleteR2HospitalFolder(hospital.code);
    console.log(`Cleaned ${result.prefix}: ${result.deleted} object(s).`);
  }
} else {
  console.log("R2 is disabled; no client folders were removed.");
}

await postgresStore.close();
console.log(`Reset and reseeded ${hospitals.length} hospital(s) and their users.`);