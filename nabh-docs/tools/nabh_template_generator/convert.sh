#!/bin/bash

INPUT_DIR="/Users/vkartsu/Downloads/Final"
OUTPUT_DIR="/Users/vkartsu/SFTPConfig/output_office"

LIBREOFFICE="/Applications/LibreOffice.app/Contents/MacOS/soffice"

mkdir -p "$OUTPUT_DIR"

find "$INPUT_DIR" -type f | while read -r SRC_FILE
do
    FILE_NAME=$(basename "$SRC_FILE")

    # Skip Office temp files
    [[ "$FILE_NAME" =~ ^~\$ ]] && continue

    EXTENSION="${FILE_NAME##*.}"
    EXTENSION=$(echo "$EXTENSION" | tr '[:upper:]' '[:lower:]')

    case "$EXTENSION" in
        doc)
            TARGET_EXT="docx"
            ;;
        xls)
            TARGET_EXT="xlsx"
            ;;
        ppt)
            TARGET_EXT="pptx"
            ;;
        *)
            continue
            ;;
    esac

    REL_PATH="${SRC_FILE#$INPUT_DIR/}"
    REL_DIR=$(dirname "$REL_PATH")

    mkdir -p "$OUTPUT_DIR/$REL_DIR"

    BASE_NAME="${FILE_NAME%.*}"
    DEST_FILE="$OUTPUT_DIR/$REL_DIR/${BASE_NAME}.${TARGET_EXT}"

    if [ -f "$DEST_FILE" ]; then
        echo "Skipping existing: $DEST_FILE"
        continue
    fi

    echo "Converting: $SRC_FILE"

    "$LIBREOFFICE" \
        --headless \
        --convert-to "$TARGET_EXT" \
        --outdir "$OUTPUT_DIR/$REL_DIR" \
        "$SRC_FILE"

done

echo "Done."
