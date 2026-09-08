// Rule-based recommendation of the applicable NABH accreditation programme from the institutional profile.
import { readHospitals, saveHospital } from "./dataStore.js";

// R2 stores templates per accreditation programme under Templates/<slug>/ - this must stay in sync
// with how client repositories are provisioned in r2TemplateService.js.
export function accreditationProgrammeSlug(programme) {
  return String(programme || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function hasAcceptedAccreditation(hospital) {
  return Boolean(hospital?.accreditation?.programme);
}

// The fixed catalog of NABH accreditation programmes a hospital may pursue.
export const NABH_ACCREDITATION_PROGRAMMES = [
  "Hospitals (HCO)",
  "Small Healthcare Organisations (SHCO) / Nursing Homes",
  "Blood Centres / Blood Banks",
  "Medical Imaging Services (MIS)",
  "Dental Healthcare Service Providers",
  "Allopathic Clinics",
  "AYUSH Hospitals",
  "Panchkarma Clinics",
  "Clinical Trials (Ethics Committees)",
  "Eye Care Organisations",
  "Care Homes",
  "Digital Health",
  "Oral Substitution Therapy Centres",
  "Community Health Centres / Primary Health Centres",
  "Wellness Centres"
];

const isYes = (value) => /^(yes|true|1)$/i.test(String(value || "").trim());
const number = (value) => Number(value) || 0;
const profileText = (details) => [details.hospitalType, details.specialties, details.servicesOffered].filter(Boolean).join(" ").toLowerCase();

function result(programme, rationale, requirements = []) {
  return { programme, rationale, requirements, status: requirements.length ? "conditional" : "eligible" };
}

function standaloneRequirements(details, label) {
  const requirements = [];
  if (!isYes(details.standaloneFacility)) requirements.push(`${label} must operate as a standalone dedicated facility.`);
  return requirements;
}

function generalFacilityRecommendation(details, text) {
  const beds = number(details.operationalBeds);
  const requirements = [];
  if (!beds) requirements.push("Record the sanctioned or operational bed count.");
  if (number(details.operationalMonths) < 6) requirements.push("Provide at least 6 months of operational data.");
  if (number(details.averageBedOccupancy) < 30) requirements.push("Demonstrate at least 30% average bed occupancy across the preceding 6 months.");
  if (/polyclinic|standalone.*(diagnostic|imaging|radiology)/i.test(text)) {
    return { programme: null, status: "ineligible", rationale: "Polyclinics and standalone diagnostic centres are excluded from the SHCO programme.", requirements: ["Use the applicable clinic or Medical Imaging Services programme instead."] };
  }
  if (beds > 50) return result("Hospitals (HCO)", `The facility reports ${beds} beds; Hospitals (HCO) applies only above 50 beds.`, requirements);
  return result("Small Healthcare Organisations (SHCO) / Nursing Homes", beds ? `The facility reports ${beds} beds, within the SHCO/Nursing Home limit of 50 beds or fewer.` : "A bed count is required to distinguish SHCO from Hospitals (HCO).", requirements);
}

export function recommendAccreditationProgramme(hospital) {
  const details = hospital?.details || {};
  const text = profileText(details);

  if (/community health|primary health|\bchc\b|\bphc\b/.test(text)) {
    if (!/public|government/.test(String(details.ownershipType || "").toLowerCase()) && !isYes(details.publicHealthNetwork)) {
      return { programme: null, status: "ineligible", rationale: "CHC/PHC accreditation is reserved for government or public-health-sector networks and designated rural public-health facilities.", requirements: ["Confirm government/public-health-network eligibility."] };
    }
    return result("Community Health Centres / Primary Health Centres", "The facility is a declared public-sector CHC/PHC or public-health-network facility.");
  }
  if (/eye|ophthalm/.test(text)) {
    const requirements = standaloneRequirements(details, "Eye care organisation");
    if (isYes(details.otherClinicalSpecialties)) requirements.push("Eye Care Organisations cannot offer other clinical specialties.");
    if (number(details.operationalMonths) < 3) requirements.push("Provide at least 3 months of functional operation.");
    return result("Eye Care Organisations", "The declared service profile is eye care/ophthalmology.", requirements);
  }
  if (/dental/.test(text)) {
    if (!isYes(details.standaloneFacility)) return generalFacilityRecommendation(details, text);
    return result("Dental Healthcare Service Providers", "The declared service profile is a standalone dental facility.", standaloneRequirements(details, "Dental healthcare provider"));
  }
  if (/blood\s*(bank|centre|center)/.test(text)) {
    const requirements = !isYes(details.dcgiBloodCentreLicense) ? ["Hold and record a valid DCGI blood-centre licence."] : [];
    return result("Blood Centres / Blood Banks", "The declared service profile is a blood centre or blood bank.", requirements);
  }
  if (/imaging|radiology|\bdiagnostic/.test(text)) return result("Medical Imaging Services (MIS)", "The declared service profile is medical imaging or diagnostic radiology.", standaloneRequirements(details, "Medical Imaging Service"));
  if (/oral substitution|\bost\b|opioid dependence/.test(text)) return result("Oral Substitution Therapy Centres", "The declared service profile is opioid-dependence treatment.", isYes(details.nacoOrStateRecognition) ? [] : ["Confirm recognition or support from NACO or the state health authority."]);
  if (/panchkarma/.test(text)) return result("Panchkarma Clinics", "The declared service profile is a Panchkarma clinic.", standaloneRequirements(details, "Panchkarma clinic"));
  if (/ayush|ayurved|homeopath|unani|siddha|yoga|naturopathy/.test(text)) return result("AYUSH Hospitals", "The declared service profile is an AYUSH system of medicine.", number(details.ayushInpatientBeds) > 0 ? [] : ["Provide inpatient beds dedicated to AYUSH therapies."]);
  if (/clinical trial|ethics committee|\biec\b/.test(text)) return result("Clinical Trials (Ethics Committees)", "The declared service profile is an Institutional Ethics Committee or clinical-trial site.");
  if (/care home|hospice|long.term care|geriatric|convalescent/.test(text)) return result("Care Homes", "The declared service profile is long-term, hospice, geriatric, disabled, or convalescent care.");
  if (/digital health|telemedicine|e-pharmacy|epharmacy/.test(text)) return result("Digital Health", "The declared service profile is virtual-first healthcare or a digital-health workflow.");
  if (/wellness|fitness|rejuvenation|preventive/.test(text)) return result("Wellness Centres", "The declared service profile is preventive, fitness, rejuvenation, or holistic wellness care.");
  if (/allopathic clinic|\bopd\b|outpatient/.test(text)) {
    const requirements = standaloneRequirements(details, "Allopathic clinic");
    if (!isYes(details.outpatientOnly)) requirements.push("Confirm that the facility is outpatient-only (OPD/day-care). ");
    if (isYes(details.otherClinicalSpecialties)) requirements.push("Standalone imaging and dental clinics are not eligible for the Allopathic Clinics programme.");
    return result("Allopathic Clinics", "The declared service profile is an outpatient allopathic clinic or day-care practice.", requirements);
  }
  return generalFacilityRecommendation(details, text);
}

export async function getAccreditationState(hospitalId) {
  const hospitals = await readHospitals();
  const hospital = hospitals.find((item) => item.id === hospitalId);
  if (!hospital) return null;
  return { recommendation: recommendAccreditationProgramme(hospital), selection: hospital.accreditation || null, programmes: NABH_ACCREDITATION_PROGRAMMES };
}

export async function selectAccreditationProgramme(hospitalId, programme, decidedBy, notes) {
  if (!NABH_ACCREDITATION_PROGRAMMES.includes(programme)) throw new Error(`programme must be one of: ${NABH_ACCREDITATION_PROGRAMMES.join(", ")}`);
  const hospitals = await readHospitals();
  const hospital = hospitals.find((item) => item.id === hospitalId);
  if (!hospital) return null;
  if (hospital.accreditation?.programme && hospital.accreditation.programme !== programme) {
    const error = new Error(`The accreditation programme is already locked as "${hospital.accreditation.programme}". It cannot be changed after confirmation.`);
    error.status = 409;
    error.reason = "accreditation_locked";
    throw error;
  }
  if (hospital.accreditation?.programme === programme) return hospital.accreditation;
  hospital.accreditation = { programme, decidedBy: typeof decidedBy === "string" && decidedBy.trim() ? decidedBy.trim() : "Hospital", notes: typeof notes === "string" ? notes.trim() : "", decidedAt: new Date().toISOString() };
  hospital.updatedAt = hospital.accreditation.decidedAt;
  await saveHospital(hospital);
  return hospital.accreditation;
}
