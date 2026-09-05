import fs from "fs/promises";
import path from "path";

const IGNORED_FILE_PATTERNS = [/^\.DS_Store$/i, /^~\$/, /^~WRL/i, /\.tmp$/i];

function isIgnored(fileName) {
  return IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

/**
 * Recursively walks a directory and returns an index of real (non-lock, non-hidden) files:
 * [{ filePath, fileName, folderSegments (lowercased path segments relative to root) }, ...]
 */
export async function indexFiles(rootPath) {
  const files = [];

  async function walk(currentPath, segments) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath, [...segments, entry.name.toLowerCase()]);
      } else if (entry.isFile() && !isIgnored(entry.name)) {
        files.push({ filePath: entryPath, fileName: entry.name, folderSegments: segments });
      }
    }
  }

  await walk(rootPath, []);
  return files;
}
