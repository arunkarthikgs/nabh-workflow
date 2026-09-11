// Polls nabh_template_jobs for queued rows and runs them one at a time: the AI provider generates
// the structured template, we render it to .docx, upload it to R2 under api/<department>/, and
// record the resulting object key back on the job row (or the error, if anything failed).
import { claimNextQueuedTemplateJob, completeTemplateJob, dataStoreDriver, failTemplateJob } from "./dataStore.js";
import { generateTemplateDocx } from "./templateGenerationService.js";
import { saveR2GeneratedTemplate } from "./r2TemplateService.js";

const POLL_INTERVAL_MS = 5000;
let polling = false;

async function processNextJob() {
  const job = await claimNextQueuedTemplateJob();
  if (!job) return;
  try {
    const { buffer } = await generateTemplateDocx(job.documentPrompt, { department: job.department, standardRef: job.standardRef });
    const fileName = `${(job.documentName || "template").replace(/[^a-z0-9]+/gi, "_")}.docx`;
    const objectKey = await saveR2GeneratedTemplate(job.department, fileName, buffer);
    await completeTemplateJob(job.id, objectKey);
  } catch (error) {
    await failTemplateJob(job.id, error.message);
  }
}

export function startTemplateJobWorker() {
  if (dataStoreDriver() !== "postgres") return; // nothing to poll in json mode
  setInterval(async () => {
    if (polling) return;
    polling = true;
    try { await processNextJob(); }
    catch (error) { console.error("Template job worker error:", error.message); }
    finally { polling = false; }
  }, POLL_INTERVAL_MS);
}
