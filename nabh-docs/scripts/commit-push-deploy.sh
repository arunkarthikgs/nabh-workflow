#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$REPO_ROOT/nabh-docs"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-nabh-docs: enforce onboarding and hospital filters}"
DIRECT_DEPLOY="${DIRECT_DEPLOY:-0}"

cd "$REPO_ROOT"

FILES=(
  nabh-docs/scripts/commit-push-deploy.sh
  nabh-docs/server.js
  nabh-docs/web/src/App.jsx
  nabh-docs/web/src/PlatformWorkspace.jsx
  nabh-docs/web/src/SuperAdminHome.jsx
  nabh-docs/web/src/SuperAdminWorkspace.jsx
)

echo "Validating nabh-docs..."
cd "$APP_DIR"
node --check server.js
npm run ui:build
git diff --check

cd "$REPO_ROOT"
echo "Staging only the requested nabh-docs files..."
git add -- "${FILES[@]}"

if git diff --cached --quiet; then
  echo "No staged changes to commit."
else
  git commit -m "$COMMIT_MESSAGE"
fi

echo "Pushing main..."
git push origin main

if [[ "$DIRECT_DEPLOY" == "1" ]]; then
  echo "Running direct Cloudflare deployment..."
  cd "$APP_DIR"
  npx wrangler deploy --containers-rollout=immediate --keep-vars
else
  echo "Push complete. GitHub Actions will deploy nabh-docs from main."
  echo "Use: gh run list --workflow deploy-nabh-docs.yml --limit 3"
fi
