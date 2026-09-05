import { mkdir, writeFile } from "fs/promises";
import { createInterface } from "readline";
import { spawn } from "child_process";

const choices = {
  timeAmPm: ["AM", "PM"],
  relationshipToPatient: ["Self", "Spouse", "Parent", "Child", "Other"],
  complaintCategory: [
    "Clinical Care",
    "Staff Behavior",
    "Billing & Tariff",
    "Facility & Amenities",
    "Operational Delays",
  ],
  modeOfReceipt: ["Suggestion Box", "Verbal", "Email", "Direct Submission"],
};

const fields = [
  ["complaintId", "Complaint ID"],
  ["dateOfComplaint", "Date of Complaint (DD-MM-YYYY)"],
  ["timeOfLodging", "Time of Lodging (HH:MM)"],
  ["timeAmPm", "AM or PM"],
  ["reportedBy", "Name of Complainant"],
  ["relationshipToPatient", "Relationship to Patient"],
  ["patientName", "Patient Name"],
  ["uhid", "UHID"],
  ["ipdOpdNumber", "IPD / OPD Transaction ID"],
  ["contactNumber", "Contact Mobile Number"],
  ["complaintCategory", "Complaint Category"],
  ["complaintDescription", "Detailed Complaint Description"],
  ["modeOfReceipt", "Mode of Receipt"],
  ["responsibleDepartment", "Assigned Grievance Officer / Department"],
  ["closureDate", "Closure Date (DD-MM-YYYY)"],
];

function runGenerator(inputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["workflows/complaintWorkflow.js", inputPath], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Generator exited with code ${code}.`))));
  });
}

function createPrompt() {
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  const queuedAnswers = [];
  let resolveNextAnswer;
  let inputClosed = false;

  reader.on("line", (line) => {
    if (resolveNextAnswer) {
      resolveNextAnswer(line);
      resolveNextAnswer = undefined;
    } else {
      queuedAnswers.push(line);
    }
  });
  reader.on("close", () => {
    inputClosed = true;
  });

  return {
    async question(label) {
      process.stdout.write(label);
      if (queuedAnswers.length) return queuedAnswers.shift();
      if (inputClosed) return "";
      return new Promise((resolve) => {
        resolveNextAnswer = resolve;
      });
    },
    close() {
      reader.close();
    },
  };
}

async function askForField(prompt, key, label) {
  const validChoices = choices[key];
  while (true) {
    const suffix = validChoices ? ` (${validChoices.join(" / ")})` : "";
    const answer = (await prompt.question(`${label}${suffix}: `)).trim();
    if (key === "additionalNotes" || answer) {
      if (!validChoices || validChoices.includes(answer)) return answer;
      console.log(`Choose one of: ${validChoices.join(", ")}`);
    } else {
      console.log("This field is required.");
    }
  }
}

async function run() {
  const prompt = createPrompt();
  const input = {};

  console.log("Enter complaint details. Fields marked optional may be left blank.");
  for (const [key, label] of fields) {
    input[key] = await askForField(prompt, key, label);
    if (key === "relationshipToPatient" && input[key] === "Other") {
      input.relationshipOtherText = await askForField(prompt, "relationshipOtherText", "Relationship Other Details");
    }
  }
  if (!input.relationshipOtherText) input.relationshipOtherText = "";
  prompt.close();

  await mkdir("./inputs", { recursive: true });
  const fileName = `complaint-${Date.now()}.json`;
  const inputPath = `./inputs/${fileName}`;
  await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`, "utf8");
  console.log(`Saved input JSON: ${inputPath}`);
  await runGenerator(inputPath);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
