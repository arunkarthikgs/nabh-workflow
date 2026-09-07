// Booking hub for Macula Healthcare expert engagements: hospital-led training sessions and consulting services.
import { randomUUID } from "crypto";
import { addBooking, readBookingById, readBookingsByHospital, updateBooking } from "./dataStore.js";
import { TRAINING_TOPICS, generateTrainingPack } from "./trainingContentService.js";

export const CONSULTING_CATALOG = [
  { id: "doc-review", name: "Documentation Review", description: "Expert review of policies, SOPs, and manuals against NABH standards." },
  { id: "gap-assessment", name: "Gap Assessment", description: "Structured gap assessment against the selected NABH accreditation standard." },
  { id: "mock-audit", name: "Mock Audit", description: "Simulated NABH assessment with a findings report." },
  { id: "implementation-guidance", name: "Implementation Guidance", description: "Hands-on guidance implementing NABH requirements department-by-department." },
  { id: "qm-mentoring", name: "Quality Manager Mentoring", description: "Ongoing mentoring for the hospital's Quality Manager." },
  { id: "readiness-review", name: "Accreditation Readiness Review", description: "Final readiness review before the NABH assessment." },
  { id: "onsite-consulting", name: "Onsite Consulting Support", description: "Macula Healthcare consultant on-site support." }
];

export const TRAINING_CATALOG = TRAINING_TOPICS.map((topic) => ({ id: topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), name: topic }));

function catalogFor(category) {
  return category === "training" ? TRAINING_CATALOG : category === "consulting" ? CONSULTING_CATALOG : null;
}

function text(value) { return typeof value === "string" ? value.trim() : ""; }

export async function listBookings(hospitalId) {
  return (await readBookingsByHospital(hospitalId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createBooking(hospitalId, input) {
  const category = input.category === "training" ? "training" : input.category === "consulting" ? "consulting" : null;
  if (!category) throw new Error('category must be "training" or "consulting".');
  const catalog = catalogFor(category);
  const service = catalog.find((item) => item.id === input.serviceId);
  if (!service) throw new Error("Unknown serviceId for this category.");
  const mode = input.mode === "onsite" ? "onsite" : "virtual";
  const now = new Date().toISOString();
  const booking = {
    id: randomUUID(), hospitalId, category, serviceId: service.id, serviceName: service.name, mode,
    preferredDate: text(input.preferredDate), notes: text(input.notes), status: "requested",
    feeBasis: "On request — confirmed by Macula Healthcare after review", recording: null,
    createdAt: now, updatedAt: now
  };
  await addBooking(booking);
  return booking;
}

const BOOKING_STATUSES = ["requested", "confirmed", "completed", "cancelled"];

export async function updateBookingStatus(bookingId, status, updatedBy) {
  if (!BOOKING_STATUSES.includes(status)) throw new Error(`status must be one of: ${BOOKING_STATUSES.join(", ")}`);
  const booking = await readBookingById(bookingId);
  if (!booking) return null;
  booking.status = status;
  booking.updatedBy = text(updatedBy) || "Hospital";
  booking.updatedAt = new Date().toISOString();
  await updateBooking(booking);
  return booking;
}

// Requires explicit consent before a recording reference is attached, per the concept note's consent requirement.
export async function attachBookingRecording(bookingId, { consent, reference, note }) {
  if (consent !== true) throw new Error("Recording consent is required before a recording can be attached.");
  const ref = text(reference);
  if (!ref) throw new Error("A recording reference (URL or storage path) is required.");
  const booking = await readBookingById(bookingId);
  if (!booking) return null;
  if (booking.category !== "training") throw new Error("Recordings can only be attached to training bookings.");
  booking.recording = { consent: true, reference: ref, note: text(note), recordedAt: new Date().toISOString() };
  booking.updatedAt = booking.recording.recordedAt;
  await updateBooking(booking);
  return booking;
}

export function generateTrainingMaterial(hospital, serviceId) {
  const service = TRAINING_CATALOG.find((item) => item.id === serviceId);
  if (!service) throw new Error("Unknown training serviceId.");
  return generateTrainingPack(hospital, service.name);
}
