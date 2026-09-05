import { readdir, readFile, rm, writeFile } from "fs/promises";
import { execFile } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import { promisify } from "util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const web = path.join(root, "web");
const generatedData = path.join(web, "src", "generatedStaticData.js");

const hospitals = JSON.parse(await readFile(path.join(root, "output", "hospitals.json"), "utf8"));
const documents = JSON.parse(await readFile(path.join(root, "output", "documentMatches.json"), "utf8"));
const logos = {};
for (const hospital of hospitals) {
  if (!hospital.logoPath) continue;
  const filename = path.basename(hospital.logoPath);
  logos[hospital.logoPath] = `data:image/png;base64,${(await readFile(path.join(root, "logos", filename))).toString("base64")}`;
  hospital.logoPath = logos[hospital.logoPath];
}
await writeFile(generatedData, `export const hospitals = ${JSON.stringify(hospitals)};\nexport const documents = ${JSON.stringify(documents)};\n`);
await exec("npm", ["run", "build", "--", "--mode", "static-demo"], { cwd: web });
const buildPath = path.join(web, "dist");
const index = await readFile(path.join(buildPath, "index.html"), "utf8");
const scriptFile = index.match(/src="\.\/(assets\/[^\"]+\.js)"/)?.[1];
const styleFile = index.match(/href="\.\/(assets\/[^\"]+\.css)"/)?.[1];
if (!scriptFile || !styleFile) throw new Error("Unable to locate static build assets.");
let [script, style] = await Promise.all([readFile(path.join(buildPath, scriptFile), "utf8"), readFile(path.join(buildPath, styleFile), "utf8")]);
const assetDir = path.join(buildPath, "assets");
for (const filename of await readdir(assetDir)) {
  const extension = path.extname(filename).toLowerCase();
  const mimeType = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" }[extension];
  if (!mimeType) continue;
  const dataUrl = `data:${mimeType};base64,${(await readFile(path.join(assetDir, filename))).toString("base64")}`;
  script = script.replaceAll(filename, dataUrl);
  style = style.replaceAll(filename, dataUrl);
}
const standalone = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>NABH Hospital Management Demo</title><style>${style}</style></head><body><div id="root"></div><script type="module">${script}</script></body></html>`;
await rm(path.join(root, "static-prototype"), { recursive: true, force: true });
await writeFile(path.join(root, "prototype.html"), standalone);
console.log(`Full static prototype generated: ${path.join(root, "prototype.html")}`);
