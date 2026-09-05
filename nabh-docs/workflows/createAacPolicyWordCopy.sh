#!/bin/zsh
set -euo pipefail

source_file="/Users/vkartsu/Downloads/Final/NABH policies/AAC policy.doc"
project_root="$(cd "$(dirname "$0")/.." && pwd)"
output_file="$project_root/output/AAC_Policy_Modified.docx"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

osascript -e 'tell application "Microsoft Word"' \
  -e "set sourceFile to POSIX file \"$source_file\"" \
  -e 'open sourceFile' \
  -e 'set activeDoc to active document' \
  -e "save as activeDoc file name \"$temp_dir/source.docx\" file format format document" \
  -e 'close activeDoc saving no' \
  -e 'end tell'

ditto -x -k "$temp_dir/source.docx" "$temp_dir/docx"
perl -0pi -e 's{<v:shape id="PowerPlusWaterMarkObject[^"]*".*?</v:shape>}{}gs' "$temp_dir"/docx/word/header*.xml
cd "$temp_dir/docx"
zip -X -qr "$output_file" .

echo "Modified AAC policy Word document generated: $output_file"
