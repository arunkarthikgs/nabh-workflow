import { readTemplateQuestionnaire } from "./dataStore.js";
const QUESTION_TYPES = new Set(["text", "textarea", "multiselect"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function profileSummary(hospital) {
  const details = hospital.details || {};
  return {
    hospitalName: hospital.name || "",
    hospitalCode: hospital.code || "",
    hospitalType: details.hospitalType || "",
    ownershipType: details.ownershipType || "",
    departments: details.departments || "",
    services: details.servicesOffered || "",
    organisationalStructure: details.organisationalStructure || "",
    operatingPractices: details.operatingPractices || ""
  };
}

export async function getDocumentQuestions(hospital, documentId, documentName, templatePath) {
  if (!hospital || !documentId) throw new Error("Hospital and document are required.");
  const profile = profileSummary(hospital);
  const configured = await readTemplateQuestionnaire(hospital.accreditation?.programme, templatePath || documentId);
  return {
    documentId,
    documentName: documentName || documentId,
    programme: configured?.programme || hospital.accreditation?.programme || "",
    templatePath: configured?.templatePath || templatePath || documentId,
    questions: configured?.questions?.length ? configured.questions.map((question) => ({ ...question, value: profile[question.prefillField] || "" })) : [
      { id: "hospitalName", label: "Hospital name", type: "text", required: true, readOnly: true, value: profile.hospitalName },
      { id: "departments", label: "Which departments are covered by this document?", type: "textarea", required: true, value: profile.departments },
      { id: "services", label: "Which clinical or support services are relevant?", type: "textarea", required: true, value: profile.services },
      { id: "organisationalStructure", label: "Describe the organisational structure and reporting responsibilities.", type: "textarea", required: true, value: profile.organizationalStructure || "" },
      { id: "operatingPractices", label: "Describe the hospital-specific operating practices that should appear in the document.", type: "textarea", required: true, value: profile.operatingPractices }
    ].filter((question) => QUESTION_TYPES.has(question.type))
  };
}

export function validateDocumentAnswers(questionnaire, answers) {
  const submitted = answers && typeof answers === "object" && !Array.isArray(answers) ? answers : {};
  const errors = {};
  for (const question of questionnaire.questions) {
    if (question.required && !text(submitted[question.id])) errors[question.id] = `${question.label} is required.`;
  }
  if (Object.keys(errors).length) {
    const error = new Error("Complete all required hospital-specific questions before generating the draft.");
    error.validationErrors = errors;
    throw error;
  }
  return Object.fromEntries(questionnaire.questions.map((question) => [question.id, text(submitted[question.id])]));
}

export function validateQuestionnaireDefinition(input) {
  const questions = Array.isArray(input?.questions) ? input.questions : [];
  if (!questions.length) throw new Error("Configure at least one question for this template.");
  const ids = new Set();
  return questions.map((question, index) => {
    const id = text(question.id) || `question_${index + 1}`;
    const type = text(question.type) || "textarea";
    if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error(`Question ID "${id}" is invalid.`);
    if (ids.has(id)) throw new Error(`Question ID "${id}" is duplicated.`);
    if (!QUESTION_TYPES.has(type)) throw new Error(`Question "${id}" has an unsupported type.`);
    const label = text(question.label);
    if (!label) throw new Error(`Question "${id}" requires a label.`);
    ids.add(id);
    return { id, label, type, required: question.required !== false, options: Array.isArray(question.options) ? question.options.map(text).filter(Boolean) : [], prefillField: text(question.prefillField) };
  });
}
