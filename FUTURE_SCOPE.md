# Matanho Nexus: future scope

Not part of the MVP. Listed so expansion is deliberate rather than accidental.

**Investment operations**
- Order management system, trade routing and approvals (maker/checker on orders)
- Broker API integration and automated trade ingestion
- Automated settlement processing and cash ledger
- Full cash management engine and bank-feed integration
- Partial/aggregate matching, tolerance configuration, row-level day-end file reconciliation (UAT REC-005/008/010/015)

**Valuation and performance**
- Full NAV calculation engine, advanced valuation models, stale-price controls
- Time-weighted / money-weighted performance engine and attribution
- Complex private-equity waterfall calculations and advanced capital-call settlement (proof of payment, funding reconciliation)

**Accounting and compliance**
- Complete general ledger, double-entry close, journal posting and reversal
- Risk modelling, limit engine, margin and collateral management
- Regulatory filing and automated regulatory reporting
- Automated sanctions / PEP / adverse-media provider integration (UAT ONB-007)
- OCR and AI document screening (UAT ONB-006), scheduled KYC refresh (ONB-011)

**Platform**
- E-signature provider integration
- Weekly/monthly report scheduling, email delivery automation and retry (UAT RPT-003, J15)
- Secure message threads (two-way) and richer service requests (LP-004)
- Investor-organisation user administration and invitations (LP-005)
- Time-limited external share links (IAM-007), environment-restricted admin actions (IAM-008)
- Advanced fund administration, data warehouse, advanced workflow builder, full audit/compliance analytics
- Cross-browser regression matrix (NFR-006) and automated test suites
