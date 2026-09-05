// Creates a presentation copy of the AAC policy without rewriting its content.
// Each source PDF page is embedded directly in a branded frame, preserving all source text.
import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 42;
const CONTENT_Y = 54;
const CONTENT_HEIGHT = 674;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const green = rgb(0.0, 0.47, 0.28);
const teal = rgb(0.18, 0.53, 0.6);
const charcoal = rgb(0.13, 0.17, 0.2);
const paleGreen = rgb(0.94, 0.98, 0.96);
const muted = rgb(0.42, 0.47, 0.49);

function text(page, font, value, x, y, size, color = charcoal) {
  page.drawText(value, { x, y, size, font, color });
}

function drawFrame(page, regular, pageNumber) {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 22, width: PAGE_WIDTH, height: 22, color: green });
  text(page, regular, "JANAPRIYA HOSPITAL  |  NABH POLICY LIBRARY", MARGIN_X, PAGE_HEIGHT - 15, 7.5, rgb(1, 1, 1));
  page.drawRectangle({ x: MARGIN_X - 2, y: CONTENT_Y - 2, width: CONTENT_WIDTH + 4, height: CONTENT_HEIGHT + 4, color: paleGreen });
  page.drawRectangle({ x: MARGIN_X, y: CONTENT_Y, width: CONTENT_WIDTH, height: CONTENT_HEIGHT, color: rgb(1, 1, 1), borderColor: rgb(0.8, 0.87, 0.84), borderWidth: 0.6 });
  text(page, regular, "AAC POLICY  |  JPH/NABH/D-14A/Rev 00", MARGIN_X, 25, 7.5, muted);
  text(page, regular, `Page ${pageNumber}`, PAGE_WIDTH - MARGIN_X - 34, 25, 7.5, muted);
}

async function run() {
  const sourcePath = fileURLToPath(new URL("../output/AAC_Policy_Clean.pdf", import.meta.url));
  const logoPath = fileURLToPath(new URL("../logo.png", import.meta.url));
  const outputPath = fileURLToPath(new URL("../output/AAC_Policy_Presentation.pdf", import.meta.url));

  const source = await PDFDocument.load(await readFile(sourcePath));
  const presentation = await PDFDocument.create();
  const regular = await presentation.embedFont(StandardFonts.Helvetica);
  const bold = await presentation.embedFont(StandardFonts.HelveticaBold);
  const italic = await presentation.embedFont(StandardFonts.HelveticaOblique);
  const logo = await presentation.embedPng(await readFile(logoPath));

  const cover = presentation.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  cover.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: paleGreen });
  cover.drawRectangle({ x: 0, y: PAGE_HEIGHT - 26, width: PAGE_WIDTH, height: 26, color: green });
  cover.drawImage(logo, { x: 194, y: 568, width: 224, height: 133 });
  cover.drawRectangle({ x: 82, y: 445, width: 448, height: 2, color: teal });
  text(cover, bold, "ACCESS, ASSESSMENT AND", 110, 390, 25, green);
  text(cover, bold, "CONTINUITY OF CARE", 110, 354, 25, green);
  text(cover, regular, "AAC POLICY", 110, 319, 11, muted);
  cover.drawRectangle({ x: 110, y: 194, width: 392, height: 86, color: rgb(1, 1, 1), borderColor: rgb(0.76, 0.85, 0.81), borderWidth: 0.7 });
  text(cover, bold, "Reference", 132, 249, 9, muted);
  text(cover, regular, "JPH/NABH/D-14A/Rev 00", 250, 249, 10);
  text(cover, bold, "Issued", 132, 222, 9, muted);
  text(cover, regular, "Nov 2023", 250, 222, 10);
  text(cover, bold, "Revision", 132, 205, 9, muted);
  text(cover, regular, "00", 250, 205, 10);
  text(cover, italic, "Presentation copy. Source policy content follows unchanged.", 145, 102, 9, muted);

  const embeddedPages = await presentation.embedPdf(source, source.getPageIndices());
  embeddedPages.forEach((embeddedPage, index) => {
    const page = presentation.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawFrame(page, regular, index + 1);
    const scale = Math.min(CONTENT_WIDTH / embeddedPage.width, CONTENT_HEIGHT / embeddedPage.height);
    const width = embeddedPage.width * scale;
    const height = embeddedPage.height * scale;
    page.drawPage(embeddedPage, {
      x: MARGIN_X + (CONTENT_WIDTH - width) / 2,
      y: CONTENT_Y + (CONTENT_HEIGHT - height) / 2,
      width,
      height
    });
  });

  await writeFile(outputPath, await presentation.save());
  console.log(`AAC policy presentation generated: ${outputPath}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
