# NABH Document Workflows

## Structure

```text
services/
   shared/             Shared file and logging utilities
   complaint/          Complaint PDF renderer
   admission-advice/   Admission Advice PDF renderer
templates/
   complaint/          Complaint source documents and input prompt
   admission-advice/   Admission Advice source document and input template
workflows/            Commands that collect input and generate documents
inputs/               Saved user-entered JSON records
```

## Setup
1. Install dependencies:
   npm install

2. Generate PDFs:

   Complaint PDF using the default sample input:
   npm run complaint

   Complaint PDF using a specific input file:
   npm run complaint -- ./sample/complaintInput.json

   To enter Complaint Form fields interactively:
   npm run complaint:interactive

   To generate an Admission Advice Note:
   npm run admission-advice -- ./sample/admissionAdviceInput.json

   To choose an output filename for an Admission Advice Note:
   npm run admission-advice -- ./sample/admissionAdviceInput.json ./Admission_Advice.pdf

   To generate the architecture document:
   npm run architecture

   The existing `template:*` commands remain available as aliases.

5. Run the REST API for third-party systems:
   npm run api

   The API listens on `http://127.0.0.1:3000` by default. Set `HOST=0.0.0.0` and `PORT=<port>` only when the host's network and authentication controls are configured.

   ### `GET /health`
   Returns `{ "status": "ok" }`. No auth, no body.

   ### `POST /api/v1/complaints/pdf`
   Body: JSON object matching [`models/complaintSchema.json`](models/complaintSchema.json). Server applies `complianceAgent` → `validationAgent` → `pdfAgent` before responding.

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

   ### `POST /api/v1/admission-advice/pdf`
   Body: JSON object matching [`models/admissionAdviceSchema.json`](models/admissionAdviceSchema.json). All fields are required. Server applies `admissionAdviceComplianceAgent` → `admissionAdviceValidationAgent` → `admissionAdviceAuditAgent` → PDF generation.

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

   ### `POST /api/v1/hospital-pre-registration/pdf`
   Body: JSON object matching [`models/hospitalPreRegistrationSchema.json`](models/hospitalPreRegistrationSchema.json). Server applies `hospitalPreRegistrationComplianceAgent` → `hospitalPreRegistrationValidationAgent` → `hospitalPreRegistrationAuditAgent` → PDF generation.

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

   Server applies `hospitalPreRegistrationComplianceAgent` → `hospitalPreRegistrationValidationAgent` → `hospitalPreRegistrationAuditAgent` → PDF generation.

   ### Common behavior for all three POST endpoints
   - **Success (`200`)**: response is the generated PDF as a binary download (`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="..."`).
   - **Store instead of download**: add `?store=true` to the URL. Requires cloud storage to be configured (see below). Returns `201` with `{ "document": { "provider": "...", "bucket"/"container": "...", "key": "..." } }`.
   - **`400`**: request body is not a JSON object, or (when `?store=true`) cloud storage is not configured — `{ "error": "..." }`.
   - **`422`**: one or more required fields are missing — `{ "error": "...", "missingFields": ["field1", "field2", ...] }`.
   - **`500`**: unexpected server error — `{ "error": "Unable to generate the PDF." }`.

6. Configure optional cloud storage before using `?store=true`:

   ```text
   CLOUD_STORAGE_PROVIDER=s3|azure|gcs
   CLOUD_STORAGE_PREFIX=nabh-documents
   ```

   AWS S3 requires `AWS_S3_BUCKET` (or `CLOUD_STORAGE_BUCKET`) and an IAM role or standard AWS credentials. Optionally set `AWS_REGION` and `AWS_S3_KMS_KEY_ID` for KMS encryption.

   Azure Blob Storage requires `AZURE_STORAGE_CONNECTION_STRING` and `AZURE_STORAGE_CONTAINER`.

   Google Cloud Storage requires `GCS_BUCKET` (or `CLOUD_STORAGE_BUCKET`) and Application Default Credentials. Optionally set `GOOGLE_CLOUD_PROJECT`.

   Generated keys use a random UUID and do not include patient data. Keep cloud containers private and use provider-managed identity or workload credentials rather than committed secrets.

7. (Optional, POC) Serve the Hospital Pre-Registration PDF from a fillable Google Drive template instead of the hardcoded layout:

   ```text
   GOOGLE_DRIVE_HOSPITAL_PRE_REGISTRATION_TEMPLATE_ID=<drive-file-id>
   GOOGLE_SERVICE_ACCOUNT_KEY_JSON=<service-account-json>
   ```

   Requires a Google Cloud service account with the Drive API enabled, and the Drive folder containing the template shared with the service account's email as Viewer. `services/shared/googleDriveTemplateService.js` downloads and caches the template (15 min TTL, falls back to the last good cache on transient Drive errors); `services/shared/templateFillService.js` fills the AcroForm fields from the request data.

   Without those env vars set, the code falls back to `templates/hospital-pre-registration/fillable-template.pdf` if present (a local stand-in generated by `node scripts/generateFillableHospitalPreRegistrationTemplate.js`, for local testing), then finally to the original hardcoded PDF renderer. Only Hospital Pre-Registration has this template-fill path today; Complaint and Admission Advice remain hardcoded.

8. Run the React data-capture UI:


   ```sh
   cd web
   npm install
   cd ..
   npm run api
   ```

   In a second terminal, run `npm run ui`, then open the URL printed by Vite (normally `http://localhost:5173`). The development server proxies PDF API requests to `http://127.0.0.1:3000`.

   The blank input contracts are:
   `templates/complaint/input-prompt.md`
   `templates/admission-advice/input-template.json`

3. Run Complaint Form agents individually:
   npm run agent:intake -- ./sample/sampleComplaint.txt
   npm run agent:extract -- ./sample/sampleComplaint.txt
   npm run agent:compliance -- ./inputs/complaint-1788295761373.json
   npm run agent:validate -- ./inputs/complaint-1788295761373.json
   npm run agent:pdf -- ./inputs/complaint-1788295761373.json ./Complaint_NABH_Agent.pdf
   npm run agent:audit -- ./inputs/complaint-1788295761373.json

   The `intake` and `extract` commands accept text or JSON input. The remaining commands accept JSON input.

   To run all Complaint Form agents in sequence:
   npm run agent:all -- ./inputs/complaint-1788295761373.json

4. Outputs are generated in the project root.
