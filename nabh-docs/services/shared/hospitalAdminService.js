import { randomUUID } from "crypto";
import { readDocumentMatches, readHospitals, saveHospitals } from "../shared/dataStore.js";

const seededLogos = [
  ["aarogyam_hospital.png", "Aarogyam Hospital"], ["asha_oncology_hospital.png", "Asha Oncology Hospital"], ["dhanvantari_health_clinic.png", "Dhanvantari Health Clinic"], ["kaveri_cardiac_institute.png", "Kaveri Cardiac Institute"], ["lotus_eye_care.png", "Lotus Eye Care"],
  ["maitri_mental_health.png", "Maitri Mental Health"], ["prana_mother_child_care.png", "Prana Mother Child Care"], ["surya_multispecialty.png", "Surya Multispecialty"], ["trishul_orthopedic_centre.png", "Trishul Orthopedic Centre"], ["vaidya_rural_health.png", "Vaidya Rural Health"]
];
const defaultRoles = [
  "Hospital Administrator", "Quality Manager", "NABH Coordinator", "Internal Auditor", "HR Manager", "IT Administrator", "Medical Records Officer (MRD)", "Front Office Executive", "Billing Executive", "Consultant Doctors", "Resident Medical Officer (RMO)", "Nurses", "Anesthesiologist", "Surgeon", "Physiotherapist", "Dietician", "Emergency Medical Officer", "Trauma Nurse", "Intensivist", "Critical Care Nurse", "Lab Technician", "Pathologist", "Radiologist", "Radiology Technician", "Pharmacist", "Pharmacy Store Manager", "Clinical Pharmacist", "Infection Control Nurse (ICN)", "Patient Safety Officer", "Safety Officer", "Biomedical Engineer"
].map((name) => ({ id: randomUUID(), name, reports: name.includes("Quality") || name.includes("NABH") || name.includes("Auditor") ? ["Master List", "Compliance Summary", "Document Matches"] : name.includes("Records") ? ["Master List", "Document Matches"] : ["Master List"] }));
const roleActions = ["view", "edit", "delete", "destroy"];
const privilegedRoles = new Set(["Hospital Administrator", "IT Administrator"]);

function defaultPermissions(roleName) {
  if (privilegedRoles.has(roleName)) return roleActions;
  if (roleName.includes("Quality") || roleName.includes("NABH") || roleName.includes("Auditor")) return ["view", "edit"];
  return ["view"];
}

function rolesForHospital(hospital) {
  if (!Array.isArray(hospital.roles)) hospital.roles = defaultRoles.map((role) => ({ ...role, id: randomUUID(), documentAccess: {}, permissions: defaultPermissions(role.name) }));
  return hospital.roles;
}

function documentAccess(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([department, documentIds]) => [text(department), Array.isArray(documentIds) ? documentIds.filter((id) => typeof id === "string") : []]).filter(([department]) => department));
}

function permissions(value, roleName) {
  if (!Array.isArray(value)) return defaultPermissions(roleName);
  const selected = roleActions.filter((action) => value.includes(action));
  return selected.some((action) => action !== "view") && !selected.includes("view") ? ["view", ...selected] : selected;
}

const allDocumentRoles = new Set(["Quality Manager", "NABH Coordinator", "Internal Auditor", "HR Manager", "IT Administrator"]);

async function allDocumentsByDepartment() {
  const departments = await readDocumentMatches();
  if (!departments) return {};
  return Object.fromEntries(Object.entries(departments).map(([department, documents]) => [department, documents.map((document) => document.id)]));
}

function selectedDocumentsByDepartment(documents, offset) {
  return Object.fromEntries(Object.entries(documents).map(([department, ids], departmentIndex) => {
    const count = Math.min(ids.length, 2 + ((offset + departmentIndex) % 3));
    const start = (offset * 5 + departmentIndex * 3) % ids.length;
    return [department, Array.from({ length: count }, (_, index) => ids[(start + index) % ids.length])];
  }));
}

function text(value) { return typeof value === "string" ? value.trim() : ""; }

