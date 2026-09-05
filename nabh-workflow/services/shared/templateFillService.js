import { PDFDocument } from "pdf-lib";

/**
 * Loads a fillable PDF template and fills its text fields from a flat data object.
 * Fields present in the template but missing from `data` are left blank.
 * Unknown keys in `data` that have no matching field are silently ignored.
 */
export async function fillTemplate(templateBytes, data) {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  for (const field of form.getFields()) {
    const name = field.getName();
    const value = data[name];
    try {
      field.setText(value == null ? "" : String(value));
    } catch {
      // Field isn't a text field (e.g. checkbox/radio) - skip for this generic POC helper.
    }
  }

  form.flatten();
  return pdfDoc.save();
}
