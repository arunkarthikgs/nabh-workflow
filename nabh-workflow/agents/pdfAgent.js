import { createComplaintPDF } from "../services/complaint/pdfService.js";

export async function generateComplaintPDF(data) {
  return createComplaintPDF(data);
}
