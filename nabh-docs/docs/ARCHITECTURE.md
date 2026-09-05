# NABH Docs Architecture

## Responsibilities

| Location | Responsibility |
| --- | --- |
| `agents/` | Workflow-specific analysis and matching rules |
| `services/shared/` | Storage, parsing, search, hospital administration, and OnlyOffice integration |
| `workflows/` | Repeatable batch workflows and artifact exports |
| `web/src/` | Browser UI for documents, access control, and administration |
| `server.js` | API composition and static-client hosting |
| `output/` | Local seed data and runtime files; not application source |

## Data lifecycle

1. A workflow creates or refreshes `output/documentMatches.json`.
2. The Express API serves document and hospital data to the React client.
3. Role access is persisted in `output/hospitals.json`.
4. When configured, OnlyOffice check-ins create immutable revisions in `output/controlled-documents/` and audit records in `output/documentAudit.json`.
5. `npm run prototype` embeds the client, demo data, and logos into an offline `prototype.html` artifact.

## Maintenance rules

- Keep generated output and runtime data out of UI components.
- Add backend behavior to a service before exposing it from `server.js`.
- Treat `prototype.html`, `web/dist`, and `web/src/generatedStaticData.js` as generated artifacts.
- Keep reusable business rules in `services/shared/`; keep orchestration in `workflows/`.