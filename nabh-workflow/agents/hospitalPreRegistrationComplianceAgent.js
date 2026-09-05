import schema from "../models/hospitalPreRegistrationSchema.json" with { type: "json" };

const optionalFields = new Set([
  "emailAddress",
  "insuranceCompany",
  "tpaName",
  "policyId",
  "preAuthStatus",
  "contactPhone2"
]);

export function applyHospitalPreRegistrationCompliance(extracted) {
  const compliant = {};

  for (const key of Object.keys(schema)) {
    const value = extracted[key];
    const isBlank = !value || String(value).trim() === "";
    compliant[key] = isBlank ? (optionalFields.has(key) ? "" : "NOT PROVIDED") : value;
  }

  return compliant;
}
