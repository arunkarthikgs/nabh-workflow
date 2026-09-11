import { Container, getContainer } from "@cloudflare/containers";

const forwardedKeys = [
  "DATA_STORE",
  "R2_ENABLED",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_TEMPLATE_PREFIX",
  "R2_CLIENT_FOLDER",
  "R2_ENDPOINT_URL",
  "PUBLIC_BASE_URL",
  "ONLYOFFICE_DOCUMENT_SERVER_URL",
  "ONLYOFFICE_JWT_SECRET",
  "POSTGRES_URL",
  "POSTGRES_SSL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MAX_TOKENS"
];

export class NabhApp extends Container {
  defaultPort = 8080;
  sleepAfter = "5m";
  // Worker vars and secrets are invisible to the container unless forwarded here.
  envVars = Object.fromEntries(forwardedKeys.filter((key) => this.env[key] !== undefined).map((key) => [key, String(this.env[key])]));
}

const encoder = new TextEncoder();

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function matches(actual, expected) {
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function authorized(request, env) {
  const expected = env.APP_AUTH_PASSWORD;
  if (!expected) return true; // No password configured: the app stays open.
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Basic ")) return false;
  let decoded;
  try { decoded = atob(header.slice(6)); } catch { return false; }
  const separator = decoded.indexOf(":");
  if (separator === -1) return false;
  const [user, password] = [decoded.slice(0, separator), decoded.slice(separator + 1)];
  const [userOk, passwordOk] = await Promise.all([matches(user, env.APP_AUTH_USER || "nabh"), matches(password, expected)]);
  return userOk && passwordOk;
}

export default {
  async fetch(request, env) {
    // OnlyOffice save callbacks authenticate with their own JWT, so they bypass Basic auth.
    const isCallback = new URL(request.url).pathname.startsWith("/api/documents/onlyoffice/callback/");
    if (!isCallback && !await authorized(request, env)) {
      return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="NABH Docs", charset="UTF-8"' } });
    }
    const container = getContainer(env.NABH_APP, "nabh-docs");
    try {
      return await container.fetch(request);
    } catch (error) {
      // Container provisioning can briefly race the first request after deploy.
      console.error("Container request failed; retrying once:", error);
      try {
        return await container.fetch(request);
      } catch (retryError) {
        console.error("Container retry failed:", retryError);
        return new Response("The application container is starting. Please retry in a moment.", { status: 503, headers: { "Retry-After": "10", "Content-Type": "text/plain; charset=utf-8" } });
      }
    }
  }
};
