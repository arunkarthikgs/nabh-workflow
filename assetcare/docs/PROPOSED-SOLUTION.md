# Macula AssetCare
## Proposed Solution for Managed Hospital Asset Lifecycle Services

### 1. Executive proposal

Macula AssetCare should be offered as an **outsourced Asset Management Department**, combining a cloud asset register with a trained Macula service team. The hospital receives a continuously maintained, physically verified, and audit-ready view of its medical and non-medical assets without having to build a dedicated asset-management function.

The solution is designed around five outcomes:

- One trusted master asset register.
- Clear ownership of every asset by location, department, and custodian.
- Early action on maintenance, warranty, calibration, and replacement risks.
- Regular physical-to-system reconciliation.
- Management visibility into asset value, utilisation, leakage, and capital planning.

### 2. Proposed operating model

Macula operates the service through three coordinated layers:

| Layer | Responsibility |
|---|---|
| Hospital sponsor | Approves policy, resolves escalated ownership or financial decisions, reviews management reports. |
| Hospital asset coordinators | Facilitate access, confirm custodians and locations, review exceptions, approve transfers and disposals. |
| Macula AssetCare team | Performs onboarding, data quality checks, tagging, periodic verification, maintenance follow-up, audit, and reporting. |

Each hospital receives a named Macula service lead and a documented escalation path. The service lead owns the accuracy and timeliness of the asset register, while the hospital retains ownership of operational, financial, clinical, and disposal decisions.

### 3. Solution components

#### 3.1 Digital asset register

The register stores a unique record for every asset, including:

- Asset ID, asset name, category, medical/non-medical classification, make, model, and serial number.
- Supplier, invoice or supporting-document references, purchase date, and purchase value.
- Building, floor, department, room or location, and responsible custodian.
- Operational status, condition, warranty, AMC/CMC, insurance, and service history.
- Depreciation method, useful life, accumulated depreciation, book value, and replacement priority.
- Preventive maintenance, calibration, inspection, transfer, and verification history.

Records should be usable on mobile devices so the Macula team can verify and update assets during physical rounds.

#### 3.2 Asset identity and tagging

During onboarding, Macula assigns a unique Asset ID and applies a durable barcode or QR label where appropriate. Scanning the label opens the asset record and supports location verification, movement logging, maintenance updates, and audit evidence capture.

#### 3.3 Lifecycle workflow

The platform tracks the lifecycle:

`Procurement -> Installation -> Allocation -> Utilisation -> Maintenance -> Transfer -> Depreciation -> Replacement/Disposal`

Every movement or material status change records the previous value, new value, responsible user, date, and supporting note or document.

#### 3.4 Alert and action engine

The service monitors and escalates:

- Warranty expiry.
- AMC/CMC renewal dates.
- Preventive maintenance due dates.
- Calibration due dates.
- Statutory inspection dates.
- Insurance renewal dates.
- Unverified or missing assets.
- Long-idle or non-functional assets.
- Assets approaching the end of useful life.
- Newly purchased assets not yet registered.

Alerts should be configurable at 30, 60, and 90 days, with email or dashboard assignment to the responsible coordinator.

#### 3.5 Management dashboard

The management view should show:

- Total assets and total acquisition value.
- Current book value and depreciation position.
- Medical versus non-medical asset mix.
- Department-wise asset count and value.
- Warranty and AMC/CMC coverage.
- Maintenance and calibration overdue counts.
- Missing, unverified, damaged, idle, and non-functional assets.
- Assets due for replacement.
- Open audit exceptions and ageing.

### 4. Service workflow

#### Phase 1: Mobilisation and discovery

Macula conducts a kick-off, confirms the hospital hierarchy, identifies stakeholders, agrees the asset categories and tagging policy, and prepares the onboarding plan. Existing registers, finance exports, maintenance records, and available invoices are collected and assessed for quality.

#### Phase 2: Initial asset onboarding

The team creates the hospital, building, floor, department, and location hierarchy; physically identifies assets; applies labels; captures core data and documents; assigns custodians; and records operational status. Duplicate, unidentifiable, or conflicting records are placed in an exception queue rather than silently accepted.

**Deliverable:** digitally verified Master Asset Register and onboarding exception report.

