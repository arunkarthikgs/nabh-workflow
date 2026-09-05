export function extractComplaintFields(rawText) {
  const trimmedText = rawText.trim();
  if (trimmedText.startsWith("{")) {
    return JSON.parse(trimmedText);
  }

  const lines = rawText.split("\n");
  const map = {};

  for (const line of lines) {
    const [key, ...rest] = line.split(":");
    if (!key || !rest.length) continue;
    map[key.trim()] = rest.join(":").trim();
  }

  return {
    complaintId: map["Complaint ID"] || "",
    patientName: map["Patient Name"] || "",
    uhid: map["UHID"] || "",
    dateOfComplaint: map["Date of Complaint"] || "",
    complaintCategory: map["Complaint Category"] || "",
    complaintDescription: map["Complaint Description"] || "",
    reportedBy: map["Reported By"] || "",
    timeOfLodging: map["Time of Lodging"] || map["Time"] || "",
    timeAmPm: map["AM/PM"] || "",
    relationshipToPatient: map["Relationship to Patient"] || "",
    relationshipOtherText: map["Relationship Other Details"] || "",
    ipdOpdNumber: map["IPD / OPD Number"] || "",
    contactNumber: map["Contact Number"] || "",
    emailAddress: map["Email Address"] || "",
    modeOfReceipt: map["Mode of Receipt"] || "",
    receivedByNameDesignation: map["Received By Name & Designation"] || "",
    investigationSummary: map["Investigation Summary"] || "",
    rootCause: map["Root Cause"] || "",
    correctiveAction: map["Corrective Action"] || "",
    preventiveAction: map["Preventive Action"] || "",
    responsibleDepartment: map["Responsible Department"] || "",
    closureStatus: map["Closure Status"] || "",
    closureDate: map["Closure Date"] || "",
    qualityReviewer: map["Quality Reviewer"] || ""
  };
}
