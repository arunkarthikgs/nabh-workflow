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

const usedEmails = new Set();
let nextUserId = 10000000;
const seedHospitals = hospitals.map((sourceHospital, hospitalIndex) => {
  const hospital = structuredClone(sourceHospital);
  const originalCode = String(hospital.code || `H${hospitalIndex + 1}`).toUpperCase().replace(/[^A-Z0-9]/g, "");
  hospital.code = (originalCode.slice(0, 3) || "HOS") + String(hospitalIndex % 10);
  hospital.status = hospital.status === "inactive" ? "inactive" : "active";
  hospital.users = (hospital.users || []).map((user) => {
    const nextUser = { ...user, userId: String(nextUserId++), status: user.active === false ? "inactive" : "active", updatedAt: user.updatedAt || user.createdAt };
    const email = String(nextUser.email || "").trim().toLowerCase();
    if (email && usedEmails.has(email)) nextUser.email = `${email.split("@")[0]}+${hospital.code.toLowerCase()}@${email.split("@")[1]}`;
    else nextUser.email = email;
    if (nextUser.email) usedEmails.add(nextUser.email);
    return nextUser;
  });
  return hospital;
});

await postgresStore.initialize();
await postgresStore.resetHospitalDomain();
if (seedHospitals.length) await postgresStore.saveHospitals(seedHospitals);

if (r2TemplateStorageEnabled()) {
  for (const hospital of hospitals) {
    const result = await deleteR2HospitalFolder(hospital.code);
    console.log(`Cleaned ${result.prefix}: ${result.deleted} object(s).`);
  }
} else {
  console.log("R2 is disabled; no client folders were removed.");
}

await postgresStore.close();
console.log(`Reset and reseeded ${seedHospitals.length} hospital(s) and ${seedHospitals.reduce((count, hospital) => count + hospital.users.length, 0)} user(s).`);