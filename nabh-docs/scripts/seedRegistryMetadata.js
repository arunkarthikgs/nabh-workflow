// One-time seed of nabh_registry_metadata with the role/department/committee catalog that used
// to be hardcoded in AdminWorkspace.jsx, RoleManagement.jsx, and hospitalAdminService.js.
// Run: DATA_STORE=postgres node scripts/seedRegistryMetadata.js
import * as postgresStore from "../services/shared/store/postgresStore.js";

const groups = [
  ["Administrative & Management", "MANDATORY_DEPARTMENT", [
    "Hospital Administrator", "Quality Manager", "NABH Coordinator", "Internal Auditor", "HR Manager",
    "IT Administrator", "Medical Records Officer (MRD)", "Front Office Executive", "Billing Executive"
  ]],
  ["Clinical Care", "OPTIONAL_SPECIALTY", [
    "Consultant Doctors", "Resident Medical Officer (RMO)", "Nurses", "Anesthesiologist", "Surgeon", "Physiotherapist", "Dietician"
  ]],
  ["Emergency & Critical Care", "OPTIONAL_SPECIALTY", [
    "Emergency Medical Officer", "Trauma Nurse", "Intensivist", "Critical Care Nurse"
  ]],
  ["Diagnostics & Laboratory", "OPTIONAL_SPECIALTY", [
    "Lab Technician", "Pathologist", "Radiologist", "Radiology Technician"
  ]],
  ["Pharmacy & Medication", "OPTIONAL_SPECIALTY", [
    "Pharmacist", "Pharmacy Store Manager", "Clinical Pharmacist"
  ]],
  ["Quality, Safety & NABH", "MANDATORY_DEPARTMENT", [
    "Infection Control Nurse (ICN)", "Patient Safety Officer", "Safety Officer", "Biomedical Engineer"
  ]],
  ["Facility Management & Support", "OPTIONAL_SPECIALTY", [
    "Housekeeping Supervisor", "Security Officer", "Maintenance Engineer", "Ward Boy / Patient Transporter"
  ]],
  ["Finance, Insurance & TPA", "OPTIONAL_SPECIALTY", [
    "Accounts Manager", "TPA Coordinator", "Audit Officer"
  ]],
  ["Operation Theatre", "OPTIONAL_SPECIALTY", [
    "OT Nurse", "Scrub Nurse", "Circulating Nurse", "OT Technician"
  ]],
  ["NABH-Mandated Committees", "CROSS_FUNCTIONAL_COMMITTEE", [
    "Quality Committee Members", "Infection Control Committee (ICC)", "Pharmacy & Therapeutics Committee (PTC)",
    "Safety Committee", "Medical Records Committee", "Biomedical Committee"
  ]]
];

function slug(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
}

const rows = groups.flatMap(([category, registryType, labels]) =>
  labels.map((label) => ({ id: slug(label), label, registryType, category, description: `${label} (${category})` }))
);

await postgresStore.initialize();
await postgresStore.seedRegistryMetadata(rows);
console.log(`Seeded ${rows.length} nabh_registry_metadata rows (skips any id that already exists).`);
await postgresStore.close();
