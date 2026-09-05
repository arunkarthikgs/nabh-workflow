import { mkdir, readFile, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const dataDirectory = fileURLToPath(new URL("../../data", import.meta.url));
const dataPath = path.join(dataDirectory, "hospitals.json");

async function readHospitals() {
  try {
    return JSON.parse(await readFile(dataPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function saveHospitals(hospitals) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(dataPath, JSON.stringify(hospitals, null, 2));
}

function requiredText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function listHospitals() {
  return readHospitals();
}

export async function createHospital(input) {
  const name = requiredText(input.name);
  const code = requiredText(input.code).toUpperCase();
  if (!name || !code) throw new Error("Hospital name and client code are required.");

  const hospitals = await readHospitals();
  if (hospitals.some((hospital) => hospital.code === code)) throw new Error("Client code already exists.");

  const now = new Date().toISOString();
  const hospital = {
    id: randomUUID(),
    name,
    code,
    location: requiredText(input.location),
    status: input.status === "inactive" ? "inactive" : "active",
    repository: {
      url: requiredText(input.repositoryUrl),
      branch: requiredText(input.repositoryBranch) || "main"
    },
    users: [],
    createdAt: now,
    updatedAt: now
  };
  hospitals.push(hospital);
  await saveHospitals(hospitals);
  return hospital;
}

export async function updateHospital(id, input) {
  const hospitals = await readHospitals();
  const hospital = hospitals.find((item) => item.id === id);
  if (!hospital) return null;

  const name = requiredText(input.name);
  const code = requiredText(input.code).toUpperCase();
  if (!name || !code) throw new Error("Hospital name and client code are required.");
  if (hospitals.some((item) => item.id !== id && item.code === code)) throw new Error("Client code already exists.");

  hospital.name = name;
  hospital.code = code;
  hospital.location = requiredText(input.location);
  hospital.status = input.status === "inactive" ? "inactive" : "active";
  hospital.repository = {
    url: requiredText(input.repositoryUrl),
    branch: requiredText(input.repositoryBranch) || "main"
  };
  hospital.updatedAt = new Date().toISOString();
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
  const name = requiredText(input.name);
  const email = requiredText(input.email).toLowerCase();
  const role = requiredText(input.role);
  if (!name || !email || !role) throw new Error("User name, email, and role are required.");

  const hospitals = await readHospitals();
  const hospital = hospitals.find((item) => item.id === hospitalId);
  if (!hospital) return null;
  if (hospital.users.some((user) => user.email === email)) throw new Error("A user with this email already exists for this hospital.");

  const user = { id: randomUUID(), name, email, role, active: input.active !== false, createdAt: new Date().toISOString() };
  hospital.users.push(user);
  hospital.updatedAt = new Date().toISOString();
  await saveHospitals(hospitals);
  return user;
}

export async function updateHospitalUser(hospitalId, userId, input) {
  const hospitals = await readHospitals();
  const hospital = hospitals.find((item) => item.id === hospitalId);
  if (!hospital) return undefined;
  const user = hospital.users.find((item) => item.id === userId);
  if (!user) return null;

  const name = requiredText(input.name);
  const email = requiredText(input.email).toLowerCase();
  const role = requiredText(input.role);
  if (!name || !email || !role) throw new Error("User name, email, and role are required.");
  if (hospital.users.some((item) => item.id !== userId && item.email === email)) throw new Error("A user with this email already exists for this hospital.");

  Object.assign(user, { name, email, role, active: input.active !== false });
  hospital.updatedAt = new Date().toISOString();
  await saveHospitals(hospitals);
  return user;
}

export async function deleteHospitalUser(hospitalId, userId) {
  const hospitals = await readHospitals();
  const hospital = hospitals.find((item) => item.id === hospitalId);
  if (!hospital) return undefined;
  const users = hospital.users.filter((user) => user.id !== userId);
  if (users.length === hospital.users.length) return false;
  hospital.users = users;
  hospital.updatedAt = new Date().toISOString();
  await saveHospitals(hospitals);
  return true;
}