// Produces a visual-preservation copy of the AAC policy with its pale gray watermark removed.
// The original page pixels are retained at 200 DPI; the resulting PDF content is image-based.
import { execFile } from "child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument } from "pdf-lib";

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout);
    });
  });
}

async function run() {
  const sourcePath = fileURLToPath(new URL("../output/AAC_Policy.pdf", import.meta.url));
  const outputPath = fileURLToPath(new URL("../output/AAC_Policy_Clean.pdf", import.meta.url));
  const workDir = await mkdtemp(path.join(tmpdir(), "aac-policy-"));
  const renderedPrefix = path.join(workDir, "source");

  try {
    await runCommand("pdftoppm", ["-png", "-r", "200", sourcePath, renderedPrefix]);
    const sourceImages = (await readdir(workDir))
      .filter((name) => name.startsWith("source-") && name.endsWith(".png"))
      .sort();

    const cleanImages = [];
    for (const imageName of sourceImages) {
      const inputPath = path.join(workDir, imageName);
      const outputImagePath = path.join(workDir, `clean-${imageName}`);
      await runCommand("magick", [inputPath, "-fill", "white", "-fuzz", "18%", "-opaque", "#DFDFDF", outputImagePath]);
      cleanImages.push(outputImagePath);
    }

    const pdf = await PDFDocument.create();
    for (const imagePath of cleanImages) {
      const image = await pdf.embedPng(await readFile(imagePath));
      const page = pdf.addPage([612, 792]);
      page.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
    }

    await writeFile(outputPath, await pdf.save());
    console.log(`Watermark-free AAC policy PDF generated: ${outputPath}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
