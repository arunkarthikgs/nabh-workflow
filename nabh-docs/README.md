# NABH Docs

NABH Docs manages a hospital master document list, role-based access, document audit history, and an optional OnlyOffice editing integration.

## Project layout

```text
agents/                 Workflow decision logic
services/shared/        Reusable business and integration services
workflows/              Command-line document processing and export jobs
web/src/                React application source
logos/                  Hospital brand assets
output/                 Seed document data and local runtime output
server.js               Express API and production web host
prototype.html          Generated standalone demonstration (not committed)
```

`output/hospitals.json` and `output/documentMatches.json` are demo seed data. Controlled document revisions and audit logs are runtime-only and ignored by Git.

## Local development

```bash
npm install
npm --prefix web install
npm run ui:build
npm run server
```

Open `http://127.0.0.1:4000`.

## Commands

```bash
npm run master-list:local  # Read a local master-list export
npm run match-documents    # Match files to registered documents
npm run ui:build           # Build the React client
npm run server             # Serve the API and built client
npm run prototype          # Build standalone prototype.html
```

## Configuration

Copy `.env.example` to `.env` and configure OnlyOffice only when real Office editing is required. See [ONLYOFFICE.md](ONLYOFFICE.md) for deployment details.

## GitHub setup

```bash
git init
git add .
git commit -m "Initial NABH Docs prototype"
```

Do not commit `.env`, `node_modules`, `web/dist`, controlled-document revisions, or generated `prototype.html`.