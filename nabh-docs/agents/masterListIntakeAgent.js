import { readLocalMasterList } from "../services/shared/localMasterListService.js";
import { readMasterList as readMasterListFromSheets } from "../services/shared/googleSheetsService.js";

/**
 * Reads the raw department -> applicable-documents map from either a local .xlsx export
 * or a live Google Sheet. Non-standard tabs are already excluded by the underlying services.
 */
export async function readMasterListSource({ localFilePath, spreadsheetUrl }) {
  if (localFilePath) {
    return readLocalMasterList(localFilePath);
  }
  if (spreadsheetUrl) {
    return readMasterListFromSheets(spreadsheetUrl);
  }
  throw new Error("Provide either localFilePath or spreadsheetUrl.");
}