function logoDataUrl(value) {
  const logo = text(value);
  if (!logo) return "";
  if (!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(logo)) throw new Error("Logo must be a PNG, JPEG, or WebP image.");
  if (logo.length > 2_000_000) throw new Error("Logo must be smaller than 1.5 MB.");
  return logo;
}

export async function listHospitals() {
  const hospitals = await readHospitals();
  if (hospitals.length) {
    let changed = false;
    hospitals.forEach((hospital, hospitalIndex) => {
      if (!Array.isArray(hospital.roles)) { rolesForHospital(hospital); changed = true; }
      hospital.roles.forEach((role) => {
        if (!Array.isArray(role.permissions)) { role.permissions = defaultPermissions(role.name); changed = true; }
      });
      const [logoFile, logoName] = seededLogos[hospitalIndex] || [];
      if (logoFile && hospital.logoPath !== `/logos/${logoFile}`) { hospital.logoPath = `/logos/${logoFile}`; hospital.name = logoName; changed = true; }
      const address = `${101 + hospitalIndex * 17}, ${hospital.details?.city || "Bengaluru"} Main Road, Karnataka ${560001 + hospitalIndex * 111}`;
      if (!hospital.details?.addressLine1) { hospital.details = { ...hospital.details, addressLine1: address, pinCode: String(560001 + hospitalIndex * 111), mainPhone: `080-4${hospitalIndex}20-1000`, officialEmail: `contact@${hospital.code.toLowerCase()}.example.test` }; changed = true; }
      hospital.users.forEach((user, userIndex) => {
        if (user.employeeId) return;
        Object.assign(user, { dateOfBirth: `19${80 + userIndex}-0${(userIndex % 8) + 1}-1${userIndex % 9}`, gender: userIndex % 3 === 0 ? "Female" : userIndex % 3 === 1 ? "Male" : "Other", mobileNumber: `9${800000000 + hospitalIndex * 10000 + userIndex}`, address, employeeId: `${hospital.code}-${String(userIndex + 1).padStart(3, "0")}`, department: user.role.includes("Nurse") ? "Nursing" : user.role.includes("Quality") || user.role.includes("NABH") ? "Quality" : user.role.includes("Records") ? "Medical Records" : "Clinical Services", dateOfJoining: `202${userIndex % 4}-0${(userIndex % 8) + 1}-15`, employmentType: user.role.includes("Consultant") ? "Consultant" : "Full-time" });
        changed = true;
      });
    });
    if (changed) await saveHospitals(hospitals);
    return hospitals;
  }
  const now = new Date().toISOString();
  const hospitalData = [
    ["Janapriya Hospital", "JPH", "Bengaluru"], ["Sahyadri Care Hospital", "SCH", "Mysuru"], ["Namma Health Medical Centre", "NHM", "Hubballi"], ["Malnad Multispecialty Hospital", "MMH", "Shivamogga"], ["Coastal Life Hospital", "CLH", "Mangaluru"],
    ["Kaveri Valley Hospital", "KVH", "Mandya"], ["Tunga River Hospital", "TRH", "Davanagere"], ["Vijayanagara Medical Institute", "VMI", "Ballari"], ["Kodagu Community Hospital", "KCH", "Madikeri"], ["North Karnataka Care Hospital", "NKC", "Kalaburagi"]
  ];
  const staff = [
    ["Dr. Ananya Rao", "Hospital Administrator"], ["Dr. Vikram Shetty", "Medical Superintendent"], ["Meera Kulkarni", "Quality Manager"], ["Prakash Nair", "NABH Coordinator"], ["Dr. Farah Khan", "Consultant Doctors"], ["Nisha Thomas", "Nurses"], ["Arjun Desai", "Internal Auditor"], ["Kavya Menon", "Infection Control Nurse (ICN)"], ["Rohit Bhat", "Biomedical Engineer"], ["Sonal Iyer", "Medical Records Officer (MRD)"]
  ];
  const seeded = hospitalData.map(([_name, code, city], index) => ({
    id: randomUUID(), name: seededLogos[index][1], code, location: `${city}, Karnataka`, status: "active", logoDataUrl: "", logoPath: `/logos/${seededLogos[index][0]}`, repository: { url: `https://example.invalid/nabh/${code.toLowerCase()}.git`, branch: "main" },
    details: { hospitalType: "Multi-specialty", city, state: "Karnataka", country: "India", emergencyServices: "Yes", workingHours: "24x7", emergencyDepartment: "Yes", operationalBeds: String(80 + index * 20), icuBeds: String(8 + index * 2), operatingTheatres: String(2 + index % 3), ownershipType: "Private" },
    users: staff.map(([staffName, role], staffIndex) => ({ id: randomUUID(), name: staffName, email: `${staffName.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}.${code.toLowerCase()}@example.test`, role, active: true, createdAt: now })), createdAt: now, updatedAt: now
  }));
  await saveHospitals(seeded);
  return seeded;
}

