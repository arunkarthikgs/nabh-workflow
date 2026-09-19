// Sends transactional email via SMTP when configured; otherwise writes to a local dev outbox
// so the flow is testable without real credentials (see output/outbox/*.json).
import { mkdir, writeFile } from "fs/promises";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { configValue } from "./config.js";
import mjml2html from "mjml";

const outboxDir = fileURLToPath(new URL("../../output/outbox", import.meta.url));
const welcomeTemplatePath = fileURLToPath(new URL("../../templates/email/user-1.mjml", import.meta.url));
const welcomeTemplate = readFileSync(welcomeTemplatePath, "utf8");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));
}

async function renderWelcomeHtml({ appUrl, appName, workspaceName, userEmail, supportEmail }) {
  const values = { app_url: appUrl, app_name: appName, workspace_name: workspaceName, user_with_mail: userEmail, support_mail: supportEmail, current_year: new Date().getFullYear() };
  const source = welcomeTemplate.replace(/{{\s*([a-z_]+)\s*}}/gi, (_, key) => escapeHtml(values[key]));
  const result = await mjml2html(source, { validationLevel: "strict" });
  if (Array.isArray(result.errors) && result.errors.length) throw new Error(`Welcome email template failed validation: ${result.errors.map((error) => error.message).join("; ")}`);
  return result.html;
}

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
  console.log("SMTP delivery result:", JSON.stringify({ accepted: info.accepted, rejected: info.rejected, response: info.response, messageId: info.messageId }));
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
  const smtpConfigured = Boolean(configValue("SMTP_HOST"));
  let smtpResult;
  try {
    smtpResult = await sendViaSmtp(message);
  } catch (error) {
    console.error("SMTP send failed:", error.message);
    if (smtpConfigured) throw new Error(`Email delivery failed: ${error.message}`);
    smtpResult = false;
  }
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

export async function buildWelcomeEmail(hospital, user, setupLink) {
  const appName = configValue("APP_NAME", "NABH Readiness Platform");
  const supportEmail = configValue("SUPPORT_EMAIL", configValue("SMTP_FROM", "no-reply@nabh-docs.local"));
  return {
    to: user.email,
    subject: `Welcome to the NABH Readiness Platform, ${hospital.name}`,
    text: `Hi ${user.name},\n\nYour account for ${hospital.name} (client code ${hospital.code}) has been created on the NABH Readiness Platform.\n\nSet your password to activate your account and get started:\n${setupLink}\n\nThis link expires in 48 hours.\n\n- NABH Readiness Platform`,
    html: await renderWelcomeHtml({ appUrl: setupLink, appName, workspaceName: hospital.name, userEmail: user.email, supportEmail })
  };
}

export function buildOnboardingApprovalEmail(hospital, user, approvedBy) {
  return {
    to: user.email,
    bcc: approvedBy ? [approvedBy] : undefined,
    subject: `Onboarding approved: ${hospital.name}`,
    text: `Hi ${user.name},\n\nYour onboarding request for ${hospital.name} has been approved by the NABH Readiness Platform administrator.\n\nYou can now sign in and complete your hospital's institutional details. After completing the institutional profile, proceed to select and confirm the NABH accreditation programme your hospital intends to pursue.\n\nRegards,\nNABH Readiness Platform`
  };
}
