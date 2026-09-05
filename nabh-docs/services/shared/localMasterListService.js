import ExcelJS from "exceljs";
import { isDocumentRow, isStandardDocumentTab } from "./masterListParsing.js";

/**
 * Reads a locally saved copy of the Master List spreadsheet (.xlsx export) and returns
 * { [departmentTabName]: [{ documentName, documentId }, ...] }, using column B as the
 * document name and column C as the document ID, skipping rows with no document ID.
 * Non-standard tabs (see NON_STANDARD_TABS) are excluded entirely.
 */
export async function readLocalMasterList(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const departments = {};
  workbook.eachSheet((worksheet) => {
    if (!isStandardDocumentTab(worksheet.name)) return;

    const documents = [];
    worksheet.eachRow((row) => {
      const documentName = row.getCell(2).value == null ? "" : String(row.getCell(2).value).trim();
      const documentId = row.getCell(3).value == null ? "" : String(row.getCell(3).value).trim();
      if (isDocumentRow(documentName, documentId)) {
        documents.push({ documentName, documentId });
      }
    });
    departments[worksheet.name] = documents;
  });

  return departments;
}
