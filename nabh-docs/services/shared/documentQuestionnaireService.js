import { readTemplateQuestionnaire } from "./dataStore.js";
const QUESTION_TYPES = new Set(["text", "textarea", "multiselect"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function answerText(question, value) {
  if (question.type === "multiselect") {
    const selected = Array.isArray(value) ? value.map(text).filter(Boolean) : text(value).split(",").map(text).filter(Boolean);
    return selected.join(", ");
  }
  return text(value);
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
  const configured = await readTemplateQuestionnaire(hospital.accreditation?.programme, templatePath || documentId);
  return {
    documentId,
    documentName: documentName || documentId,
    programme: configured?.programme || hospital.accreditation?.programme || "",
    templatePath: configured?.templatePath || templatePath || documentId,
    questions: configured?.questions?.length ? configured.questions : []
  };
}

export function validateDocumentAnswers(questionnaire, answers) {
  if (!questionnaire.questions?.length) throw new Error("No questions are available to answer for this document.");
  const submitted = answers && typeof answers === "object" && !Array.isArray(answers) ? answers : {};
  const errors = {};
  for (const question of questionnaire.questions || []) {
    if (question.required !== false && !answerText(question, submitted[question.id])) errors[question.id] = `${question.label} is required.`;
  }
  if (Object.keys(errors).length) {
    const error = new Error("Answer all configured questions before generating the draft.");
    error.validationErrors = errors;
    throw error;
  }
  return Object.fromEntries(questionnaire.questions.map((question) => [question.id, answerText(question, submitted[question.id])]));
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
    const options = Array.isArray(question.options) ? question.options.map(text).filter(Boolean) : text(question.options).split(/\r?\n|,/).map(text).filter(Boolean);
    if (type === "multiselect" && options.length < 2) throw new Error(`Question "${id}" needs at least two options for multiple selection.`);
    ids.add(id);
    return { id, label, type, required: question.required !== false, options, prefillField: text(question.prefillField) };
  });
}
