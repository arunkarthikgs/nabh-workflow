import { log } from "../services/shared/logger.js";

export async function logHospitalPreRegistration(data) {
  log("Hospital pre-registration logged for audit", {
    fullName: data.fullName,
    idNumber: data.idNumber,
    proposedDate: data.proposedDate,
    department: data.department
  });
}
