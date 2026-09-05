import schema from "../models/complaintSchema.json" with { type: "json" };

export function applyNABHCompliance(extracted) {
  const compliant = {};
  const optionalFields = new Set([
    "relationshipOtherText",
    "emailAddress",
    "receivedByNameDesignation",
    "investigationSummary",
    "rootCause",
    "correctiveAction",
    "preventiveAction",
    "closureStatus",
    "qualityReviewer",
  ]);

  for (const key of Object.keys(schema)) {
    compliant[key] =
      extracted[key] && extracted[key].trim() !== ""
        ? extracted[key]
        : optionalFields.has(key)
          ? ""
          : "NOT PROVIDED";
  }

  return compliant;
}
