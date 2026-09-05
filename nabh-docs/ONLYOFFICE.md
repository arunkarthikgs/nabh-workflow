# OnlyOffice Integration

The server-hosted NABH Docs application opens matched Word and spreadsheet files in OnlyOffice. The standalone `prototype.html` remains a local simulation and does not require this service.

## Run OnlyOffice

```bash
docker run -d --name nabh-onlyoffice \
  -p 8080:80 \
  -e JWT_ENABLED=true \
  -e JWT_SECRET="replace-with-a-long-random-secret" \
  onlyoffice/documentserver
```

## Configure NABH Docs

Set these variables before starting `npm run server`:

```bash
export ONLYOFFICE_DOCUMENT_SERVER_URL="https://onlyoffice.example.com"
export ONLYOFFICE_JWT_SECRET="replace-with-the-same-long-random-secret"
export PUBLIC_BASE_URL="https://nabh-docs.example.com"
npm run server
```

`PUBLIC_BASE_URL` must be reachable from the OnlyOffice container. It cannot be `127.0.0.1` when OnlyOffice runs in Docker or another host.

## Check-in behavior

A saved document is downloaded from the OnlyOffice callback and stored as an immutable version under `output/controlled-documents/`. The server records the prior and new SHA-256 hashes, editor, timestamp, check-in note, document version, and department in `output/documentAudit.json`. The document-level history is stored in `output/documentMatches.json`.
