import { useState } from "react";
import { Building2, CloudUpload, FileDown, Plus, Send } from "lucide-react";
import hospitalLogo from "../../logo.png";
import { ADMISSION_ADVICE_DOCUMENT_ID, HOSPITAL_PRE_REGISTRATION_DOCUMENT_ID } from "../../services/shared/documentIds.js";
import AdminWorkspace from "./AdminWorkspace.jsx";

const documentIds = { admission: ADMISSION_ADVICE_DOCUMENT_ID, preRegistration: HOSPITAL_PRE_REGISTRATION_DOCUMENT_ID };

const complaintFields = [
  ["complaintId", "Complaint ID", "text"], ["dateOfComplaint", "Complaint date", "date"], ["timeOfLodging", "Time lodged", "time"],
  ["timeAmPm", "AM / PM", "select", ["AM", "PM"]], ["reportedBy", "Complainant name", "text"],
  ["relationshipToPatient", "Relationship", "select", ["Self", "Spouse", "Parent", "Child", "Other"]],
  ["relationshipOtherText", "Other relationship details", "text", null, true], ["patientName", "Patient name", "text"],
  ["uhid", "UHID", "text"], ["ipdOpdNumber", "IPD / OPD number", "text"], ["contactNumber", "Contact number", "tel"],
  ["emailAddress", "Email address", "email", null, true],
  ["complaintCategory", "Complaint category", "select", ["Clinical Care", "Staff Behavior", "Billing & Tariff", "Facility & Amenities", "Operational Delays", "Patient Rights Violation"]],
  ["complaintDescription", "Complaint description", "textarea"],
  ["modeOfReceipt", "Mode of receipt", "select", ["Suggestion Box", "Verbal", "Email", "Direct Submission"]],
  ["receivedByNameDesignation", "Received by", "text", null, true], ["responsibleDepartment", "Responsible department", "text"],
  ["investigationSummary", "Investigation summary", "textarea", null, true], ["rootCause", "Root cause", "textarea", null, true],
  ["correctiveAction", "Corrective action", "textarea", null, true], ["preventiveAction", "Preventive action", "textarea", null, true],
  ["closureStatus", "Closure status", "text", null, true], ["closureDate", "Closure date", "date"], ["qualityReviewer", "Quality reviewer", "text", null, true]
];

const admissionFields = [
  ["patientFullName", "Patient full name", "text"], ["uhid", "UHID", "text"], ["age", "Age", "number"],
  ["biologicalGender", "Biological gender", "select", ["M", "F"]], ["dateOfAdvice", "Advice date", "date"], ["timeOfAdvice", "Advice time", "time"],
  ["admittingDepartment", "Admitting department", "text"], ["attendingConsultant", "Attending consultant", "text"],
  ["source", "Source", "select", ["OPD", "Emergency / ER", "Day Care"]], ["contactNumber", "Contact number", "tel"],
  ["provisionalDiagnosis", "Provisional diagnosis", "textarea"], ["clinicalStatus", "Clinical status", "textarea"],
  ["priorityStatus", "Priority", "select", ["Routine / Planned Admission", "Urgent / Emergency Admission"]],
  ["assignedWard", "Assigned ward", "select", ["General", "Semi-Private", "Private Room", "ICU / ICCU", "Day Care"]],
  ["safetyPrecautions", "Safety precautions", "multiselect", ["Fall Risk", "Isolation Needed", "Vulnerable Patient", "None"]],
  ["vitalsMonitoringFrequency", "Vitals monitoring", "select", ["Continuous", "Every 1 Hour", "Every 4 Hours", "Stable Routine"]],
  ["dietaryDirective", "Dietary directive", "select", ["NPO (Fasting)", "Soft Diet", "Regular Diet", "Diabetic Diet"]],
  ["urgentInvestigations", "Urgent investigations", "textarea"], ["statMedications", "STAT medications", "textarea"],
  ["expectedPaymentPathway", "Payment pathway", "select", ["Self-Paying / Cash", "TPA / Insurance", "Corporate / Government (CGHS)"]],
  ["financialCounselingCompleted", "Financial counseling", "select", ["Yes", "No"]], ["estimatedTreatmentCost", "Estimated treatment cost (Rs.)", "number"]
];

