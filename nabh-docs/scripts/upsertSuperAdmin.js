// Creates or updates a real Super Admin user in the active PostgreSQL data store.
// Run with: DATA_STORE=postgres node scripts/upsertSuperAdmin.js
import { randomUUID } from "crypto";
import { dataStoreDriver, readHospitals, saveHospitalUser } from "../services/shared/dataStore.js";

if (dataStoreDriver() !== "postgres") {
  throw new Error("Set DATA_STORE=postgres before running this script.");
}

const sourceEmail = String(process.env.SUPERADMIN_SOURCE_EMAIL || "arunkarthikgs@gmail.com").toLowerCase();
const targetUserId = String(process.env.SUPERADMIN_USER_ID || "superadmin").toLowerCase();
const targetEmail = String(process.env.SUPERADMIN_EMAIL || "superadmin").toLowerCase();
const targetName = String(process.env.SUPERADMIN_NAME || "Super Admin");
const targetHospitalCode = String(process.env.SUPERADMIN_HOSPITAL_CODE || "").toUpperCase();

const hospitals = await readHospitals();
if (!hospitals.length) throw new Error("No hospitals found in PostgreSQL. Create or migrate hospitals first.");

const allUsers = hospitals.flatMap((hospital) => (hospital.users || []).map((user) => ({ hospital, user })));
const source = allUsers.find(({ user }) => String(user.email || "").toLowerCase() === sourceEmail && user.passwordHash && user.passwordSalt && user.passwordSet === true);
if (!source) throw new Error(`No password-ready source user found for ${sourceEmail}.`);

const existing = allUsers.find(({ user }) => String(user.userId || "").toLowerCase() === targetUserId || String(user.email || "").toLowerCase() === targetEmail || user.role === "Super Admin");
const targetHospital = existing?.hospital || hospitals.find((hospital) => String(hospital.code || "").toUpperCase() === targetHospitalCode) || hospitals.find((hospital) => hospital.status === "active") || hospitals[0];
const now = new Date().toISOString();

const user = {
  ...(existing?.user || {}),
  id: existing?.user?.id || randomUUID(),
  userId: targetUserId,
  name: targetName,
  email: targetEmail,
  role: "Super Admin",
  active: true,
  status: "active",
  contactPhone: existing?.user?.contactPhone || "",
  createdAt: existing?.user?.createdAt || now,
  updatedAt: now,
  passwordHash: source.user.passwordHash,
  passwordSalt: source.user.passwordSalt,
  passwordSet: true,
  emailVerifiedAt: existing?.user?.emailVerifiedAt || now,
};

delete user.passwordSetupToken;
delete user.passwordSetupExpiresAt;

await saveHospitalUser(targetHospital.id, user);

console.log(JSON.stringify({
  ok: true,
  userId: user.userId,
  email: user.email,
  role: user.role,
  hospital: targetHospital.name || targetHospital.code,
  passwordSourceEmail: sourceEmail,
  passwordReady: Boolean(user.passwordHash && user.passwordSalt && user.passwordSet === true),
}));