export async function createHospital(input) {
  const name = text(input.name);
  const code = text(input.code).toUpperCase();
  if (!name || !code) throw new Error("Hospital name and client code are required.");
  const hospitals = await readHospitals();
  if (hospitals.some((hospital) => hospital.code === code)) throw new Error("Client code already exists.");
  const now = new Date().toISOString();
  const hospital = { id: randomUUID(), name, code, location: text(input.location), status: input.status === "inactive" ? "inactive" : "active", logoDataUrl: logoDataUrl(input.logoDataUrl), repository: { url: text(input.repositoryUrl), branch: text(input.repositoryBranch) || "main" }, details: input.details && typeof input.details === "object" ? input.details : {}, users: [], createdAt: now, updatedAt: now };
  hospitals.push(hospital);
  await saveHospitals(hospitals);
  return hospital;
}

export async function updateHospital(id, input) {
  const hospitals = await readHospitals();
  const hospital = hospitals.find((item) => item.id === id);
  if (!hospital) return null;
  const name = text(input.name);
  const code = text(input.code).toUpperCase();
  if (!name || !code) throw new Error("Hospital name and client code are required.");
  if (hospitals.some((item) => item.id !== id && item.code === code)) throw new Error("Client code already exists.");
  Object.assign(hospital, { name, code, location: text(input.location), status: input.status === "inactive" ? "inactive" : "active", logoDataUrl: logoDataUrl(input.logoDataUrl), repository: { url: text(input.repositoryUrl), branch: text(input.repositoryBranch) || "main" }, details: input.details && typeof input.details === "object" ? input.details : {}, updatedAt: new Date().toISOString() });
  await saveHospitals(hospitals);
  return hospital;
}

export async function deleteHospital(id) {
  const hospitals = await readHospitals();
  const remaining = hospitals.filter((hospital) => hospital.id !== id);
  if (remaining.length === hospitals.length) return false;
  await saveHospitals(remaining);
  return true;
}

export async function addHospitalUser(hospitalId, input) {
  const name = text(input.name), email = text(input.email).toLowerCase(), role = text(input.role);
  if (!name || !email || !role) throw new Error("User name, email, and role are required.");
  const hospitals = await readHospitals();
  const hospital = hospitals.find((item) => item.id === hospitalId);
  if (!hospital) return null;
  if (hospital.users.some((user) => user.email === email)) throw new Error("A user with this email already exists for this hospital.");
  const user = { id: randomUUID(), name, email, role, active: input.active !== false, dateOfBirth: text(input.dateOfBirth), gender: text(input.gender), mobileNumber: text(input.mobileNumber), address: text(input.address), employeeId: text(input.employeeId), department: text(input.department), dateOfJoining: text(input.dateOfJoining), employmentType: text(input.employmentType), createdAt: new Date().toISOString() };
  hospital.users.push(user); hospital.updatedAt = new Date().toISOString();
  await saveHospitals(hospitals);
  return user;
}

