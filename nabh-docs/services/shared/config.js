import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// Highest priority first: real env vars, then local overrides, then the tracked defaults.
const propertyFiles = ["../../config.properties", "../../config.defaults.properties"].map((file) => fileURLToPath(new URL(file, import.meta.url)));
let loaded = false;

// Environment variables always win over the property files so deployments can override them.
export function loadConfig() {
  if (loaded) return;
  loaded = true;
  for (const propertiesPath of propertyFiles) {
    let content;
    try {
      content = readFileSync(propertiesPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
    }
  }
}

export function configValue(key, fallback = "") {
  loadConfig();
  const value = process.env[key];
  return value === undefined || value === "" ? fallback : String(value).trim();
}

export function configFlag(key, fallback = false) {
  const value = configValue(key, "");
  return value ? /^(1|true|yes|on|enabled)$/i.test(value) : fallback;
}

loadConfig();
