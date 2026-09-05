import schema from "../models/admissionAdviceSchema.json" with { type: "json" };

function isBlank(value) {
  if (Array.isArray(value)) return value.length === 0;
  return !value || String(value).trim() === "";
}

export function applyAdmissionAdviceCompliance(extracted) {
  const compliant = {};

  for (const key of Object.keys(schema)) {
    compliant[key] = isBlank(extracted[key]) ? "NOT PROVIDED" : extracted[key];
  }

  return compliant;
}
