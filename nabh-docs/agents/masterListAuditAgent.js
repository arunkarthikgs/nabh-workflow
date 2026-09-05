/**
 * Logs a per-department document-count summary for audit purposes.
 */
export function logMasterListSummary(departments) {
  const departmentNames = Object.keys(departments);
  const totalDocuments = departmentNames.reduce((sum, name) => sum + departments[name].length, 0);

  console.log(`[LOG] Master list parsed`, {
    departments: departmentNames.length,
    totalDocuments,
    parsedAt: new Date().toISOString()
  });
}
