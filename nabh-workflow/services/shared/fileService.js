import fs from "fs/promises";

export async function readTextFile(path) {
  return fs.readFile(path, "utf8");
}

export async function writeBinaryFile(path, buffer) {
  return fs.writeFile(path, buffer);
}
