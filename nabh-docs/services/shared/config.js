import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const propertiesPath = fileURLToPath(new URL("../../config.properties", import.meta.url));
let loaded = false;

// Environment variables always win over config.properties so deployments can override local files.
export function loadConfig() {
  if (loaded) return;
  loaded = true;
  try {
    const content = readFileSync(propertiesPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
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
