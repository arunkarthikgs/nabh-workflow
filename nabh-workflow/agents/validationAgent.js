export function validateComplaint(data) {
  const missing = Object.entries(data)
    .filter(([_, v]) => v === "NOT PROVIDED")
    .map(([k]) => k);

  return {
    isValid: missing.length === 0,
    missingFields: missing
  };
}
