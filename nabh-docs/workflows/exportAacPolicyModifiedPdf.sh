#!/bin/zsh
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
source_file="$project_root/output/AAC_Policy_Modified.docx"
output_file="$project_root/output/AAC_Policy_Presentation.pdf"

osascript -e 'tell application "Microsoft Word"' \
  -e "set sourceFile to POSIX file \"$source_file\"" \
  -e 'open sourceFile' \
  -e 'set activeDoc to active document' \
  -e "save as activeDoc file name \"$output_file\" file format format PDF" \
  -e 'close activeDoc saving no' \
  -e 'end tell'

echo "AAC policy preview PDF generated from modified Word document: $output_file"
