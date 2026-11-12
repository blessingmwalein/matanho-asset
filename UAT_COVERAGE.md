# UAT coverage (Matanho Nexus MVP)

Source: *Matanho Nexus End-to-End UAT Manual* (rev 1.0, 207 cases / 18 journeys) and the *UAT Execution Workbook*. Official test IDs and titles are preserved.

> **The complete UAT plan has NOT been passed and is NOT claimed to be.** Every official result remains **Not run**. This build was produced with a decision to write and run **no tests**, so nothing below has been verified by execution. "Implementation status" means whether a feature intended to satisfy the case exists in the code. It is not a pass.

**Legend:** ✅ Implemented · 🟡 Partial · ⏳ Deferred (out of MVP scope, see `FUTURE_SCOPE.md`)

## Journeys (cross-module)

| ID | Journey | Status | What the MVP covers / what it doesn't |
|---|---|---|---|
| J01 (E2E-001) | Applicant to funded client and first published report | 🟡 | Public application with save/resume, owners, evidence upload with stored originals and hashes, staff review and preview, human approval creating exactly one client (idempotent), statement generation → independent approval → publish → Investor A sees it, Investor B cannot. **Deferred:** KYC provider screening, subscription import / bank reconciliation, sandbox email outbox. |
| J05 (E2E-005) | Custodian intraday execution to official day-end reconciliation | 🟡 | Custodian A/B scoped accounts, execution submission, versioned correction, day-end pack with original file, Operations sees records without re-keying, matching + exceptions + resolution with user/time, cross-custodian denial. **Partial:** day-end file is retained as evidence, not parsed row-by-row; no maker/checker close of the run. |
| J11 (E2E-011) | Portfolio-company pack to reviewed valuation and LP publication | 🟡 | Company pack with drafts persisting server-side, submit once (idempotent), reviewer question → company answer → accept, company isolation. **Deferred:** valuation/NAV update and LP report from approved company content. |

## Cases named in the brief

| ID | Title (from workbook) | Status | Notes |
|---|---|---|---|
| LP-001 | Investor overview agrees to released internal books | ✅ | Investor portal reads the same holdings/valuation tables as the internal register |
| LP-002 | Portal documents and notifications reference exact reports | ✅ | Publish creates a notification linking the exact document |
| LP-003 | Capital-call acknowledgement is not proof of payment | ✅ | Acknowledgement is stored separately; commitment `calledAmount` is never changed by it |
| LP-004 | Secure message and service request complete both directions | 🟡 | Contact IR / service request recorded and shown to staff; no reply thread |
| LP-005 | Investor admin users and role restrictions | 🟡 | Portal users listed; no invitation or in-portal role management |
| LP-006 | Responsive charts and capital details remain usable | 🟡 | Responsive layouts built; not exercised across devices |
| CST-001 | External trade entry creates a shared source record | ✅ | Execution persisted and visible in internal operations |
| CST-002 | Day-end pack reconciles to intraday submissions | 🟡 | Control totals compared to internal book; no row-level file population check |
| CST-003 | Correct external records without deleting originals | ✅ | Corrections create version+1; originals retained; no edit/delete endpoints |
| CST-004 | Duplicate, overfill and scope validation | 🟡 | Duplicate (409) and account-scope (403) enforced; overfill needs an order model (deferred) |
| CST-005 | Day-end original documents are retrievable | ✅ | Stored bytes + SHA-256, secure download |
| RPT-003 | Generate a client-specific weekly and monthly report | 🟡 | On-demand client statement; weekly/monthly scheduling and delivery deferred |
| RPT-004 | Checker approval precedes publication | ✅ | Publish requires an approved document; approver must differ from the generator |
| RPT-009 | Report download and print preserve the approved content | ✅ | Frozen document bytes are served; printable HTML |
| DOC-001 | Preview actual multi-page originals | 🟡 | Real PDFs/images previewed from stored bytes by the browser viewer |
| DOC-002 | Version replacement preserves history and access rules | ✅ | New versions retained with hashes; access rules unchanged |
| NFR-001 | Responsive coverage across every route and portal | 🟡 | Mobile/tablet layouts implemented; not verified route by route |
| NFR-004 | Interrupted request and double-click resilience | ✅ | `Idempotency-Key` replay on mutating submits; buttons disabled while pending |
| NFR-006 | Cross-browser and fresh-session regression | ⏳ | Not performed |

## Other related areas

| ID | Title | Status |
|---|---|---|
| IAM-001 | Authentication, logout and session expiry | ✅ |
| IAM-002 | Enforce route and action permissions on the server | ✅ (deny-by-default guard) |
| IAM-003 | Enforce tenant and investor isolation | ✅ (scoped in queries) |
| IAM-004 | Prevent self-approval using immutable identity | 🟡 (report approval only; no maker/checker on recon or onboarding) |
| IAM-005 | Permission changes are effective and audited | ✅ (role edits read from DB per request, audited) |
| IAM-006 | Custodian and portfolio-company least privilege | ✅ |
| IAM-007 | External sharing and download expiry | ⏳ (auth-gated downloads only; no expiring share links) |
| IAM-008 | Restrict environment, secrets and production actions | 🟡 (env-only secrets; no environment-restricted admin actions) |
| ONB-001…005 | Application stages, validation, save/resume, eight evidence categories, ownership | ✅ |
| ONB-006 / ONB-007 / ONB-011 | OCR, screening, scheduled KYC refresh | ⏳ |
| ONB-008 | Mandate and suitability control activation | 🟡 (default account created on approval; no suitability workflow) |
| ONB-009 / ONB-010 | Request missing evidence and resubmission; reject/reopen with audit | ✅ |
| CLI-001 / CLI-002 | Create the account once; search/sort/filter register | ✅ |
| REC-003 / 004 / 007 / 009 | Each source consumed once; reference alone cannot override economics; orphans surfaced; re-run idempotent | ✅ (basic matching) |
| REC-012 / 015 / 016 | Maker/checker close, daily sign-off, non-trade families | ⏳ |
| CMP-001 / 002 / 003 | Save and submit pack; questions/corrections/acceptance; isolation and incomplete submissions | ✅ |
| AUD-001 / 002 / 003 | Before/after events; immutable history; denials recorded | ✅ (DB trigger blocks UPDATE/DELETE/TRUNCATE) |

All other cases in the 207-case plan are out of scope for this MVP and are **not** covered (accounting, NAV, OMS, risk, margin, regulatory, scheduling, etc.).

## Before UAT can start

Run the workbook against a frozen deployed candidate, provision real separate identities (the demo users are a convenience, not the UAT identity set), and execute the suites. The first unit of real verification, when testing resumes, should be the five demonstration flows listed in `README.md`.
