// Sends transactional email via SMTP when configured; otherwise writes to a local dev outbox
// so the flow is testable without real credentials (see output/outbox/*.json).
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { configValue } from "./config.js";

const outboxDir = fileURLToPath(new URL("../../output/outbox", import.meta.url));

async function smtpTransport() {
  const host = configValue("SMTP_HOST");
  if (!host) return null;
  let nodemailer;
  try { ({ default: nodemailer } = await import("nodemailer")); }
  catch { throw new Error("The nodemailer package is not installed."); }
  return nodemailer.createTransport({
    host,
    port: Number(configValue("SMTP_PORT", "587")),
    secure: configValue("SMTP_SECURE", "false").toLowerCase() === "true",
    auth: configValue("SMTP_USER") ? { user: configValue("SMTP_USER"), pass: configValue("SMTP_PASS") } : undefined,
    connectionTimeout: Number(configValue("SMTP_CONNECTION_TIMEOUT_MS", "10000")),
    greetingTimeout: Number(configValue("SMTP_GREETING_TIMEOUT_MS", "10000")),
    socketTimeout: Number(configValue("SMTP_SOCKET_TIMEOUT_MS", "20000"))
  });
}

async function sendViaSmtp(message) {
  const host = configValue("SMTP_HOST");
  let nodemailer;
  try { ({ default: nodemailer } = await import("nodemailer")); }
  catch { throw new Error("The nodemailer package is not installed."); }
  const transporter = await smtpTransport();
  if (!transporter) return false;
  const info = await transporter.sendMail({ from: configValue("SMTP_FROM", "no-reply@nabh-docs.local"), ...message });
  // Ethereal test accounts never deliver to a real inbox; surface the preview link instead.
  const previewUrl = /ethereal\.email$/i.test(host) ? nodemailer.getTestMessageUrl(info) : null;
  return { previewUrl };
}

export async function verifySmtp() {
  const transporter = await smtpTransport();
  if (!transporter) return { configured: false, verified: false, error: "SMTP_HOST is not configured." };
  await transporter.verify();
  return { configured: true, verified: true };
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

export function buildOnboardingApprovalEmail(hospital, user, approvedBy) {
  return {
    to: user.email,
    bcc: approvedBy ? [approvedBy] : undefined,
    subject: `Hospital onboarding approved: ${hospital.name}`,
    text: `Hi ${user.name},\n\nYour hospital registration for ${hospital.name} has been approved by the NABH Readiness Platform administrator. You can now complete your hospital registration and activate your account using the setup link from your registration email.\n\n- NABH Readiness Platform`
  };
}