#### Phase 3: Reconciliation and acceptance

Macula reconciles the physical count against the initial register and available financial records. The hospital reviews unresolved ownership, value, and disposal questions. A baseline is frozen for reporting, with all later changes recorded as controlled transactions.

**Deliverable:** baseline reconciliation report and signed acceptance record.

#### Phase 4: Managed monthly operations

The Macula team maintains the register, follows up due actions, records movements and new acquisitions, and supports the hospital's monthly self-audit. Exceptions are assigned to owners with due dates and closure evidence.

**Deliverable:** monthly AssetCare exception and action report.

#### Phase 5: Quarterly major audit

Macula performs a deeper physical verification and reconciles asset, location, department, custodian, maintenance, and financial status. Significant variances are escalated to management with recommended corrective actions.

**Deliverable:** quarterly Asset Management Report and audit closure tracker.

### 5. Controls and governance

- Role-based access for hospital management, coordinators, Macula operators, finance, biomedical engineering, and auditors.
- Immutable activity history for asset creation, edits, movement, verification, and disposal decisions.
- Required-field and duplicate-asset checks at data entry.
- Approval workflow for transfers, custodian changes, write-offs, and disposal.
- Document retention for invoices, warranty certificates, AMC/CMC agreements, calibration certificates, and service reports.
- Regular backup, controlled exports, and hospital-specific data segregation.
- Monthly review meeting and quarterly steering review.

### 6. Recommended implementation plan

| Stage | Indicative duration | Main outputs |
|---|---:|---|
| Mobilise and configure | 1-2 weeks | Stakeholder map, hierarchy, policies, templates, rollout plan |
| Pilot one department | 2-3 weeks | Tested tagging, register, workflows, dashboard, training feedback |
| Hospital-wide onboarding | 4-8 weeks | Verified register, labels, documents, custodian mapping, reconciliation |
| Stabilise managed service | 4 weeks | First monthly self-audit, alert tuning, exception closure |
| Operate and improve | Ongoing | Monthly reports, quarterly audits, valuation and replacement insights |

The final timeline should be sized using asset volume, number of buildings, operating hours, document availability, and the number of departments requiring physical access.

### 7. Service-level measures

Recommended initial targets, to be agreed during mobilisation:

- 98% or higher completeness for mandatory master-register fields after acceptance.
- 100% of newly reported assets acknowledged within one business day.
- Warranty, AMC/CMC, maintenance, and calibration alerts issued at least 30 days before due date where dates are available.
- Monthly exception report issued by the fifth business day of the following month.
- Quarterly major audit completed within the agreed audit window.
- 100% of approved asset movements recorded with date, origin, destination, and responsible custodian.
- All critical missing or non-functional assets escalated within one business day of confirmation.

Targets should be baselined during the pilot instead of being treated as contractual commitments before data quality is known.

### 8. Commercial structure

The proposal should separate implementation from recurring service:

**One-time onboarding fee**

Covers discovery, physical verification, tagging, data collection, document upload, register creation, custodian mapping, and initial reconciliation. Pricing can be based on asset count, hospital size, number of locations, or a combination of these factors.

**Annual managed service**

Covers software access, register maintenance, alert management, periodic on-site support, monthly self-audit support, quarterly major audit, and management reporting.

**Optional services**

- Full physical asset audit.
- Biomedical equipment audit.
- Asset valuation exercise.
- Large-scale re-tagging.
- Disposal and condemnation support.
- Replacement and CAPEX planning.
- AMC/CMC vendor-performance review.

Recommended pricing bands are the RFP's four hospital-size tiers: up to 50 beds, 51-100 beds, 101-200 beds, and 200+ beds. The final quote should also state included site visits, included asset volume, travel assumptions, taxes, and out-of-scope rates.

### 9. Immediate next steps

1. Confirm the pilot hospital, number of beds, buildings, departments, and estimated asset count.
2. Request sample exports from finance, biomedical engineering, stores/procurement, and maintenance.
3. Select one pilot department with a representative mix of medical and non-medical assets.
4. Agree tagging, depreciation, custodian, movement, and disposal policies.
5. Produce a pilot register and dashboard within the first implementation cycle.
6. Use pilot findings to finalise onboarding effort, service levels, and annual pricing.
