// Shared hospital field definitions. Split so Create Hospital / Register only capture identity and
// regulatory registration details, while the rest live exclusively in the self-service Institutional Profile.
export const hospitalRegistrationFields = [
  ["nabhAccredited", "NABH accredited", "select", ["Yes", "No"]],
  ["nabhNumber", "NABH accreditation number"],
  ["licenseNumber", "Registration / license number"],
  ["clinicalRegistration", "Clinical establishment registration"],
  ["panNumber", "PAN number"],
  ["gstNumber", "GST number"]
];

export const institutionalProfileFields = [
  ["hospitalType", "Hospital type"],
  ["ownershipType", "Ownership type", "select", ["Private", "Public", "Trust", "NGO"]],
  ["addressLine1", "Address line 1"],
  ["city", "City"],
  ["state", "State"],
  ["pinCode", "PIN code"],
  ["country", "Country"],
  ["mainPhone", "Main phone number"],
  ["officialEmail", "Official email"],
  ["operationalBeds", "Operational beds", "number"],
  ["operationalMonths", "Months operational", "number"],
  ["averageBedOccupancy", "Average bed occupancy over last 6 months (%)", "number"],
  ["icuBeds", "ICU beds", "number"],
  ["operatingTheatres", "Operating theatres", "number"],
  ["emergencyServices", "Emergency services", "select", ["Yes", "No"]],
  ["emergencyDepartment", "Emergency department", "select", ["Yes", "No"]],
  ["bloodBank", "Blood bank", "select", ["Yes", "No"]],
  ["standaloneFacility", "Standalone dedicated facility", "select", ["Yes", "No"]],
  ["outpatientOnly", "Outpatient-only (OPD/day-care) facility", "select", ["Yes", "No"]],
  ["otherClinicalSpecialties", "Other clinical specialties offered", "select", ["Yes", "No"]],
  ["publicHealthNetwork", "Government/public-health network", "select", ["Yes", "No"]],
  ["dcgiBloodCentreLicense", "Valid DCGI blood-centre licence", "select", ["Yes", "No"]],
  ["nacoOrStateRecognition", "NACO/state health-authority recognition", "select", ["Yes", "No"]],
  ["ayushInpatientBeds", "AYUSH inpatient beds", "number"],
  ["directorName", "Hospital director / administrator"],
  ["medicalSuperintendent", "Medical superintendent"],
  ["qualityLead", "NABH coordinator / quality manager"],
  ["responsiblePhone", "Responsible person phone"],
  ["responsibleEmail", "Responsible person email"],
  ["workingHours", "Working hours / 24x7"],
  ["specialties", "Departments / specialties offered"],
  ["servicesOffered", "Key services offered"],
  ["website", "Website"]
];

export const hospitalDetailFields = [...hospitalRegistrationFields, ...institutionalProfileFields];

export const emptyHospitalDetails = () => Object.fromEntries(hospitalDetailFields.map(([key]) => [key, ""]));

export const hospitalRegistrationSections = [["Accreditation & regulatory information", hospitalRegistrationFields]];