const preRegistrationFields = [
  ["fullName", "Full name", "text"], ["gender", "Gender", "select", ["Male", "Female", "Other"]],
  ["dateOfBirth", "Date of birth", "date"], ["idNumber", "Aadhar / Passport", "text"],
  ["contactNumber", "Contact number", "tel"], ["emailAddress", "Email address", "email", null, true],
  ["permanentAddress", "Permanent address", "textarea"],
  ["admittingDoctor", "Admitting doctor", "text"], ["department", "Department", "text"],
  ["proposedDate", "Proposed date", "date"], ["stayType", "Stay type", "select", ["Daycare", "Inpatient (IPD)"]],
  ["paymentMode", "Payment mode", "select", ["Cash / Self-Pay", "Insurance / TPA", "Corporate Panel"]],
  ["insuranceCompany", "Insurance company", "text", null, true], ["tpaName", "TPA name", "text", null, true],
  ["policyId", "Policy / Corporate ID", "text", null, true],
  ["preAuthStatus", "Pre-auth status", "select", ["Initiated", "Pending", "N/A"], true],
  ["emergencyContactName", "Emergency contact name", "text"], ["relationship", "Relationship", "text"],
  ["contactPhone1", "Contact phone 1", "tel"], ["contactPhone2", "Contact phone 2", "tel", null, true]
];

const emptyValues = (fields) => Object.fromEntries(fields.map(([name, , type]) => [name, type === "multiselect" ? [] : ""]));

const intakeDefaults = {
  complaint: {
    complaintId: "C-2026-001", dateOfComplaint: "01/09/2026", timeOfLodging: "09:30", timeAmPm: "AM",
    reportedBy: "Ravi Kumar", relationshipToPatient: "Self", relationshipOtherText: "", patientName: "Ravi Kumar",
    uhid: "UH12345", ipdOpdNumber: "OPD-2026-001", contactNumber: "9876543210", emailAddress: "ravi.kumar@example.com",
    complaintCategory: "Clinical Care", complaintDescription: "Patient reported delay in medication administration.",
    modeOfReceipt: "Direct Submission", receivedByNameDesignation: "Patient Coordinator", responsibleDepartment: "Nursing",
    investigationSummary: "Nurse was occupied in emergency case; delay of 45 minutes.", rootCause: "Inadequate backup staffing.",
    correctiveAction: "Reassign backup nurse during peak hours.", preventiveAction: "Update staffing policy and conduct training.",
    closureStatus: "Closed", closureDate: "03/09/2026", qualityReviewer: "Quality Manager"
  },
  admission: {
    patientFullName: "Asha Sharma", uhid: "UH-AD-10245", age: "42", biologicalGender: "F", dateOfAdvice: "01/09/2026",
    timeOfAdvice: "10:30", admittingDepartment: "General Medicine", attendingConsultant: "Dr. K. Rao", source: "OPD",
    contactNumber: "9876543210", provisionalDiagnosis: "Acute febrile illness requiring inpatient observation.",
    clinicalStatus: "Fever for three days with fatigue and reduced oral intake. Hemodynamically stable.",
    priorityStatus: "Routine / Planned Admission", assignedWard: "General", safetyPrecautions: ["Fall Risk"],
    vitalsMonitoringFrequency: "Every 4 Hours", dietaryDirective: "Regular Diet",
    urgentInvestigations: "CBC, CRP, LFT, RFT, urine routine microscopy.",
    statMedications: "IV fluids as advised; paracetamol 650 mg as required.", expectedPaymentPathway: "Self-Paying / Cash",
    financialCounselingCompleted: "Yes", estimatedTreatmentCost: "25000"
  },
  preRegistration: {
    fullName: "Ramesh Iyer", gender: "Male", dateOfBirth: "14/06/1978", idNumber: "XXXX-XXXX-4821",
    contactNumber: "9845012345", emailAddress: "ramesh.iyer@example.com",
    permanentAddress: "12 Lakeview Road, Indiranagar, Bengaluru, Karnataka 560038", admittingDoctor: "Dr. N. Menon",
    department: "Orthopedics", proposedDate: "05/09/2026", stayType: "Inpatient (IPD)", paymentMode: "Insurance / TPA",
    insuranceCompany: "Star Health Insurance", tpaName: "MediAssist", policyId: "SH-2026-778901", preAuthStatus: "Initiated",
    emergencyContactName: "Lakshmi Iyer", relationship: "Spouse", contactPhone1: "9845012345", contactPhone2: "9845067890"
  }
};

const withIntakeDefaults = (fields, key) => ({ ...emptyValues(fields), ...intakeDefaults[key] });

function Field({ field, value, onChange }) {
  const [name, label, type, options, optional] = field;
  if (type === "multiselect") return <fieldset className="field wide"><legend>{label}</legend><div className="choices">{options.map((option) => <label key={option}><input type="checkbox" checked={value.includes(option)} onChange={(event) => onChange(name, event.target.checked ? [...value, option] : value.filter((item) => item !== option))} />{option}</label>)}</div></fieldset>;
  const isDate = type === "date";
  const Control = type === "textarea" ? "textarea" : "input";
  return <label className={`field ${type === "textarea" ? "wide" : ""}`}><span>{label}{!optional && <b> *</b>}</span>{type === "select" ? <select value={value} onChange={(event) => onChange(name, event.target.value)}><option value="">Select</option>{options.map((option) => <option key={option}>{option}</option>)}</select> : <Control type={isDate ? "text" : type} placeholder={isDate ? "DD/MM/YYYY" : undefined} pattern={isDate ? "\\d{2}/\\d{2}/\\d{4}" : undefined} value={value} onChange={(event) => onChange(name, event.target.value)} rows={type === "textarea" ? 3 : undefined} />}</label>;
}

