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
  "POSTGRES_SSL"
];

export class NabhApp extends Container {
  defaultPort = 8080;
  sleepAfter = "30m";
  // Worker vars and secrets are invisible to the container unless forwarded here.
  envVars = Object.fromEntries(forwardedKeys.filter((key) => this.env[key] !== undefined).map((key) => [key, String(this.env[key])]));
}

export default {
  async fetch(request, env) {
    // Single instance: DATA_STORE=json keeps state on the container filesystem.
    return getContainer(env.NABH_APP, "nabh-docs").fetch(request);
  }
};
