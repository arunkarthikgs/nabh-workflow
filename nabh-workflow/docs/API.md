# NABH Document Workflows — API Specification

Base URL: `http://127.0.0.1:3000` (configurable via `HOST` / `PORT`)

All endpoints are served by `agents/apiAgent.js`.

---

## `GET /health`

Health check. No authentication, no request body.

**Response `200`**
```json
{ "status": "ok" }
```

---

## `POST /api/v1/complaints/pdf`

Generates the Patient Complaint / Grievance Redressal PDF.

Pipeline: `complianceAgent` → `validationAgent` → `pdfAgent`

| Field | Type | Required | Allowed values / notes |
|---|---|---|---|
| `complaintId` | string | Yes | Free text |
| `dateOfComplaint` | string (`YYYY-MM-DD`) | Yes | |
| `timeOfLodging` | string (`HH:MM`) | Yes | |
| `timeAmPm` | string (enum) | Yes | `AM`, `PM` |
| `reportedBy` | string | Yes | Complainant name |
| `relationshipToPatient` | string (enum) | Yes | `Self`, `Spouse`, `Parent`, `Child`, `Other` |
| `relationshipOtherText` | string | No | Used when `relationshipToPatient` is `Other` |
| `patientName` | string | Yes | |
| `uhid` | string | Yes | Unique Health ID |
| `ipdOpdNumber` | string | Yes | |
| `contactNumber` | string | Yes | Phone number |
| `emailAddress` | string | No | |
| `complaintCategory` | string (enum) | Yes | `Clinical Care`, `Staff Behavior`, `Billing & Tariff`, `Facility & Amenities`, `Operational Delays`, `Patient Rights Violation` |
| `complaintDescription` | string | Yes | Free text, multi-line |
| `modeOfReceipt` | string (enum) | Yes | `Suggestion Box`, `Verbal`, `Email`, `Direct Submission` |
| `receivedByNameDesignation` | string | No | |
| `responsibleDepartment` | string | Yes | |
| `investigationSummary` | string | No | Free text, multi-line |
| `rootCause` | string | No | Free text, multi-line |
| `correctiveAction` | string | No | Free text, multi-line |
| `preventiveAction` | string | No | Free text, multi-line |
| `closureStatus` | string | No | |
| `closureDate` | string (`YYYY-MM-DD`) | Yes | |
| `qualityReviewer` | string | No | |

---

## `POST /api/v1/admission-advice/pdf`

Generates the Admission Advice Note (AAC chapter) PDF. **All fields are required.**

Pipeline: `admissionAdviceComplianceAgent` → `admissionAdviceValidationAgent` → `admissionAdviceAuditAgent` → PDF generation

| Field | Type | Required | Allowed values / notes |
|---|---|---|---|
| `patientFullName` | string | Yes | |
| `uhid` | string | Yes | |
| `age` | number (or numeric string) | Yes | |
| `biologicalGender` | string (enum) | Yes | `M`, `F` |
| `dateOfAdvice` | string (`YYYY-MM-DD`) | Yes | |
| `timeOfAdvice` | string (`HH:MM`) | Yes | |
| `admittingDepartment` | string | Yes | |
| `attendingConsultant` | string | Yes | |
| `source` | string (enum) | Yes | `OPD`, `Emergency / ER`, `Day Care` |
| `contactNumber` | string | Yes | |
| `provisionalDiagnosis` | string | Yes | Free text, multi-line |
| `clinicalStatus` | string | Yes | Free text, multi-line |
| `priorityStatus` | string (enum) | Yes | `Routine / Planned Admission`, `Urgent / Emergency Admission` |
| `assignedWard` | string (enum) | Yes | `General`, `Semi-Private`, `Private Room`, `ICU / ICCU`, `Day Care` |
| `safetyPrecautions` | array of string (enum) | Yes | Any of `Fall Risk`, `Isolation Needed`, `Vulnerable Patient`, `None`; must be a non-empty array |
| `vitalsMonitoringFrequency` | string (enum) | Yes | `Continuous`, `Every 1 Hour`, `Every 4 Hours`, `Stable Routine` |
| `dietaryDirective` | string (enum) | Yes | `NPO (Fasting)`, `Soft Diet`, `Regular Diet`, `Diabetic Diet` |
| `urgentInvestigations` | string | Yes | Free text, multi-line |
| `statMedications` | string | Yes | Free text, multi-line |
| `expectedPaymentPathway` | string (enum) | Yes | `Self-Paying / Cash`, `TPA / Insurance`, `Corporate / Government (CGHS)` |
| `financialCounselingCompleted` | string (enum) | Yes | `Yes`, `No` |
| `estimatedTreatmentCost` | number (or numeric string) | Yes | Amount in Rs. |

---

## `POST /api/v1/hospital-pre-registration/pdf`

Generates the Hospital Pre-Registration Form PDF.

Pipeline: `hospitalPreRegistrationComplianceAgent` → `hospitalPreRegistrationValidationAgent` → `hospitalPreRegistrationAuditAgent` → PDF generation

| Field | Type | Required | Allowed values / notes |
|---|---|---|---|
| `fullName` | string | Yes | |
| `gender` | string (enum) | Yes | `Male`, `Female`, `Other` |
| `dateOfBirth` | string (`YYYY-MM-DD`) | Yes | |
| `idNumber` | string | Yes | Aadhar / Passport number |
| `contactNumber` | string | Yes | |
| `emailAddress` | string | No | |
| `permanentAddress` | string | Yes | Free text, multi-line |
| `admittingDoctor` | string | Yes | |
| `department` | string | Yes | |
| `proposedDate` | string (`YYYY-MM-DD`) | Yes | |
| `stayType` | string (enum) | Yes | `Daycare`, `Inpatient (IPD)` |
| `paymentMode` | string (enum) | Yes | `Cash / Self-Pay`, `Insurance / TPA`, `Corporate Panel` |
| `insuranceCompany` | string | No | |
| `tpaName` | string | No | |
| `policyId` | string | No | Policy / Corporate ID |
| `preAuthStatus` | string (enum) | No | `Initiated`, `Pending`, `N/A` |
| `emergencyContactName` | string | Yes | |
| `relationship` | string | Yes | |
| `contactPhone1` | string | Yes | |
| `contactPhone2` | string | No | |

---

## Common behavior (all three `POST` endpoints)

| Scenario | Status | Response |
|---|---|---|
| Success | `200` | Binary PDF (`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="..."`) |
| Success with `?store=true` | `201` | `{ "document": { "provider": "...", "bucket"/"container": "...", "key": "..." } }` |
| Malformed body / storage not configured | `400` | `{ "error": "..." }` |
| Missing required fields | `422` | `{ "error": "...", "missingFields": ["field1", "field2", ...] }` |
| Unexpected server error | `500` | `{ "error": "Unable to generate the PDF." }` |

`?store=true` requires cloud storage to be configured via `CLOUD_STORAGE_PROVIDER` (`s3`, `azure`, or `gcs`) — see [README.md](../README.md) for provider-specific environment variables.