function DocumentWorkspace() {
  const [documentType, setDocumentType] = useState("complaint");
  const [forms, setForms] = useState({ complaint: withIntakeDefaults(complaintFields, "complaint"), admission: withIntakeDefaults(admissionFields, "admission"), preRegistration: withIntakeDefaults(preRegistrationFields, "preRegistration") });
  const [store, setStore] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const fields = documentType === "complaint" ? complaintFields : documentType === "admission" ? admissionFields : preRegistrationFields;
  const formKey = documentType === "complaint" ? "complaint" : documentType === "admission" ? "admission" : "preRegistration";
  const update = (name, value) => setForms((current) => ({ ...current, [formKey]: { ...current[formKey], [name]: value } }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setStatus("");
    const endpoint = documentType === "complaint" ? "/api/v1/complaints/pdf" : documentType === "admission" ? "/api/v1/admission-advice/pdf" : "/api/v1/hospital-pre-registration/pdf";
    try {
      const response = await fetch(`${endpoint}${store ? "?store=true" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(forms[formKey]) });
      if (!response.ok) { const error = await response.json(); throw new Error(error.missingFields ? `Complete: ${error.missingFields.join(", ")}` : error.error); }
      if (store) { const result = await response.json(); setStatus(`Stored in ${result.document.provider}: ${result.document.key}`); return; }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = documentType === "complaint" ? "Complaint_NABH.pdf" : documentType === "admission" ? "Admission_Advice_Note.pdf" : "Hospital_Pre_Registration.pdf"; link.click(); URL.revokeObjectURL(url); setStatus("PDF generated and downloaded.");
    } catch (error) { setStatus(error.message || "Unable to generate the PDF."); } finally { setBusy(false); }
  }

  function newForm() { setForms((current) => ({ ...current, [formKey]: emptyValues(fields) })); setStatus(""); }

  return <main><header><div className="brand"><img src={hospitalLogo} alt="Shippu Hospital" /><div><p className="hospital-name">Shippu Hospital</p><p className="eyebrow">NABH document workspace</p></div></div><h1>Clinical document capture</h1><p className="intro">Capture complete records, validate required details, and create a PDF without leaving the workflow.</p></header><nav><button className={documentType === "complaint" ? "active" : ""} onClick={() => { setDocumentType("complaint"); setStatus(""); }}>Complaint form</button><button className={documentType === "admission" ? "active" : ""} onClick={() => { setDocumentType("admission"); setStatus(""); }}>Admission advice</button><button className={documentType === "preRegistration" ? "active" : ""} onClick={() => { setDocumentType("preRegistration"); setStatus(""); }}>Pre-registration</button></nav><form onSubmit={submit}><div className="form-heading"><div><p className="eyebrow">{documentType === "complaint" ? "Grievance redressal" : documentType === "admission" ? "AAC chapter" : "Pre-admission intake"}</p><h2>{documentType === "complaint" ? "Patient complaint" : documentType === "admission" ? "Admission advice note" : "Hospital pre-registration form"}</h2>{documentIds[formKey] && <p className="document-id">Document ID: {documentIds[formKey]}</p>}</div><button type="button" className="icon-button" onClick={newForm} title="Start a new form"><Plus size={18} /></button></div><section className="fields">{fields.map((field) => <Field key={field[0]} field={field} value={forms[formKey][field[0]]} onChange={update} />)}</section><footer><label className="storage"><input type="checkbox" checked={store} onChange={(event) => setStore(event.target.checked)} /><CloudUpload size={17} /> Store in configured cloud storage</label><button className="submit" disabled={busy}>{store ? <CloudUpload size={18} /> : <FileDown size={18} />}{busy ? "Generating..." : store ? "Generate and store" : "Generate PDF"}<Send size={15} /></button></footer>{status && <p className={`status ${status.startsWith("Complete") || status.startsWith("Unable") ? "error" : ""}`}>{status}</p>}</form></main>;
}

function App() {
  const [view, setView] = useState("admin");
  return <><div className="workspace-switcher"><button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}><Building2 size={16} /> Administration</button><button className={view === "documents" ? "active" : ""} onClick={() => setView("documents")}><FileDown size={16} /> Clinical documents</button></div>{view === "admin" ? <AdminWorkspace /> : <DocumentWorkspace />}</>;
}

export default App;