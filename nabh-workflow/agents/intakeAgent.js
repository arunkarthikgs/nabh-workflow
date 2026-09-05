import { readTextFile } from "../services/shared/fileService.js";

export async function readComplaint(path) {
  return readTextFile(path);
}
