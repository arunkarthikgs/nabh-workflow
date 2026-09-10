#!/usr/bin/env bash
set -euo pipefail

COMMIT_MESSAGE="nabh-docs: update profile and approval workflows"

node --check server.js
npm run ui:build
git diff --check

git add -A

if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git commit -m "$COMMIT_MESSAGE"
fi

git push origin main