export async function updateHospitalUser(hospitalId, userId, input) {
  const hospitals = await readHospitals();
  const hospital = hospitals.find((item) => item.id === hospitalId);
  if (!hospital) return undefined;
  const user = hospital.users.find((item) => item.id === userId);
  if (!user) return null;
  const name = text(input.name), email = text(input.email).toLowerCase(), role = text(input.role);
  if (!name || !email || !role) throw new Error("User name, email, and role are required.");
  if (hospital.users.some((item) => item.id !== userId && item.email === email)) throw new Error("A user with this email already exists for this hospital.");
  Object.assign(user, { name, email, role, active: input.active !== false, dateOfBirth: text(input.dateOfBirth), gender: text(input.gender), mobileNumber: text(input.mobileNumber), address: text(input.address), employeeId: text(input.employeeId), department: text(input.department), dateOfJoining: text(input.dateOfJoining), employmentType: text(input.employmentType) }); hospital.updatedAt = new Date().toISOString();
  await saveHospitals(hospitals);
  return user;
}

export async function deleteHospitalUser(hospitalId, userId) {
  const hospitals = await readHospitals();
  const hospital = hospitals.find((item) => item.id === hospitalId);
  if (!hospital) return undefined;
  const users = hospital.users.filter((user) => user.id !== userId);
  if (users.length === hospital.users.length) return false;
  hospital.users = users; hospital.updatedAt = new Date().toISOString();
  await saveHospitals(hospitals);
  return true;
}

export async function listHospitalRoles(hospitalId) {
  const hospitals = await listHospitals();
  const hospital = hospitals.find((item) => item.id === hospitalId);
  if (!hospital) return null;
  const roles = rolesForHospital(hospital);
  const allDocuments = await allDocumentsByDepartment();
  if (!Object.keys(allDocuments).length) return roles;
  let changed = false;
  roles.forEach((role, roleIndex) => {
    if (allDocumentRoles.has(role.name) && !role.defaultAccessApplied) {
      role.documentAccess = allDocuments;
      role.defaultAccessApplied = true;
      changed = true;
    }
    if (!allDocumentRoles.has(role.name) && role.name !== "Hospital Administrator" && !role.defaultAccessApplied) {
      role.documentAccess = selectedDocumentsByDepartment(allDocuments, roleIndex);
      role.defaultAccessApplied = true;
      changed = true;
    }
  });
  if (changed) await saveHospitals(hospitals);
  return roles;
}

export async function createHospitalRole(hospitalId, input) {
  const hospitals = await readHospitals();
  const hospital = hospitals.find((item) => item.id === hospitalId);
  if (!hospital) return null;
  const name = text(input.name);
  if (!name) throw new Error("Role name is required.");
  const roles = rolesForHospital(hospital);
  if (roles.some((role) => role.name.toLowerCase() === name.toLowerCase())) throw new Error("This role already exists.");
  const role = { id: randomUUID(), name, reports: Array.isArray(input.reports) ? input.reports.filter((report) => typeof report === "string") : [], documentAccess: documentAccess(input.documentAccess), permissions: permissions(input.permissions, name) };
  roles.push(role); await saveHospitals(hospitals); return role;
}

export async function updateHospitalRole(hospitalId, roleId, input) {
  const hospitals = await readHospitals();
  const hospital = hospitals.find((item) => item.id === hospitalId);
  if (!hospital) return undefined;
  const role = rolesForHospital(hospital).find((item) => item.id === roleId);
  if (!role) return null;
  const name = text(input.name);
  if (!name) throw new Error("Role name is required.");
  Object.assign(role, { name, reports: Array.isArray(input.reports) ? input.reports.filter((report) => typeof report === "string") : [], documentAccess: documentAccess(input.documentAccess), permissions: permissions(input.permissions, name) });
  await saveHospitals(hospitals); return role;
}

export async function deleteHospitalRole(hospitalId, roleId) {
  const hospitals = await readHospitals();
  const hospital = hospitals.find((item) => item.id === hospitalId);
  if (!hospital) return undefined;
  const roles = rolesForHospital(hospital);
  const remaining = roles.filter((role) => role.id !== roleId);
  if (remaining.length === roles.length) return false;
  hospital.roles = remaining; await saveHospitals(hospitals); return true;
}