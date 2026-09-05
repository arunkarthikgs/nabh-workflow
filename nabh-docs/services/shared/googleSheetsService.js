import { google } from "googleapis";
import { extractDocuments, isStandardDocumentTab } from "./masterListParsing.js";

function isConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

let sheetsClientPromise = null;

async function getSheetsClient() {
  if (!sheetsClientPromise) {
    const authOptions = { scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] };
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON) {
      authOptions.credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON);
    }
    // Otherwise falls back to GOOGLE_APPLICATION_CREDENTIALS file path, handled automatically by google-auth-library.
    const auth = new google.auth.GoogleAuth(authOptions);
    sheetsClientPromise = auth.getClient().then((client) => google.sheets({ version: "v4", auth: client }));
  }
  return sheetsClientPromise;
}

export function extractSpreadsheetId(urlOrId) {
  const match = String(urlOrId).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : urlOrId;
}

export async function listSheetTabs(spreadsheetId) {
  if (!isConfigured()) {
    throw new Error("Google Sheets access is not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY_JSON or GOOGLE_APPLICATION_CREDENTIALS.");
  }
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  return response.data.sheets.map((sheet) => sheet.properties.title);
}

export async function readSheetRows(spreadsheetId, sheetName) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: sheetName });
  return response.data.values || [];
}

function rowsToRecords(rows) {
  return extractDocuments(rows);
}

/**
 * Reads every tab in the spreadsheet (one tab per department) and returns
 * { [tabName]: [{ documentName, documentId }, ...] }, using column B as the document name
 * and column C as the document ID, skipping rows with no document ID.
 * Non-standard tabs (see NON_STANDARD_TABS) are excluded entirely.
 */
export async function readMasterList(spreadsheetIdOrUrl) {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  const tabs = await listSheetTabs(spreadsheetId);
  const departments = {};

  for (const tab of tabs) {
    if (!isStandardDocumentTab(tab)) continue;
    const rows = await readSheetRows(spreadsheetId, tab);
    departments[tab] = rowsToRecords(rows);
  }

  return departments;
}
