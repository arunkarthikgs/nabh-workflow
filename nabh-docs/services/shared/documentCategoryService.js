// Classifies a NABH master-list document name into the concept note's implementation-workspace categories.
export const NABH_WORKSPACE_CATEGORIES = [
  "Manuals",
  "Policies",
  "Standard Operating Procedures",
  "Forms and Formats",
  "Registers",
  "Department Manuals",
  "Checklists",
  "Training Requirements",
  "Records and Evidence"
];

const CATEGORY_RULES = [
  ["Standard Operating Procedures", /\bsops?\b|standard operating procedure/i],
  ["Checklists", /\bchecklist/i],
  ["Registers", /\bregister/i],
  ["Policies", /\bpolic(y|ies)\b/i],
  ["Forms and Formats", /\bforms?\b|\bformats?\b/i],
  ["Training Requirements", /\btraining\b|\binduction\b/i],
  ["Records and Evidence", /\brecords?\b|\bevidence\b|\baudit\b/i],
  ["Manuals", /\bmanual\b/i]
];

export function classifyDocument(documentName) {
  const name = typeof documentName === "string" ? documentName : "";
  for (const [category, pattern] of CATEGORY_RULES) if (pattern.test(name)) return category;
  return "Department Manuals";
}
