import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

function escapeXml(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function processImageToFormat(inputBuffer, targetExtension) {
  if (!inputBuffer || inputBuffer.length === 0) return inputBuffer;
  const wantJpg = targetExtension === "jpg" || targetExtension === "jpeg";

  try {
    if (wantJpg) {
      return await sharp(inputBuffer)
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 90 })
        .toBuffer();
    } else {
      return await sharp(inputBuffer)
        .png()
        .toBuffer();
    }
  } catch (error) {
    console.warn("Sharp image conversion fallback:", error.message);
    return inputBuffer;
  }
}

export async function getHospitalLogoBuffer(hospital, targetExtension = "jpeg") {
  let rawBuffer = null;

  if (hospital?.logoDataUrl) {
    const match = String(hospital.logoDataUrl).match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
    if (match) {
      rawBuffer = Buffer.from(match[2], "base64");
    }
  }

  if (!rawBuffer && hospital?.logoPath) {
    const fileName = path.basename(hospital.logoPath);
    const localLogoPath = path.join(rootDir, "logos", fileName);
    try {
      rawBuffer = await readFile(localLogoPath);
    } catch {
      const baseName = path.basename(hospital.logoPath, path.extname(hospital.logoPath));
      for (const ext of [".jpg", ".png", ".jpeg", ".webp"]) {
        try {
          rawBuffer = await readFile(path.join(rootDir, "logos", `${baseName}${ext}`));
          break;
        } catch {}
      }
    }
  }

  if (!rawBuffer) {
    for (const fallbackName of ["logo.jpg", "logo.png", "aarogyam_hospital.png"]) {
      try {
        rawBuffer = await readFile(path.join(rootDir, fallbackName));
        break;
      } catch {}
    }
  }

  if (!rawBuffer) return null;

  const formattedBuffer = await processImageToFormat(rawBuffer, targetExtension);
  return { buffer: formattedBuffer, extension: targetExtension === "jpg" ? "jpeg" : targetExtension };
}

export async function customizeDocxTemplate(buffer, hospital) {
  try {
    const zip = await JSZip.loadAsync(buffer);

    const mediaFiles = Object.keys(zip.files).filter(
      (f) => f.startsWith("word/media/") && !zip.files[f].dir && !f.endsWith("/")
    );

    for (const mediaPath of mediaFiles) {
      const ext = path.extname(mediaPath).slice(1).toLowerCase();
      const logoObj = await getHospitalLogoBuffer(hospital, ext);
      if (logoObj && logoObj.buffer) {
        zip.file(mediaPath, logoObj.buffer, { createFolders: false });
      }
    }

    const hospitalName = escapeXml(hospital.name || "Hospital Repository");
    const hospitalCode = escapeXml(hospital.code || "HOSP");

    const xmlTargets = Object.keys(zip.files).filter(
      (f) => f.startsWith("word/") && (f.endsWith(".xml") || f.endsWith(".rels"))
    );

    for (const xmlFile of xmlTargets) {
      let xml = await zip.file(xmlFile).async("text");
      let modified = false;

      if (xml.includes("Janapriya Hosptial")) {
        xml = xml.replaceAll("Janapriya Hosptial", hospitalName);
        modified = true;
      }
      if (xml.includes("Janapriya Hospital")) {
        xml = xml.replaceAll("Janapriya Hospital", hospitalName);
        modified = true;
      }
      if (xml.includes("[Hospital Name]")) {
        xml = xml.replaceAll("[Hospital Name]", hospitalName);
        modified = true;
      }
      if (xml.includes("[Facility Code]")) {
        xml = xml.replaceAll("[Facility Code]", hospitalCode);
        modified = true;
      }

      if (modified) {
        zip.file(xmlFile, xml, { createFolders: false });
      }
    }

    for (const key of Object.keys(zip.files)) {
      if (zip.files[key]?.dir || key.endsWith("/")) {
        zip.remove(key);
      }
    }

    return await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
  } catch (error) {
    console.error("Error customizing DOCX template:", error.message);
    return buffer;
  }
}

export async function customizeXlsxTemplate(buffer, hospital) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const hospitalName = hospital.name || "Hospital Repository";
    const hospitalCode = hospital.code || "HOSP";

    workbook.eachSheet((worksheet) => {
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (typeof cell.value === "string") {
            let val = cell.value;
            let changed = false;
            if (val.includes("Janapriya Hosptial")) { val = val.replace(/Janapriya Hosptial/g, hospitalName); changed = true; }
            if (val.includes("Janapriya Hospital")) { val = val.replace(/Janapriya Hospital/g, hospitalName); changed = true; }
            if (val.includes("[Hospital Name]")) { val = val.replace(/\[Hospital Name\]/g, hospitalName); changed = true; }
            if (val.includes("[Facility Code]")) { val = val.replace(/\[Facility Code\]/g, hospitalCode); changed = true; }
            if (changed) cell.value = val;
          }
        });
      });
    });

    try {
      const logoObj = await getHospitalLogoBuffer(hospital);
      if (logoObj && logoObj.buffer) {
        const imageId = workbook.addImage({
          buffer: logoObj.buffer,
          extension: logoObj.extension === "jpeg" ? "jpeg" : "png"
        });
        const firstSheet = workbook.getWorksheet(1);
        if (firstSheet) {
          firstSheet.addImage(imageId, "A1:B3");
        }
      }
    } catch (imgError) {
      // Non-fatal image insertion fallback
    }

    const outputBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(outputBuffer);
  } catch (error) {
    return buffer;
  }
}

export async function customizeDocumentTemplate(buffer, relativePath, hospital) {
  if (!buffer || !hospital) return buffer;
  const ext = path.extname(String(relativePath || "")).toLowerCase();
  if (ext === ".docx") {
    return await customizeDocxTemplate(buffer, hospital);
  }
  if (ext === ".xlsx") {
    return await customizeXlsxTemplate(buffer, hospital);
  }
  return buffer;
}
