// Keyword aliases used to detect which department a physical file's folder path / name
// implies, so we can boost matches within the right department (folders aren't fully
// department-scoped for every category - Manuals/SOPs/Checklists are flat).
export const DEPARTMENT_ALIASES = {
  "Management related": ["management"],
  "NABH policies": ["nabh"],
  Quality: ["quality"],
  "Nursing dept": ["nursing"],
  "A _ E": ["a & e", "a and e", "ae"],
  IPD: ["ipd"],
  OPD: ["opd"],
  "Front office": ["front office"],
  OT: ["ot"],
  ICU: ["icu"],
  OBG: ["obg"],
  Paediatrics: ["paediatrics", "pediatrics"],
  "Clinical lab": ["lab", "clinical lab"],
  Radiology: ["radiology"],
  Dialysis: ["dialysis"],
  "HR ": ["hr"],
  Purchase: ["purchase"],
  Accounts: ["accounts"],
  Pharmacy: ["pharmacy"],
  MRD: ["mrd"],
  Housekeeping: ["housekeeping"],
  Security: ["security"],
  "Facility & safety": ["facility", "safety"],
  CSSD: ["cssd"],
  "Linen & laundry": ["linen", "laundry"]
};

const BOOST_AMOUNT = 0.5;

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns a similarity-score boost (0 or BOOST_AMOUNT) if any alias for the given department
 * appears as a whole word/phrase in the candidate file's path string.
 */
export function getDepartmentBoost(pathString, department) {
  const aliases = DEPARTMENT_ALIASES[department];
  if (!aliases) return 0;

  const haystack = pathString.toLowerCase();
  const matches = aliases.some((alias) => new RegExp(`\\b${escapeRegex(alias)}\\b`, "i").test(haystack));
  return matches ? BOOST_AMOUNT : 0;
}
