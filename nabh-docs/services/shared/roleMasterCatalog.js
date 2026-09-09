// Built-in staff designation / role master list, grouped for the Role Management and
// user "Designation" dropdowns. Backs the nabh_role_master table in postgres mode and is
// used directly (no DB) in json mode.
export const roleMasterSeed = [
  ["Administrative & Management", ["Hospital Administrator", "Quality Manager", "NABH Coordinator", "Internal Auditor", "HR Manager", "IT Administrator", "Medical Records Officer (MRD)", "Front Office Executive", "Billing Executive"]],
  ["Clinical Care", ["Consultant Doctors", "Resident Medical Officer (RMO)", "Nurses", "Anesthesiologist", "Surgeon", "Physiotherapist", "Dietician"]],
  ["Emergency & Critical Care", ["Emergency Medical Officer", "Trauma Nurse", "Intensivist", "Critical Care Nurse"]],
  ["Diagnostics & Laboratory", ["Lab Technician", "Pathologist", "Radiologist", "Radiology Technician"]],
  ["Pharmacy & Medication", ["Pharmacist", "Pharmacy Store Manager", "Clinical Pharmacist"]],
  ["Quality, Safety & NABH", ["Infection Control Nurse (ICN)", "Patient Safety Officer", "Safety Officer", "Biomedical Engineer"]],
  ["Facility Management & Support", ["Housekeeping Supervisor", "Security Officer", "Maintenance Engineer", "Ward Boy / Patient Transporter"]],
  ["Finance, Insurance & TPA", ["Accounts Manager", "TPA Coordinator", "Audit Officer"]],
  ["Operation Theatre", ["OT Nurse", "Scrub Nurse", "Circulating Nurse", "OT Technician"]],
  ["NABH-Mandated Committees", ["Quality Committee Members", "Infection Control Committee (ICC)", "Pharmacy & Therapeutics Committee (PTC)", "Safety Committee", "Medical Records Committee", "Biomedical Committee"]]
];

export function roleReportsFor(name) {
  if (name.includes("Quality") || name.includes("NABH") || name.includes("Auditor")) return ["Master List", "Compliance Summary", "Document Matches"];
  if (name.includes("Records")) return ["Master List", "Document Matches"];
  return ["Master List"];
}

export function slugifyRoleName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
}

export function flatRoleMaster() {
  return roleMasterSeed.flatMap(([category, names]) =>
    names.map((name) => ({ id: slugifyRoleName(name), name, category, reports: roleReportsFor(name) }))
  );
}
