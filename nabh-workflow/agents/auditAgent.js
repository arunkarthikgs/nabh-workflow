import { log } from "../services/shared/logger.js";

export async function logComplaint(data) {
  log("Complaint logged for audit", {
    complaintId: data.complaintId,
    patientName: data.patientName,
    dateOfComplaint: data.dateOfComplaint,
    closureStatus: data.closureStatus
  });
}
