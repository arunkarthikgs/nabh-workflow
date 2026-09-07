// Rule-based recommendation of the applicable NABH accreditation programme from the institutional profile.
import { readHospitals, saveHospitals } from "./dataStore.js";

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

// Keyword hints from the hospital type field that point directly at a specialised programme,
// checked before falling back to the bed-count based HCO vs SHCO split.
const TYPE_HINTS = [
  [/blood\s*(bank|centre|center)/i, "Blood Centres / Blood Banks"],
  [/imaging|radiology|diagnostic/i, "Medical Imaging Services (MIS)"],
  [/dental/i, "Dental Healthcare Service Providers"],
  [/allopathic clinic|clinic/i, "Allopathic Clinics"],
  [/ayush|ayurved|homeopath|unani|siddha|yoga|naturopathy/i, "AYUSH Hospitals"],
  [/panchkarma/i, "Panchkarma Clinics"],
  [/clinical trial|ethics committee/i, "Clinical Trials (Ethics Committees)"],
  [/eye care|ophthalmic/i, "Eye Care Organisations"],
  [/care home/i, "Care Homes"],
  [/digital health|telemedicine/i, "Digital Health"],
  [/oral substitution/i, "Oral Substitution Therapy Centres"],
  [/community health|primary health/i, "Community Health Centres / Primary Health Centres"],
  [/wellness/i, "Wellness Centres"]
];

export function recommendAccreditationProgramme(hospital) {
  const details = hospital?.details || {};
  const hospitalType = details.hospitalType || "";
  for (const [pattern, programme] of TYPE_HINTS) {
    if (pattern.test(hospitalType)) return { programme, rationale: `The declared hospital type ("${hospitalType}") matches the "${programme}" NABH programme.` };
  }
  const beds = Number(details.operationalBeds) || 0;
  if (beds <= 0) {
    return {
      programme: "Small Healthcare Organisations (SHCO) / Nursing Homes",
      rationale: "Operational bed count has not been captured yet, so the SHCO/Nursing Home programme is recommended as the lightest-weight starting point while the institutional profile is completed."
    };
  }
  if (beds <= 50) {
    return {
      programme: "Small Healthcare Organisations (SHCO) / Nursing Homes",
      rationale: `With ${beds} operational bed(s), this facility falls within NABH's Small Healthcare Organisation (SHCO) scope.`
    };
  }
  const hasIcu = Number(details.icuBeds) > 0;
  const hasEmergency = /yes/i.test(details.emergencyServices || "");
  return {
    programme: "Hospitals (HCO)",
    rationale: `With ${beds} operational beds${hasIcu ? ", ICU services" : ""}${hasEmergency ? ", and 24x7 emergency services" : ""}, this facility meets the scale for the full Hospitals (HCO) accreditation programme.`
  };
}

export async function getAccreditationState(hospitalId) {
  const hospitals = await readHospitals();
  const hospital = hospitals.find((item) => item.id === hospitalId);
  if (!hospital) return null;
  return { recommendation: recommendAccreditationProgramme(hospital), selection: hospital.accreditation || null, programmes: NABH_ACCREDITATION_PROGRAMMES };
}

export async function selectAccreditationProgramme(hospitalId, programme, decidedBy) {
  if (!NABH_ACCREDITATION_PROGRAMMES.includes(programme)) throw new Error(`programme must be one of: ${NABH_ACCREDITATION_PROGRAMMES.join(", ")}`);
  const hospitals = await readHospitals();
  const hospital = hospitals.find((item) => item.id === hospitalId);
  if (!hospital) return null;
  hospital.accreditation = { programme, decidedBy: typeof decidedBy === "string" && decidedBy.trim() ? decidedBy.trim() : "Hospital", decidedAt: new Date().toISOString() };
  hospital.updatedAt = hospital.accreditation.decidedAt;
  await saveHospitals(hospitals);
  return hospital.accreditation;
}
