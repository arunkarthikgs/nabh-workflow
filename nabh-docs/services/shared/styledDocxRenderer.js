// Styled DOCX renderer for Template Studio's generated documents. Reproduces the visual language
// used across the NABH SOP/Policy reference templates: navy header/footer with a bottom/top rule,
// a centered title block (logo + hospital/document names + standard reference), a navy-and-zebra
// data-table style, and red-italic highlighting for [BRACKETED] hospital-specific placeholders.
import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, LevelFormat, Packer, PageNumber,
  Paragraph, ShadingType, Table, TableCell, TableRow, TabStopType, TextRun, WidthType, convertInchesToTwip
} from "docx";

const NAVY = "1F3864";
const BORDER_BLUE = "8EA9C1";
const LABEL_FILL = "DCE6F1";
const ZEBRA_FILL = "F2F2F2";
const GRAY_TEXT = "595959";
const PLACEHOLDER_COLOR = "C0392B";
const FONT = "Calibri";
const PLACEHOLDER_PATTERN = /(\[[^\]]+\])/g;

// Splits text on [BRACKETED] placeholders (the convention our AI prompt uses) and renders them in
// red italic, matching how the reference templates highlight hospital-specific fill-in fields.
function placeholderRuns(text, { size = 23, bold = false, color } = {}) {
  const parts = String(text ?? "").split(PLACEHOLDER_PATTERN).filter((part) => part !== "");
  if (!parts.length) return [new TextRun({ text: "", font: FONT })];
  return parts.map((part) => {
    const isPlaceholder = part.startsWith("[") && part.endsWith("]");
    return new TextRun({ text: part, font: FONT, size, bold, italics: isPlaceholder || undefined, color: isPlaceholder ? PLACEHOLDER_COLOR : color });
  });
}

function cellBorders(color = BORDER_BLUE) {
  const edge = { style: BorderStyle.SINGLE, size: 4, color };
  return { top: edge, bottom: edge, left: edge, right: edge };
}

function shading(fill) {
  return { type: ShadingType.CLEAR, color: "auto", fill };
}

// Small placeholder logo (navy dashed border + label) so the template has a visual anchor where a
// hospital crest will later go - generated in-memory via sharp, no temp files or bundled fonts.
async function logoImageBuffer() {
  const sharp = (await import("sharp")).default;
  const width = 420, height = 160;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="4" y="4" width="${width - 8}" height="${height - 8}" fill="none" stroke="#1F3864" stroke-width="3" stroke-dasharray="10,6"/>
    <text x="50%" y="46%" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="bold" fill="#1F3864">HOSPITAL LOGO</text>
    <text x="50%" y="66%" text-anchor="middle" font-family="sans-serif" font-size="14" font-style="italic" fill="#8c8c8c">replace with hospital crest</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function headerParagraphs(hospitalPlaceholder, docTypeLabel, docNamePlaceholder) {
  return [
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: convertInchesToTwip(7) }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: NAVY, space: 4 } },
      children: [
        new TextRun({ text: hospitalPlaceholder, bold: true, color: NAVY, size: 20, font: FONT }),
        new TextRun({ text: `\t${docTypeLabel}: ${docNamePlaceholder}`, color: GRAY_TEXT, size: 20, font: FONT })
      ]
    })
  ];
}

function footerParagraphs() {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: NAVY, space: 4 } },
      children: [
        new TextRun({ text: "Confidential — Internal Use Only  |  Page ", color: GRAY_TEXT, size: 19, font: FONT }),
        new TextRun({ children: [PageNumber.CURRENT], color: GRAY_TEXT, size: 19, font: FONT }),
        new TextRun({ text: " of ", color: GRAY_TEXT, size: 19, font: FONT }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], color: GRAY_TEXT, size: 19, font: FONT })
      ]
    })
  ];
}

async function titleBlockParagraphs({ hospitalPlaceholder, docTypeLabel, docNamePlaceholder, standardRefPlaceholder, chapterPlaceholder }) {
  const paragraphs = [];
  try {
    const image = await logoImageBuffer();
    paragraphs.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: image, transformation: { width: 150, height: 57 }, type: "png" })] }));
  } catch { /* logo is decorative only - skip silently if image generation isn't available */ }

  paragraphs.push(
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: hospitalPlaceholder, bold: true, size: 48, color: NAVY, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "NABH Accreditation Controlled Document", italics: true, size: 25, color: GRAY_TEXT, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: docTypeLabel.toUpperCase(), bold: true, size: 28, font: FONT })] }),
    new Paragraph({ text: "" }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: docNamePlaceholder, bold: true, italics: true, size: 38, color: NAVY, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `NABH Standard Reference: ${standardRefPlaceholder} — ${chapterPlaceholder}`, italics: true, size: 23, color: GRAY_TEXT, font: FONT })] }),
    new Paragraph({ text: "" })
  );
  return paragraphs;
}

