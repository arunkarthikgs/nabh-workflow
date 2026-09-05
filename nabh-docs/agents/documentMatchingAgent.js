import { randomUUID } from "crypto";
import { similarity } from "../services/shared/textSimilarity.js";
import { getDepartmentBoost } from "../services/shared/departmentAliases.js";

// If the same physical file ends up as the "best match" for this many or more documents
// within one department, it's almost certainly a generic file (e.g. a department overview
// PDF) being reused by the department boost rather than a real per-document match.
const REUSE_FLAG_THRESHOLD = 3;

/**
 * For every document across every department, finds the single best-scoring physical file
 * by name similarity (document name vs. file name), boosted when the file's folder path
 * implies the same department. Always returns a best guess plus its confidence score/level,
 * since a perfect match can't be guaranteed for every document. Matches on a file that gets
 * reused across many documents in the same department are flagged and downgraded, since that
 * pattern means no dedicated file actually exists per document.
 */
export function matchDocumentsToFiles(departments, fileIndex) {
  const results = {};

  for (const [department, documents] of Object.entries(departments)) {
    const matches = documents.map((doc) => {
      let best = null;

      for (const file of fileIndex) {
        const pathString = [...file.folderSegments, file.fileName].join("/");
        const score = similarity(doc.documentName, file.fileName) + getDepartmentBoost(pathString, department);
        if (!best || score > best.score) {
          best = { filePath: file.filePath, score };
        }
      }

      return {
        documentName: doc.documentName,
        documentId: doc.documentId,
        matchedFilePath: best ? best.filePath : null,
        score: best ? Number(best.score.toFixed(3)) : 0
      };
    });

    const reuseCounts = new Map();
    for (const match of matches) {
      if (match.matchedFilePath) reuseCounts.set(match.matchedFilePath, (reuseCounts.get(match.matchedFilePath) || 0) + 1);
    }

    results[department] = matches.map((match) => {
      const reusedCount = reuseCounts.get(match.matchedFilePath) || 0;
      const isReused = reusedCount >= REUSE_FLAG_THRESHOLD;
      const createdAt = new Date().toISOString();
      return {
        ...match,
        id: randomUUID(),
        confidence: isReused ? "low" : confidenceLevel(match.score),
        reusedAcrossDocuments: isReused ? reusedCount : undefined,
        active: true,
        version: 1,
        history: [{ version: 1, timestamp: createdAt, editor: "system", action: "matched", changes: {} }]
      };
    });
  }

  return results;
}

function confidenceLevel(score) {
  if (score >= 0.6) return "high";
  if (score >= 0.35) return "medium";
  return "low";
}
