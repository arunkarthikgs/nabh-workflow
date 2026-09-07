// Creates the PostgreSQL schema and imports the existing output/*.json data.
// Run: DATA_STORE=postgres node scripts/migrateToPostgres.js
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import * as postgresStore from "../services/shared/store/postgresStore.js";

const outputDirectory = fileURLToPath(new URL("../output", import.meta.url));

async function readJson(fileName, fallback) {
  try { return JSON.parse(await readFile(path.join(outputDirectory, fileName), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

await postgresStore.initialize();
console.log(`Connected to ${postgresStore.info().target}; schema is ready.`);

const hospitals = await readJson("hospitals.json", []);
if (hospitals.length) {
  await postgresStore.saveHospitals(hospitals);
  console.log(`Imported ${hospitals.length} hospital(s).`);
}

const documentMatches = await readJson("documentMatches.json", null);
if (documentMatches) {
  await postgresStore.saveDocumentMatches(documentMatches);
  console.log(`Imported ${Object.values(documentMatches).flat().length} document match(es) across ${Object.keys(documentMatches).length} department(s).`);
}

const audit = await readJson("documentAudit.json", []);
if (audit.length) {
  await postgresStore.saveDocumentAudit(audit);
  console.log(`Imported ${audit.length} audit entr(ies).`);
}

const documentStatus = await readJson("documentStatus.json", null);
if (documentStatus && Object.keys(documentStatus).length) {
  await postgresStore.saveDocumentStatus(documentStatus);
  console.log(`Imported readiness status for ${Object.keys(documentStatus).length} hospital(s).`);
}

const documentDrafts = await readJson("documentDrafts.json", null);
if (documentDrafts && Object.keys(documentDrafts).length) {
  await postgresStore.saveDocumentDrafts(documentDrafts);
  console.log(`Imported document drafts for ${Object.keys(documentDrafts).length} hospital(s).`);
}

const bookings = await readJson("bookings.json", []);
if (bookings.length) {
  await postgresStore.saveBookings(bookings);
  console.log(`Imported ${bookings.length} booking(s).`);
}

await postgresStore.close();
console.log("Migration complete.");
