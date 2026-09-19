import { readFile } from "fs/promises";

export async function readAssetRegister(path) {
  const data = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(data)) throw new Error("Asset register must be a JSON array.");
  return data;
}
