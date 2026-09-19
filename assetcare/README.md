# AssetCare Workflow

Starter project for the Macula AssetCare RFP: a managed hospital asset lifecycle service combining asset software, onboarding, periodic audits, maintenance tracking, and management reporting.

## Setup

```sh
npm start
```

The default run reads `sample/assetRegister.json` and writes `output/assetcare-audit-report.json`.

To audit another register:

```sh
node main.js ./path/to/assetRegister.json ./output/report.json
```

## Included workflow

1. Intake a JSON asset register.
2. Normalize asset records and apply missing-value markers.
3. Validate onboarding completeness and identify operational exceptions.
4. Produce a monthly self-audit report with management metrics.

The original RFP is preserved at `docs/Macula AssetCare.pdf`; the extracted requirements are summarized in `docs/RFP-SUMMARY.md`.
