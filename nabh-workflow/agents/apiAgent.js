import express from "express";
import { fileURLToPath } from "url";
import { applyNABHCompliance } from "./complianceAgent.js";
import { generateComplaintPDF } from "./pdfAgent.js";
import { validateComplaint } from "./validationAgent.js";
import { applyAdmissionAdviceCompliance } from "./admissionAdviceComplianceAgent.js";
import { validateAdmissionAdvice } from "./admissionAdviceValidationAgent.js";
import { logAdmissionAdvice } from "./admissionAdviceAuditAgent.js";
import { applyHospitalPreRegistrationCompliance } from "./hospitalPreRegistrationComplianceAgent.js";
import { validateHospitalPreRegistration } from "./hospitalPreRegistrationValidationAgent.js";
import { logHospitalPreRegistration } from "./hospitalPreRegistrationAuditAgent.js";
import { createAdmissionAdvicePDF } from "../services/admission-advice/pdfService.js";
import { createHospitalPreRegistrationPDF } from "../services/hospital-pre-registration/pdfService.js";
import { isCloudStorageConfigured, uploadPdf } from "../services/storage/cloudStorageService.js";
import { addHospitalUser, createHospital, deleteHospital, deleteHospitalUser, listHospitals, updateHospital, updateHospitalUser } from "../services/shared/hospitalAdminService.js";

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeComplaintInput(data) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value == null ? "" : String(value)])
  );
}

function sendPdf(response, pdf, filename) {
  response
    .status(200)
    .type("application/pdf")
    .set("Content-Disposition", `attachment; filename="${filename}"`)
    .send(Buffer.from(pdf));
}

async function sendGeneratedPdf(request, response, pdf, filename, documentType) {
  if (request.query.store !== "true") {
    sendPdf(response, pdf, filename);
    return;
  }

  if (!isCloudStorageConfigured()) {
    response.status(400).json({
      error: "Cloud storage is not configured. Set CLOUD_STORAGE_PROVIDER to s3, azure, or gcs."
    });
    return;
  }

  response.status(201).json({ document: await uploadPdf({ documentType, pdf }) });
}

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/api/v1/admin/hospitals", async (_request, response, next) => {
    try {
      response.json({ hospitals: await listHospitals() });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/admin/hospitals", async (request, response, next) => {
    try {
      response.status(201).json({ hospital: await createHospital(request.body || {}) });
    } catch (error) {
      if (error instanceof Error) response.status(400).json({ error: error.message });
      else next(error);
    }
  });

  app.patch("/api/v1/admin/hospitals/:hospitalId", async (request, response, next) => {
    try {
      const hospital = await updateHospital(request.params.hospitalId, request.body || {});
      if (!hospital) return response.status(404).json({ error: "Hospital not found." });
      response.json({ hospital });
    } catch (error) {
      if (error instanceof Error) response.status(400).json({ error: error.message });
      else next(error);
    }
  });

  app.delete("/api/v1/admin/hospitals/:hospitalId", async (request, response, next) => {
    try {
      if (!await deleteHospital(request.params.hospitalId)) return response.status(404).json({ error: "Hospital not found." });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/admin/hospitals/:hospitalId/users", async (request, response, next) => {
    try {
      const user = await addHospitalUser(request.params.hospitalId, request.body || {});
      if (!user) return response.status(404).json({ error: "Hospital not found." });
      response.status(201).json({ user });
    } catch (error) {
      if (error instanceof Error) response.status(400).json({ error: error.message });
      else next(error);
    }
  });

  app.patch("/api/v1/admin/hospitals/:hospitalId/users/:userId", async (request, response, next) => {
    try {
      const user = await updateHospitalUser(request.params.hospitalId, request.params.userId, request.body || {});
      if (user === undefined) return response.status(404).json({ error: "Hospital not found." });
      if (!user) return response.status(404).json({ error: "User not found." });
      response.json({ user });
    } catch (error) {
      if (error instanceof Error) response.status(400).json({ error: error.message });
      else next(error);
    }
  });

  app.delete("/api/v1/admin/hospitals/:hospitalId/users/:userId", async (request, response, next) => {
    try {
      const deleted = await deleteHospitalUser(request.params.hospitalId, request.params.userId);
      if (deleted === undefined) return response.status(404).json({ error: "Hospital not found." });
      if (!deleted) return response.status(404).json({ error: "User not found." });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/complaints/pdf", async (request, response, next) => {
    try {
      if (!isRecord(request.body)) {
        response.status(400).json({ error: "Request body must be a JSON object." });
        return;
      }

      const complaint = applyNABHCompliance(normalizeComplaintInput(request.body));
      const validation = validateComplaint(complaint);
      if (!validation.isValid) {
        response.status(422).json({
          error: "Required complaint fields are missing.",
          missingFields: validation.missingFields
        });
        return;
      }

      await sendGeneratedPdf(
        request,
        response,
        await generateComplaintPDF(complaint),
        "Complaint_NABH.pdf",
        "complaints"
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/admission-advice/pdf", async (request, response, next) => {
    try {
      if (!isRecord(request.body)) {
        response.status(400).json({ error: "Request body must be a JSON object." });
        return;
      }

      const admissionAdvice = applyAdmissionAdviceCompliance(request.body);
      const validation = validateAdmissionAdvice(admissionAdvice);
      if (!validation.isValid) {
        response.status(422).json({
          error: "Required admission advice fields are missing.",
          missingFields: validation.missingFields
        });
        return;
      }

      await logAdmissionAdvice(admissionAdvice);
      await sendGeneratedPdf(
        request,
        response,
        await createAdmissionAdvicePDF(admissionAdvice),
        "Admission_Advice_Note.pdf",
        "admission-advice"
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/hospital-pre-registration/pdf", async (request, response, next) => {
    try {
      if (!isRecord(request.body)) {
        response.status(400).json({ error: "Request body must be a JSON object." });
        return;
      }

      const preRegistration = applyHospitalPreRegistrationCompliance(request.body);
      const validation = validateHospitalPreRegistration(preRegistration);
      if (!validation.isValid) {
        response.status(422).json({
          error: "Required pre-registration fields are missing.",
          missingFields: validation.missingFields
        });
        return;
      }

      await logHospitalPreRegistration(preRegistration);
      await sendGeneratedPdf(
        request,
        response,
        await createHospitalPreRegistrationPDF(preRegistration),
        "Hospital_Pre_Registration.pdf",
        "hospital-pre-registration"
      );
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(500).json({ error: "Unable to generate the PDF." });
  });

  return app;
}

function startServer() {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "127.0.0.1";
  createApiApp().listen(port, host, () => {
    console.log(`NABH PDF API listening on http://${host}:${port}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}