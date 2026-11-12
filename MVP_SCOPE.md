# Matanho Nexus: MVP scope

A deliberately narrowed, database-connected MVP for a stakeholder demonstration. Five portals share **one NestJS API and one Neon PostgreSQL database**. The priority is a few connected workflows, not breadth.

## Implemented

| Area | What is built |
|---|---|
| **Foundation** | NestJS modular monolith, Prisma schema + migration, JWT auth (httpOnly cookie via same-origin proxy), deny-by-default role/permission guard, organisation-level data scoping, append-only audit trail (DB trigger), idempotent submits, Swagger at `/docs`, `/health` |
| **Internal workspace** | Dashboard (command centre), Investor Register + detail, Onboarding & KYC review, Portfolios + detail, Holdings, Investment Activity, Custodian Submissions, Reconciliation, Company Register, Reporting Submissions, Document Register, Investor / Portfolio Reports, Users, Roles, Settings + audit trail |
| **Public onboarding** | Six-step application, repeatable beneficial owners and signatories with ownership validation, KYC declarations (flags only), tax & bank, evidence upload (stored originals), review & submit, save/resume via link, backend-generated reference |
| **Investor portal** | Overview (NAV, performance + benchmark, allocation, activity), Investments, Capital (calls, acknowledgement), Documents (search, filter, preview, secure download), Profile |
| **Custodian portal** | Execution submission, day-end submission with file evidence, submission history, versioned corrections |
| **Reconciliation** | Matching by trade reference + account + security + date, difference detection, exceptions, resolution notes with user/time, original values preserved |
| **Company portal** | Reporting pack (management accounts, KPIs, debt & cash, board pack, compliance), file evidence, save draft, submit (server-side completeness gate), questions and corrections |
| **Documents** | Shared service: real bytes + SHA-256 + versions, private storage (`local` / `s3` / `db` adapters), access-checked download, access audit |
| **Reports** | Investor statement (generate → independent approval → publish), investor register, onboarding status, portfolio summary, holdings, custodian submissions, reconciliation exceptions, company reporting status; CSV export and printable view |

## Key definitions

- **Portfolio value** = sum of holdings market value across portfolios. **AUM** = portfolio value + private-fund NAV (from commitments).
- **Market value** = quantity × current price (simplified; see below).
- **Approval decisions are human-controlled**: nothing auto-approves an application, a report or a reconciliation exception.

## Simulated or simplified (not production behaviour)

- **Valuation** is quantity × price. No accruals, fees, FX translation, time-weighted returns or NAV engine.
- **Private fund metrics** (IRR, TVPI, DPI, NAV) are seeded administrator-reported values.
- **Presentation FX** (USD/ZAR/ZWG) is indicative and display-only.
- **Reconciliation of day-end packs** compares control totals to current internal holdings, not a historical book. The uploaded file is retained as evidence, not parsed row by row.
- **Application resume** is link-based (token in the URL) because email delivery is out of scope.
- **KYC** is declarations + internal review flags. No sanctions/PEP/adverse-media provider and no OCR/AI.
- **Investor service requests** are one-way (recorded and shown to staff).
- **Render deployment** is prepared as configuration only (`render.yaml`, Dockerfiles); it has not been deployed or verified.
- **Testing:** by decision for this build, no automated or end-to-end tests were written or run. See `UAT_COVERAGE.md`.

## Deliberately deferred

See [FUTURE_SCOPE.md](FUTURE_SCOPE.md). Not built: OMS, broker APIs, settlement, bank feeds, general ledger/accounting, NAV engine, TWR/attribution, risk/limits, margin, regulatory filing, external screening, OCR/AI, e-signature, scheduled reports and email delivery, waterfall calculations, data warehouse.

## Deviations from the original brief

- "Investor Details" is a drill-down from the Investor Register rather than a separate navigation entry (avoids an empty route).
- The onboarding reference's OCR and "AI ATS" panel is replaced by a deterministic completeness checklist.
- The reference portals' gradient buttons and progress bars are rendered flat to follow the design direction.
- The existing reference HTML files are kept untouched in the repository root as the visual source of truth.
