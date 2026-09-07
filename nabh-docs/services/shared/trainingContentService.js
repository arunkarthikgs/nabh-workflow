// Auto-generates hospital-customized NABH training material (presentation outline, handout, assessment, attendance sheet).
export const TRAINING_TOPICS = [
  "NABH Orientation & Induction",
  "Patient Safety Goals",
  "Infection Control Practices",
  "Documentation & Record Keeping",
  "Medication Management",
  "Fire & Life Safety",
  "Biomedical Waste Management",
  "Quality Indicators & Data Collection"
];

export function generateTrainingPack(hospital, topic) {
  if (!TRAINING_TOPICS.includes(topic)) throw new Error(`Unknown training topic: ${topic}`);
  const name = hospital.name;
  return {
    topic,
    presentationOutline: [
      `Welcome & objectives — ${topic} at ${name}`,
      "Why this matters for NABH compliance",
      `Key policies & SOPs at ${name}`,
      "Roles & responsibilities by department",
      "Common non-conformities and how to avoid them",
      "Q&A and next steps"
    ],
    handout: `${topic} — Quick Reference for ${name} Staff\n\nThis handout summarizes the key points covered in training and should be retained by all attendees for reference during internal audits.`,
    assessmentQuestions: [
      `List two key requirements covered under "${topic}".`,
      `Describe how ${name} implements ${topic.toLowerCase()} in daily operations.`,
      `What should staff do if they observe a deviation related to ${topic.toLowerCase()}?`
    ],
    attendanceTemplate: { fields: ["Name", "Employee ID", "Department", "Designation", "Signature", "Date"], sessionTitle: topic, hospital: name },
    generatedAt: new Date().toISOString()
  };
}
