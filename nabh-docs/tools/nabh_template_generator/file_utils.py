import copy
import io
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

from docx import Document
from openpyxl import load_workbook
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.oxml.ns import qn
from pptx.util import Inches

from config import (
    PLACEHOLDER_MAP,
    SUPPORTED_DOC,
    SUPPORTED_DOCX,
    SUPPORTED_PDF,
    SUPPORTED_PPTX,
    SUPPORTED_TEXT,
    SUPPORTED_XLSX,
)

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

logger = logging.getLogger(__name__)


def extract_docx_logo(doc: Document) -> bool:
    """Detect whether a DOCX contains embedded images."""
    return any("image" in rel.target_ref for rel in doc.part._rels.values())


def extract_xlsx_logo(workbook) -> bool:
    """Detect whether an XLSX workbook contains embedded images."""
    return any(worksheet._images for worksheet in workbook.worksheets)


def extract_pptx_logo(presentation: Presentation) -> bool:
    """Detect whether a PPTX presentation contains embedded images."""
    return any(
        "image" in relationship.target_ref
        for slide in presentation.slides
        for relationship in slide.part.rels.values()
    )


def convert_doc_to_docx(path: str) -> str:
    """Convert a legacy DOC to DOCX while retaining Word document structure."""
    libre_office = shutil.which("soffice")
    output_dir = tempfile.mkdtemp(prefix="nabh-docx-")
    converted_path = os.path.join(output_dir, f"{os.path.splitext(os.path.basename(path))[0]}.docx")
    if libre_office:
        subprocess.run([libre_office, "--headless", "--convert-to", "docx", "--outdir", output_dir, path], check=True, capture_output=True, text=True)
    elif sys.platform == "darwin" and os.path.exists("/Applications/Microsoft Word.app"):
        script = """
on run argv
    set sourcePath to item 1 of argv
    set destinationPath to item 2 of argv
    tell application "Microsoft Word"
        open (POSIX file sourcePath)
        save as active document file name destinationPath file format 12
        close active document saving no
    end tell
end run
"""
        try:
            subprocess.run(["osascript", "-e", script, path, converted_path], check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as error:
            message = error.stderr.strip() or error.stdout.strip()
            raise RuntimeError(f"Microsoft Word could not convert the legacy .doc file. Allow terminal automation access to Microsoft Word, then retry. {message}") from error
    else:
        raise RuntimeError("Legacy .doc conversion requires LibreOffice, or Microsoft Word on macOS.")
    if not os.path.exists(converted_path):
        raise FileNotFoundError("The legacy DOC conversion did not produce a DOCX file.")
    return converted_path


def extract_pdf_logo(path: str) -> bool:
    """Detect whether a PDF contains embedded images."""
    if not pdfplumber:
        return False


    try:
        with pdfplumber.open(path) as pdf:
            return any(page.images for page in pdf.pages)
    except Exception:
        return False


def read_file(path: str) -> tuple[str, dict]:
    """Return extracted text and document metadata."""
    extension = os.path.splitext(path)[1].lower()
    metadata = {"has_logo": False}

    try:
        if extension in SUPPORTED_TEXT:
            with open(path, "r", encoding="utf-8") as file:
                return file.read(), metadata

        if extension in SUPPORTED_DOCX:
            document = Document(path)
            metadata["has_logo"] = extract_docx_logo(document)
            return "\n".join(paragraph.text for paragraph in iter_document_paragraphs(document)), metadata

        if extension in SUPPORTED_XLSX:
            workbook = load_workbook(path, data_only=False)
            metadata["has_logo"] = extract_xlsx_logo(workbook)
            return "\n".join(
                str(cell.value)
                for worksheet in workbook.worksheets
                for row in worksheet.iter_rows()
                for cell in row
                if isinstance(cell.value, str)
            ), metadata

        if extension in SUPPORTED_PPTX:
            presentation = Presentation(path)
            metadata["has_logo"] = extract_pptx_logo(presentation)
            return "\n".join(iter_presentation_text(presentation)), metadata

        if extension in SUPPORTED_DOC:
            result = subprocess.run(["textutil", "-convert", "txt", "-stdout", path], check=True, capture_output=True, text=True)
            return result.stdout, metadata

        if extension in SUPPORTED_PDF:
            metadata["has_logo"] = extract_pdf_logo(path)
            if not pdfplumber:
                return "", metadata
            with pdfplumber.open(path) as pdf:
                return "\n".join(page.extract_text() or "" for page in pdf.pages), metadata

        logger.warning("Unsupported file type: %s", path)
    except Exception as error:
        logger.error("Error reading file %s: %s", path, error)

    return "", metadata


def iter_table_paragraphs(table):
    """Yield paragraphs from a table, including nested tables."""
    for row in table.rows:
        for cell in row.cells:
            yield from cell.paragraphs
            for nested_table in cell.tables:
                yield from iter_table_paragraphs(nested_table)


def iter_document_paragraphs(document: Document):
    """Yield document, table, header, and footer paragraphs."""
    yield from document.paragraphs
    for table in document.tables:
        yield from iter_table_paragraphs(table)
    for section in document.sections:
        for story in (
            section.header,
            section.first_page_header,
            section.even_page_header,
            section.footer,
            section.first_page_footer,
            section.even_page_footer,
        ):
            yield from story.paragraphs
            for table in story.tables:
                yield from iter_table_paragraphs(table)


def replace_document_text(document: Document, transform) -> None:
    """Transform text without rebuilding Word document structure."""
    for paragraph in iter_document_paragraphs(document):
        replace_paragraph_text(paragraph, transform(paragraph.text))


def replace_document_logos(document: Document) -> None:
    """Replace embedded Word images with the configured logo placeholder."""
    for paragraph in iter_document_paragraphs(document):
        for run in paragraph.runs:
            drawings = [child for child in run._r if child.tag.endswith("}drawing")]
            if not drawings:
                continue
            for drawing in drawings:
                run._r.remove(drawing)
            run.add_text(PLACEHOLDER_MAP["logo"])


def remove_docx_watermarks(path: str) -> None:
    """Remove Microsoft Word VML watermark shapes from DOCX headers."""
    powerplus_pattern = re.compile(r'<v:shape\b[^>]*\bid="PowerPlusWaterMarkObject[^"]*"[^>]*>.*?</v:shape>', re.DOTALL)
    background_anchor_pattern = re.compile(r'<wp:anchor\b[^>]*\bbehindDoc="1"[^>]*>.*?</wp:anchor>', re.DOTALL)
    with zipfile.ZipFile(path, "r") as source:
        entries = [(entry, source.read(entry.filename)) for entry in source.infolist()]
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as destination:
        for entry, content in entries:
            if entry.filename.startswith("word/") and entry.filename.endswith(".xml"):
                xml = content.decode("utf-8")
                xml = powerplus_pattern.sub("", xml)
                content = background_anchor_pattern.sub("", xml).encode("utf-8")
            destination.writestr(entry, content)


def copy_reference_style(document: Document, reference_path: str) -> None:
    """Apply the shared page, common text styles, and logo placeholder from a DOCX reference."""
    reference = Document(reference_path)
    reference_section = reference.sections[0]

    for section in document.sections:
        for attribute in (
            "page_width",
            "page_height",
            "orientation",
            "top_margin",
            "bottom_margin",
            "left_margin",
            "right_margin",
            "header_distance",
            "footer_distance",
            "gutter",
        ):
            setattr(section, attribute, getattr(reference_section, attribute))

    for style_name in ("Normal", "Heading 1", "Heading 2", "Heading 3", "No Spacing", "Header", "Footer"):
        try:
            source_style = reference.styles[style_name]
            target_style = document.styles[style_name]
        except KeyError:
            continue
        target_style._element.getparent().replace(target_style._element, copy.deepcopy(source_style._element))

    logo_blob = get_reference_logo_blob(reference)
    if logo_blob:
        replace_document_logo_images(document, logo_blob)
        add_header_logo_placeholder(document, logo_blob)
    replace_signatory_names(document)


def get_reference_logo_blob(reference: Document) -> bytes | None:
    """Return the first embedded image from the reference document."""
    for part in [reference.part, *(section.header.part for section in reference.sections)]:
        for relationship in part.rels.values():
            if relationship.reltype.endswith("/image"):
                return relationship.target_part.blob
    return None


def replace_document_logo_images(document: Document, logo_blob: bytes) -> None:
    """Replace embedded document images with the reference logo placeholder graphic."""
    for part in [document.part, *(section.header.part for section in document.sections), *(section.footer.part for section in document.sections)]:
        for relationship in part.rels.values():
            if relationship.reltype.endswith("/image"):
                relationship.target_part._blob = logo_blob


def add_header_logo_placeholder(document: Document, logo_blob: bytes) -> None:
    """Add the shared logo placeholder to headers that do not already contain an image."""
    for section in document.sections:
        header = section.header
        if any(relationship.reltype.endswith("/image") for relationship in header.part.rels.values()):
            continue
        paragraph = header.paragraphs[0] if header.paragraphs else header.add_paragraph()
        paragraph.alignment = 1
        paragraph.add_run().add_picture(io.BytesIO(logo_blob), width=1451925, height=906780)


def replace_signatory_names(document: Document) -> None:
    """Replace personal names in table cells immediately following signatory labels."""
    for table in iter_document_tables(document):
        for row in table.rows:
            cells = list(row.cells)
            for index, cell in enumerate(cells[:-1]):
                role = get_signatory_role(cell.text)
                if not role:
                    continue
                for value_cell in cells[index + 1:]:
                    if value_cell.text.strip():
                        replace_cell_text(value_cell, PLACEHOLDER_MAP[role])
                        break


def iter_document_tables(document: Document):
    """Yield document, header, and footer tables."""
    yield from document.tables
    for section in document.sections:
        for story in (section.header, section.first_page_header, section.even_page_header, section.footer, section.first_page_footer, section.even_page_footer):
            yield from story.tables


def get_signatory_role(text: str) -> str | None:
    """Map a signatory label to its name placeholder key."""
    normalized = re.sub(r"\s+", " ", text).strip().rstrip(":").lower()
    roles = {
        "prepared by": "prepared_by",
        "approved by": "approved_by",
        "reviewed by": "reviewed_by",
        "audited by": "audited_by",
    }
    return roles.get(normalized)


def replace_cell_text(cell, replacement: str) -> None:
    """Replace all text in a table cell while keeping its first paragraph formatting."""
    if not cell.paragraphs:
        cell.add_paragraph(replacement)
        return
    replace_paragraph_text(cell.paragraphs[0], replacement)
    for paragraph in cell.paragraphs[1:]:
        replace_paragraph_text(paragraph, "")


def replace_paragraph_text(paragraph, updated: str) -> None:
    """Replace paragraph text while preserving paragraph properties and first-run styling."""
    if updated == paragraph.text:
        return
    if paragraph.runs:
        paragraph.runs[0].text = updated
        for run in paragraph.runs[1:]:
            run.text = ""
    else:
        paragraph.add_run(updated)


def iter_presentation_text(presentation: Presentation):
    """Yield visible text from presentation shapes and table cells."""
    for slide in presentation.slides:
        for shape in slide.shapes:
            if shape.has_text_frame:
                yield from (paragraph.text for paragraph in shape.text_frame.paragraphs)
            if shape.has_table:
                for row in shape.table.rows:
                    for cell in row.cells:
                        yield from (paragraph.text for paragraph in cell.text_frame.paragraphs)


def replace_presentation_text(presentation: Presentation, transform) -> None:
    """Transform text in presentation shapes and tables without rebuilding slides."""
    for slide in presentation.slides:
        for shape in slide.shapes:
            if shape.has_text_frame:
                replace_text_frame(shape.text_frame, transform)
            if shape.has_table:
                for row in shape.table.rows:
                    for cell in row.cells:
                        replace_text_frame(cell.text_frame, transform)


def replace_presentation_logos(presentation: Presentation, logo_blob: bytes) -> None:
    """Replace small, top-left presentation logo images with the reference placeholder."""
    for slide in presentation.slides:
        for shape in slide.shapes:
            if not is_presentation_logo(shape):
                continue
            relationship_id = shape._element.blipFill.blip.get(qn("r:embed"))
            shape.part.rels[relationship_id].target_part._blob = logo_blob


def is_presentation_logo(shape) -> bool:
    """Identify a header logo without replacing charts or full-slide images."""
    return (
        shape.shape_type == MSO_SHAPE_TYPE.PICTURE
        and shape.left <= Inches(1)
        and shape.top <= Inches(1)
        and Inches(1) <= shape.width <= Inches(4)
        and Inches(0.5) <= shape.height <= Inches(2.5)
    )


def replace_text_frame(text_frame, transform) -> None:
    """Replace text frame paragraphs while retaining the first run's formatting."""
    for paragraph in text_frame.paragraphs:
        updated = transform(paragraph.text)
        if updated == paragraph.text:
            continue
        if paragraph.runs:
            paragraph.runs[0].text = updated
            for run in paragraph.runs[1:]:
                paragraph._p.remove(run._r)
        else:
            paragraph.add_run().text = updated


def write_file(path: str, content: str, source_path: str | None = None, transform=None, replace_logo: bool = False, style_template_path: str | None = None) -> None:
    """Write a generated template in a supported format."""
    extension = os.path.splitext(path)[1].lower()

    try:
        if extension in SUPPORTED_TEXT:
            with open(path, "w", encoding="utf-8") as file:
                file.write(content)
            return

        if extension in SUPPORTED_DOCX:
            if source_path and os.path.splitext(source_path)[1].lower() == ".docx":
                temporary_source = tempfile.NamedTemporaryFile(suffix=".docx", delete=False)
                temporary_source.close()
                try:
                    shutil.copy2(source_path, temporary_source.name)
                    remove_docx_watermarks(temporary_source.name)
                    document = Document(temporary_source.name)
                    replace_document_text(document, transform or (lambda _text: content))
                    if style_template_path:
                        copy_reference_style(document, style_template_path)
                    elif replace_logo:
                        replace_document_logos(document)
                finally:
                    os.unlink(temporary_source.name)
            else:
                document = Document()
                for line in content.split("\n"):
                    document.add_paragraph(line)
            document.save(path)
            return

        if extension in SUPPORTED_XLSX:
            workbook = load_workbook(source_path)
            for worksheet in workbook.worksheets:
                for row in worksheet.iter_rows():
                    for cell in row:
                        if isinstance(cell.value, str) and not cell.value.startswith("="):
                            cell.value = (transform or (lambda _text: content))(cell.value)
            workbook.save(path)
            return

        if extension in SUPPORTED_PPTX:
            presentation = Presentation(source_path)
            replace_presentation_text(presentation, transform or (lambda _text: content))
            if style_template_path:
                replace_presentation_logos(presentation, get_reference_logo_blob(Document(style_template_path)))
            presentation.save(path)
            return

        if extension in SUPPORTED_PDF:
            text_path = path.replace(".pdf", "_TEMPLATE.txt")
            with open(text_path, "w", encoding="utf-8") as file:
                file.write(content)
            return

        logger.warning("Unsupported output type: %s", path)
    except Exception as error:
        logger.error("Error writing file %s: %s", path, error)
