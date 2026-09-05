import { google } from "googleapis";

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const cache = new Map(); // fileId -> { bytes, fetchedAt }

function isConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

let driveClientPromise = null;

async function getDriveClient() {
  if (!driveClientPromise) {
    const authOptions = { scopes: ["https://www.googleapis.com/auth/drive.readonly"] };
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON) {
      authOptions.credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON);
    }
    // Otherwise falls back to GOOGLE_APPLICATION_CREDENTIALS file path, handled automatically by google-auth-library.
    const auth = new google.auth.GoogleAuth(authOptions);
    driveClientPromise = auth.getClient().then((client) => google.drive({ version: "v3", auth: client }));
  }
  return driveClientPromise;
}

async function downloadFromDrive(fileId) {
  const drive = await getDriveClient();
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(response.data);
}

/**
 * Fetches a template file's bytes from Google Drive, cached for CACHE_TTL_MS.
 * Falls back to the last successfully cached copy if Drive is unreachable.
 * Returns null if Drive isn't configured and there's no cache yet.
 */
export async function getTemplate(fileId) {
  if (!fileId) return null;

  const cached = cache.get(fileId);
  const isFresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;
  if (isFresh) return cached.bytes;

  if (!isConfigured()) {
    return cached ? cached.bytes : null;
  }

  try {
    const bytes = await downloadFromDrive(fileId);
    cache.set(fileId, { bytes, fetchedAt: Date.now() });
    return bytes;
  } catch (error) {
    if (cached) {
      console.error(`Google Drive fetch failed for ${fileId}, using stale cache:`, error.message);
      return cached.bytes;
    }
    throw error;
  }
}

export function isGoogleDriveTemplatesEnabled() {
  return isConfigured();
}
