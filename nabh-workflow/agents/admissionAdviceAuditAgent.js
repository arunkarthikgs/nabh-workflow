import { log } from "../services/shared/logger.js";

export async function logAdmissionAdvice(data) {
  log("Admission advice logged for audit", {
    patientFullName: data.patientFullName,
    uhid: data.uhid,
    dateOfAdvice: data.dateOfAdvice,
    priorityStatus: data.priorityStatus
  });
}
