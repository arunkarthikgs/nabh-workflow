#!/bin/zsh
set -euo pipefail

source_file="/Users/vkartsu/Downloads/Final/NABH policies/AAC policy.doc"
output_file="$(cd "$(dirname "$0")/.." && pwd)/output/AAC_Policy_Clean.pdf"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

textutil -convert docx "$source_file" -output "$temp_dir/AAC_policy.docx"
osascript -e 'tell application "Microsoft Word"' \
  -e "set sourceFile to POSIX file \"$temp_dir/AAC_policy.docx\"" \
  -e 'open sourceFile' \
  -e 'set activeDoc to active document' \
  -e "save as activeDoc file name \"$output_file\" file format format PDF" \
  -e 'close activeDoc saving no' \
  -e 'end tell'

echo "Watermark-free AAC policy PDF generated: $output_file"
