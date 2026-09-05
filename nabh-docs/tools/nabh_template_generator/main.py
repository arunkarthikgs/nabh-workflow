import argparse
import json
import logging
from pathlib import Path

from ai_integration import send_to_ai_workflow
from file_utils import convert_doc_to_docx, read_file, write_file
from replacer import detect_placeholders, replace_placeholders

BASE_DIR = Path(__file__).resolve().parent
INPUT_DIR = BASE_DIR / "input_documents"
OUTPUT_DIR = BASE_DIR / "output_templates"
METADATA_DIR = OUTPUT_DIR / "metadata"
SUPPORTED_EXTENSIONS = {".doc", ".docx", ".txt", ".md", ".rtf", ".pdf", ".xlsx", ".pptx"}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def process_documents(input_path: Path = INPUT_DIR, output_dir: Path = OUTPUT_DIR, style_template: Path | None = None) -> None:
    """Generate templates and metadata for all supported input documents."""
    metadata_dir = output_dir / "metadata"
    output_dir.mkdir(parents=True, exist_ok=True)
    metadata_dir.mkdir(parents=True, exist_ok=True)

    input_files = [input_path] if input_path.is_file() else input_path.rglob("*")
    for source_path in input_files:
        if not source_path.is_file() or source_path.name.startswith("."):
            continue
        if source_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            logger.warning("Skipping unsupported file: %s", source_path.name)
            continue

        relative_path = Path(source_path.name) if input_path.is_file() else source_path.relative_to(input_path)
        output_extension = ".docx" if relative_path.suffix.lower() == ".doc" else relative_path.suffix
        output_name = f"{relative_path.stem}_TEMPLATE{output_extension}"
        output_path = output_dir / relative_path.parent / output_name
        metadata_path = metadata_dir / relative_path.parent / f"{relative_path.stem}_metadata.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info("Processing: %s", relative_path)
        try:
            document_source = str(source_path)
            if source_path.suffix.lower() == ".doc":
                document_source = convert_doc_to_docx(str(source_path))
            content, file_metadata = read_file(document_source)
        except Exception as error:
            logger.error("Unable to prepare %s: %s", relative_path, error)
            continue
        if not content.strip():
            logger.warning("Empty or unreadable file: %s", relative_path)
            continue

        try:
            detected = detect_placeholders(content, file_metadata)
            updated = send_to_ai_workflow(replace_placeholders(content, detected), detected)
            transform = lambda text: send_to_ai_workflow(replace_placeholders(text, detect_placeholders(text, {"has_logo": False})), file_metadata)
            write_file(str(output_path), updated, document_source, transform, file_metadata.get("has_logo", False), str(style_template) if style_template else None)
            metadata_path.write_text(json.dumps(detected, indent=2, ensure_ascii=False), encoding="utf-8")
            logger.info("Template generated: %s", output_path)
        except Exception as error:
            logger.error("Error processing %s: %s", relative_path, error)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate NABH document templates from a file or directory.")
    parser.add_argument("input", nargs="?", type=Path, default=INPUT_DIR, help="Input file or directory. Defaults to input_documents/.")
    parser.add_argument("--output", "-o", type=Path, default=OUTPUT_DIR, help="Output directory. Defaults to output_templates/.")
    parser.add_argument("--style-template", type=Path, help="DOCX template whose page setup, common styles, and logo placeholder are applied to generated Word templates.")
    arguments = parser.parse_args()
    if not arguments.input.exists():
        parser.error(f"Input path does not exist: {arguments.input}")
    if arguments.style_template and not arguments.style_template.is_file():
        parser.error(f"Style template does not exist: {arguments.style_template}")
    process_documents(arguments.input.resolve(), arguments.output.resolve(), arguments.style_template.resolve() if arguments.style_template else None)
    logger.info("All documents processed.")
