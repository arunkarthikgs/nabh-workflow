// Sends transactional email via SMTP when configured; otherwise writes to a local dev outbox
// so the flow is testable without real credentials (see output/outbox/*.json).
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { configValue } from "./config.js";

const outboxDir = fileURLToPath(new URL("../../output/outbox", import.meta.url));

async function sendViaSmtp(message) {
  const host = configValue("SMTP_HOST");
  if (!host) return false;
  let nodemailer;
  try { ({ default: nodemailer } = await import("nodemailer")); }
  catch { console.warn("SMTP_HOST is configured but the 'nodemailer' package is not installed; falling back to the local dev outbox."); return false; }
  const transporter = nodemailer.createTransport({
    host,
    port: Number(configValue("SMTP_PORT", "587")),
    secure: configValue("SMTP_SECURE", "false").toLowerCase() === "true",
    auth: configValue("SMTP_USER") ? { user: configValue("SMTP_USER"), pass: configValue("SMTP_PASS") } : undefined
  });
  const info = await transporter.sendMail({ from: configValue("SMTP_FROM", "no-reply@nabh-docs.local"), ...message });
  // Ethereal test accounts never deliver to a real inbox; surface the preview link instead.
  const previewUrl = /ethereal\.email$/i.test(host) ? nodemailer.getTestMessageUrl(info) : null;
  return { previewUrl };
}

export async function sendEmail(message) {
  const smtpResult = await sendViaSmtp(message).catch((error) => { console.error("SMTP send failed, falling back to the local dev outbox:", error.message); return false; });
  if (smtpResult) {
    if (smtpResult.previewUrl) console.log(`\n[email preview] ${message.to}: ${smtpResult.previewUrl}\n`);
    return { delivered: true, transport: "smtp", previewUrl: smtpResult.previewUrl || null };
  }
  await mkdir(outboxDir, { recursive: true });
  const fileName = `${Date.now()}-${message.to.replace(/[^a-z0-9]+/gi, "_")}.json`;
  await writeFile(path.join(outboxDir, fileName), JSON.stringify(message, null, 2));
  console.log(`\n[dev email outbox] To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n\n(saved to output/outbox/${fileName})\n`);
  return { delivered: false, transport: "dev-outbox", file: fileName };
}

export function buildWelcomeEmail(hospital, user, setupLink) {
  return {
    to: user.email,
    subject: `Welcome to the NABH Readiness Platform, ${hospital.name}`,
    text: `Hi ${user.name},\n\nYour account for ${hospital.name} (client code ${hospital.code}) has been created on the NABH Readiness Platform.\n\nSet your password to activate your account and get started:\n${setupLink}\n\nThis link expires in 48 hours.\n\n- NABH Readiness Platform`
  };
}