function heading1(number, text) {
  return new Paragraph({
    spacing: { before: 320, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: NAVY, space: 4 } },
    children: [new TextRun({ text: `${number}. ${text}`, bold: true, size: 31, color: NAVY, font: FONT })]
  });
}

function bodyParagraph(text) {
  return new Paragraph({ spacing: { after: 160 }, children: placeholderRuns(text) });
}

function numberedListParagraphs(items, numberingReference) {
  return items.map((item) => new Paragraph({ numbering: { reference: numberingReference, level: 0 }, spacing: { after: 120 }, children: placeholderRuns(item) }));
}

// Navy header row (white bold text) + zebra-striped data rows, matching the reference style.
function dataTable(headers, rows) {
  const columnWidth = Math.floor(9000 / Math.max(headers.length, 1));
  const headerRow = new TableRow({
    children: headers.map((header) => new TableCell({
      width: { size: columnWidth, type: WidthType.DXA },
      borders: cellBorders(),
      shading: shading(NAVY),
      children: [new Paragraph({ children: [new TextRun({ text: header, bold: true, color: "FFFFFF", size: 23, font: FONT })] })]
    }))
  });
  const dataRows = rows.map((row, rowIndex) => new TableRow({
    children: row.map((value) => new TableCell({
      width: { size: columnWidth, type: WidthType.DXA },
      borders: cellBorders(),
      shading: rowIndex % 2 === 1 ? shading(ZEBRA_FILL) : undefined,
      children: [new Paragraph({ children: placeholderRuns(String(value ?? "")) })]
    }))
  }));
  return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] }), new Paragraph({ text: "" })];
}

// Assigns each section's numbered_list a fresh, independently-restarting numbering definition -
// the docx package needs all numbering configs declared up front on the Document.
function collectNumberingConfigs(sections) {
  const configs = [];
  const referenceBySection = new Map();
  sections.forEach((section, index) => {
    if (!Array.isArray(section?.numbered_list) || !section.numbered_list.length) return;
    const reference = `template-list-${index}`;
    referenceBySection.set(index, reference);
    configs.push({
      reference,
      levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START, style: { paragraph: { indent: { left: convertInchesToTwip(0.31), hanging: convertInchesToTwip(0.18) } } } }]
    });
  });
  return { configs, referenceBySection };
}

// Renders the AI provider's structured JSON into a styled .docx buffer. `context` supplies the
// hospital/document-scope placeholders shown in the header/footer/title block; department and
// standardRef come from the seed document (when the job was generated from one).
export async function buildStyledDocx(template, context = {}) {
  const sections = Array.isArray(template?.sections) ? template.sections : [];
  const docTypeLabel = String(template?.document_number_label || "Document No.").replace(/\s*No\.?$/i, "").trim() || "Document";
  const docNamePlaceholder = template?.title || "Untitled Document";
  const hospitalPlaceholder = "[HOSPITAL NAME]";
  const standardRefPlaceholder = context.standardRef || "[STANDARD REFERENCE]";
  const chapterPlaceholder = context.department || "[CHAPTER]";

  const { configs, referenceBySection } = collectNumberingConfigs(sections);

  const body = [
    ...await titleBlockParagraphs({ hospitalPlaceholder, docTypeLabel, docNamePlaceholder, standardRefPlaceholder, chapterPlaceholder })
  ];

  sections.forEach((section, index) => {
    body.push(heading1(index + 1, section.heading || ""));
    for (const paragraph of Array.isArray(section.paragraphs) ? section.paragraphs : []) body.push(bodyParagraph(paragraph));
    if (Array.isArray(section.numbered_list) && section.numbered_list.length) body.push(...numberedListParagraphs(section.numbered_list, referenceBySection.get(index)));
    if (section.table?.headers?.length) body.push(...dataTable(section.table.headers, section.table.rows || []));
  });

  const document = new Document({
    numbering: { config: configs },
    sections: [{
      properties: { page: { size: { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) }, margin: { top: convertInchesToTwip(0.75), bottom: convertInchesToTwip(0.75), left: convertInchesToTwip(0.75), right: convertInchesToTwip(0.75) } } },
      headers: { default: new Header({ children: headerParagraphs(hospitalPlaceholder, docTypeLabel, docNamePlaceholder) }) },
      footers: { default: new Footer({ children: footerParagraphs() }) },
      children: body
    }]
  });
  return Packer.toBuffer(document);
}
