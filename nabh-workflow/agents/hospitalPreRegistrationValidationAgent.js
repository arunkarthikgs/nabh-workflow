export function validateHospitalPreRegistration(data) {
  const missing = Object.entries(data)
    .filter(([, value]) => value === "NOT PROVIDED")
    .map(([key]) => key);

  return {
    isValid: missing.length === 0,
    missingFields: missing
  };
}
