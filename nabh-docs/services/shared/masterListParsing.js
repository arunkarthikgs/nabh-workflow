// Tabs that don't fit the standard document-name/document-ID layout and need their own
// handling: "Statutory regulations" uses a Sl.No/Particulars/Issue date/Valid till layout with
// no document code column, and "Sheet2" is an empty placeholder tab.
export const NON_STANDARD_TABS = new Set(["Statutory regulations", "Sheet2"]);

export function isStandardDocumentTab(tabName) {
  return !NON_STANDARD_TABS.has(tabName);
}

// Shared "is this an applicable document row" rule for the Master List spreadsheet:
// column B (index 1) is the document name, column C (index 2) is the document ID.
// A row only counts if the ID is present and looks like a real document code (contains "/"),
// which excludes title/banner rows (duplicate text across columns) and numbered checklist
// rows that have no document ID.
export function isDocumentRow(documentName, documentId) {
  return Boolean(documentName) && Boolean(documentId) && documentId.includes("/");
}

/**
 * Converts a tab's raw rows (array of arrays, 0-indexed columns) into the applicable
 * document list: [{ documentName, documentId }, ...].
 */
export function extractDocuments(rows) {
  const documents = [];
  for (const row of rows) {
    const documentName = row[1] == null ? "" : String(row[1]).trim();
    const documentId = row[2] == null ? "" : String(row[2]).trim();
    if (isDocumentRow(documentName, documentId)) {
      documents.push({ documentName, documentId });
    }
  }
  return documents;
}
