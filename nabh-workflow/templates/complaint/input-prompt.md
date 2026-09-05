# Complaint Input Capture Prompt

Extract every available detail from the patient complaint or from user-provided form answers.

Return only valid JSON. Do not include markdown or explanatory text.

Rules:
- Capture every available value exactly as supplied.
- Do not invent, infer, summarize, or alter information.
- Use an empty string (`""`) when a text value is not supplied.
- `relationshipOtherText` is required only when `relationshipToPatient` is `"Other"`.
- Preserve dates, names, IDs, phone numbers, locations, and the complaint description exactly.
- `complaintCategory` must use one of the allowed values below.
- `modeOfReceipt` must use one of the allowed values below.
- Put details that do not fit another field in `additionalNotes`.

```json
{
  "complaintId": "",
  "dateOfComplaint": "",
  "timeOfLodging": "",
  "timeAmPm": "",
  "reportedBy": "",
  "relationshipToPatient": "",
  "relationshipOtherText": "",
  "patientName": "",
  "uhid": "",
  "ipdOpdNumber": "",
  "contactNumber": "",
  "emailAddress": "",
  "complaintCategory": "",
  "complaintDescription": "",
  "modeOfReceipt": "",
  "receivedByNameDesignation": "",
  "responsibleDepartment": "",
  "investigationSummary": "",
  "rootCause": "",
  "correctiveAction": "",
  "preventiveAction": "",
  "closureStatus": "",
  "closureDate": "",
  "qualityReviewer": "",
  "additionalNotes": ""
}
```

Allowed `relationshipToPatient` values:
- `Self`
- `Spouse`
- `Parent`
- `Child`
- `Other`

Allowed `complaintCategory` values:
- `Clinical Care`
- `Staff Behavior`
- `Billing & Tariff`
- `Facility & Amenities`
- `Operational Delays`
- `Patient Rights Violation`

Allowed `modeOfReceipt` values:
- `Suggestion Box`
- `Verbal`
- `Email`
- `Direct Submission`
