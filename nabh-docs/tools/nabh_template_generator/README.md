# NABH Template Generator

Creates reusable NABH document templates by replacing detected hospital-specific values with controlled placeholders.

## Supported input

- Text: `.txt`, `.md`, `.rtf`
- Word: `.docx` and legacy `.doc` (legacy `.doc` inputs produce `.docx` templates)
- Excel: `.xlsx`
- PowerPoint: `.pptx`
- PDF: `.pdf` (exports a `_TEMPLATE.txt` companion because PDF editing is not supported)

## Run

```bash
cd tools/nabh_template_generator
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python main.py
```

Place source documents in `input_documents/`. Generated templates are written to `output_templates/`; detection metadata is written to `output_templates/metadata/`.

To process a file or folder from another location, pass its path directly:

```bash
.venv/bin/python main.py "/Users/you/Documents/admission-policy.docx"
.venv/bin/python main.py "/Users/you/Documents/policies" --output "/Users/you/Documents/nabh-templates"
.venv/bin/python main.py "/Users/you/Documents/policies" --style-template "/Users/you/Documents/AAC_Policy_Template.docx"
```

## Placeholder detection

The generator detects hospital names, NABH document IDs, dates, named approval roles, partner organizations, and embedded logos. `ai_integration.py` is currently a pass-through extension point for a future AI workflow.

## Word formatting

For `.docx` input, the generator copies and updates the original Word document, preserving its page layout, paragraph styles, tables, headers, and embedded images. Text replacements retain the style of the paragraph's first text run.

Legacy `.doc` input is converted to a temporary `.docx`, then templated as a Word document. On macOS, the generator uses Microsoft Word when LibreOffice is unavailable. The output is always `.docx` and retains Word-compatible formatting, tables, headers, and layout.

## Excel and PowerPoint formatting

For `.xlsx` and `.pptx` input, the generator copies the original workbook or presentation and replaces detected values in text cells, text boxes, and table cells. Workbook formulas, images, charts, layouts, and presentation slide design are preserved.

## Word style reference

Pass `--style-template` with a DOCX policy template to apply its page setup and common Word styles to generated `.docx` files. Its embedded hospital-logo placeholder replaces document logos, a logo placeholder is added to headers without one, and name values in `Prepared By`, `Approved By`, `Reviewed By`, and `Audited By` table fields are replaced with the matching placeholders.

Input files and generated templates are ignored by Git. Folder markers are committed so the expected layout is preserved.
