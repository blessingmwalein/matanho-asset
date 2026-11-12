/**
 * Domain enums shared by API and web. These MUST mirror the Prisma enums in
 * apps/api/prisma/schema.prisma (same names, same values).
 * `label` maps are for display; `tone` maps drive status colour (see StatusIndicator).
 */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

function def<const T extends readonly string[]>(values: T) {
  return values;
}

// ── identity ────────────────────────────────────────────────────────────────
export const ORG_TYPES = def(['ASSET_MANAGER', 'INVESTOR', 'CUSTODIAN', 'PORTFOLIO_COMPANY'] as const);
export type OrgType = (typeof ORG_TYPES)[number];

export const ROLE_KEYS = def([
  'ADMIN',
  'ASSET_MANAGER',
  'OPERATIONS',
  'COMPLIANCE',
  'READ_ONLY',
  'INVESTOR_USER',
  'CUSTODIAN_USER',
  'COMPANY_USER',
] as const);
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  ADMIN: 'Administrator',
  ASSET_MANAGER: 'Asset Manager',
  OPERATIONS: 'Operations Officer',
  COMPLIANCE: 'Compliance Reviewer',
  READ_ONLY: 'Read-only Staff',
  INVESTOR_USER: 'Investor User',
  CUSTODIAN_USER: 'Custodian User',
  COMPANY_USER: 'Portfolio Company User',
};

export const USER_STATUSES = def(['ACTIVE', 'DISABLED', 'INVITED'] as const);
export type UserStatus = (typeof USER_STATUSES)[number];

// ── onboarding ──────────────────────────────────────────────────────────────
export const APPLICATION_STATUSES = def([
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'INFORMATION_REQUESTED',
  'RESUBMITTED',
  'APPROVED',
  'REJECTED',
] as const);
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  INFORMATION_REQUESTED: 'Information requested',
  RESUBMITTED: 'Resubmitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};
export const APPLICATION_STATUS_TONES: Record<ApplicationStatus, Tone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  UNDER_REVIEW: 'warning',
  INFORMATION_REQUESTED: 'warning',
  RESUBMITTED: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export const NOTE_KINDS = def(['NOTE', 'INFO_REQUEST', 'DECISION', 'APPLICANT_RESPONSE'] as const);
export type NoteKind = (typeof NOTE_KINDS)[number];

export const INVESTOR_TYPES = def([
  'INSTITUTIONAL',
  'PENSION_FUND',
  'CORPORATE_TREASURY',
  'FAMILY_OFFICE',
  'TRUST_FOUNDATION',
  'FUND_VEHICLE',
  'INDIVIDUAL_HNW',
] as const);
export type InvestorType = (typeof INVESTOR_TYPES)[number];
export const INVESTOR_TYPE_LABELS: Record<InvestorType, string> = {
  INSTITUTIONAL: 'Institutional investor',
  PENSION_FUND: 'Pension / provident fund',
  CORPORATE_TREASURY: 'Corporate treasury',
  FAMILY_OFFICE: 'Investment company / family office',
  TRUST_FOUNDATION: 'Trust / foundation',
  FUND_VEHICLE: 'Fund / collective investment vehicle',
  INDIVIDUAL_HNW: 'Individual / HNW',
};

export const INVESTOR_STATUSES = def(['ACTIVE', 'SUSPENDED', 'CLOSED'] as const);
export type InvestorStatus = (typeof INVESTOR_STATUSES)[number];

export const KYC_STATUSES = def(['PENDING', 'IN_REVIEW', 'VERIFIED', 'EXPIRED', 'REJECTED'] as const);
export type KycStatus = (typeof KYC_STATUSES)[number];
export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  PENDING: 'Pending',
  IN_REVIEW: 'In review',
  VERIFIED: 'Verified',
  EXPIRED: 'Expired',
  REJECTED: 'Rejected',
};
export const KYC_STATUS_TONES: Record<KycStatus, Tone> = {
  PENDING: 'neutral',
  IN_REVIEW: 'warning',
  VERIFIED: 'success',
  EXPIRED: 'danger',
  REJECTED: 'danger',
};

export const RISK_RATINGS = def(['LOW', 'MEDIUM', 'HIGH'] as const);
export type RiskRating = (typeof RISK_RATINGS)[number];

export const DECLARATION_ANSWERS = def(['NO', 'YES', 'UNKNOWN'] as const);
export type DeclarationAnswer = (typeof DECLARATION_ANSWERS)[number];

// ── documents ───────────────────────────────────────────────────────────────
export const DOCUMENT_CATEGORIES = def([
  'REGISTRATION',
  'IDENTITY',
  'PROOF_OF_ADDRESS',
  'OWNERSHIP_EVIDENCE',
  'BANK_VERIFICATION',
  'SOURCE_OF_FUNDS',
  'TAX',
  'AUTHORITY_TO_INVEST',
  'ADDITIONAL',
  'STATEMENT',
  'INVESTOR_REPORT',
  'NOTICE',
  'CAPITAL_CALL',
  'AUDITED_FINANCIALS',
  'DAY_END_FILE',
  'MANAGEMENT_ACCOUNTS',
  'BOARD_PACK',
  'COMPLIANCE_EVIDENCE',
  'REPORTING_SUPPORT',
  'OTHER',
] as const);
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  REGISTRATION: 'Registration documents',
  IDENTITY: 'Identity documents',
  PROOF_OF_ADDRESS: 'Proof of address',
  OWNERSHIP_EVIDENCE: 'Ownership evidence',
  BANK_VERIFICATION: 'Bank verification',
  SOURCE_OF_FUNDS: 'Source-of-funds evidence',
  TAX: 'Tax documents',
  AUTHORITY_TO_INVEST: 'Authority to invest',
  ADDITIONAL: 'Additional documents',
  STATEMENT: 'Statement',
  INVESTOR_REPORT: 'Investor report',
  NOTICE: 'Notice',
  CAPITAL_CALL: 'Capital call document',
  AUDITED_FINANCIALS: 'Audited financials',
  DAY_END_FILE: 'Day-end file',
  MANAGEMENT_ACCOUNTS: 'Management accounts',
  BOARD_PACK: 'Board pack',
  COMPLIANCE_EVIDENCE: 'Compliance evidence',
  REPORTING_SUPPORT: 'Reporting support',
  OTHER: 'Other',
};

export const DOCUMENT_STATUSES = def(['DRAFT', 'UPLOADED', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED'] as const);
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export const DOCUMENT_STATUS_TONES: Record<DocumentStatus, Tone> = {
  DRAFT: 'neutral',
  UPLOADED: 'info',
  UNDER_REVIEW: 'warning',
  APPROVED: 'success',
  PUBLISHED: 'success',
  REJECTED: 'danger',
};

export const DOCUMENT_AUDIENCES = def(['INTERNAL', 'INVESTOR', 'COMPANY', 'CUSTODIAN'] as const);
export type DocumentAudience = (typeof DOCUMENT_AUDIENCES)[number];

// ── investment management ───────────────────────────────────────────────────
export const ASSET_CLASSES = def([
  'EQUITY',
  'FIXED_INCOME',
  'CASH',
  'PRIVATE_EQUITY',
  'PRIVATE_CREDIT',
  'REAL_ESTATE',
  'OTHER',
] as const);
export type AssetClass = (typeof ASSET_CLASSES)[number];
export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  EQUITY: 'Equities',
  FIXED_INCOME: 'Fixed Income',
  CASH: 'Cash',
  PRIVATE_EQUITY: 'Private Equity',
  PRIVATE_CREDIT: 'Private Credit',
  REAL_ESTATE: 'Real Estate',
  OTHER: 'Other',
};

export const PORTFOLIO_TYPES = def(['MANAGED_ACCOUNT', 'SEGREGATED_MANDATE', 'ADVISORY', 'LIQUIDITY'] as const);
export type PortfolioType = (typeof PORTFOLIO_TYPES)[number];
export const PORTFOLIO_TYPE_LABELS: Record<PortfolioType, string> = {
  MANAGED_ACCOUNT: 'Managed account',
  SEGREGATED_MANDATE: 'Segregated mandate',
  ADVISORY: 'Advisory',
  LIQUIDITY: 'Liquidity mandate',
};

export const PORTFOLIO_STATUSES = def(['ACTIVE', 'ON_HOLD', 'CLOSED'] as const);
export type PortfolioStatus = (typeof PORTFOLIO_STATUSES)[number];

export const ACCOUNT_TYPES = def(['MANDATE', 'FUND_INTEREST'] as const);
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const HOLDING_STATUSES = def(['DRAFT', 'CONFIRMED'] as const);
export type HoldingStatus = (typeof HOLDING_STATUSES)[number];
export const HOLDING_SOURCES = def(['MANUAL', 'TRANSACTION', 'SEED', 'CUSTODIAN'] as const);
export type HoldingSource = (typeof HOLDING_SOURCES)[number];

export const TRANSACTION_TYPES = def(['TRADE', 'CASH_IN', 'CASH_OUT', 'DIVIDEND', 'FEE'] as const);
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  TRADE: 'Trade',
  CASH_IN: 'Cash in',
  CASH_OUT: 'Cash out',
  DIVIDEND: 'Dividend',
  FEE: 'Fee',
};
export const SIDES = def(['BUY', 'SELL'] as const);
export type Side = (typeof SIDES)[number];
export const TRANSACTION_STATUSES = def(['PENDING', 'COMPLETED', 'CANCELLED'] as const);
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
export const TRANSACTION_STATUS_TONES: Record<TransactionStatus, Tone> = {
  PENDING: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

// ── custodian & reconciliation ──────────────────────────────────────────────
export const RECON_STATUSES = def(['NOT_STARTED', 'MATCHED', 'UNMATCHED', 'DIFFERENCE', 'PENDING_REVIEW', 'RESOLVED'] as const);
export type ReconStatus = (typeof RECON_STATUSES)[number];
export const RECON_STATUS_LABELS: Record<ReconStatus, string> = {
  NOT_STARTED: 'Not reconciled',
  MATCHED: 'Matched',
  UNMATCHED: 'Unmatched',
  DIFFERENCE: 'Difference detected',
  PENDING_REVIEW: 'Pending review',
  RESOLVED: 'Resolved',
};
export const RECON_STATUS_TONES: Record<ReconStatus, Tone> = {
  NOT_STARTED: 'neutral',
  MATCHED: 'success',
  UNMATCHED: 'danger',
  DIFFERENCE: 'warning',
  PENDING_REVIEW: 'info',
  RESOLVED: 'success',
};

export const RECON_ITEM_KINDS = def(['EXECUTION', 'DAY_END', 'INTERNAL_ORPHAN'] as const);
export type ReconItemKind = (typeof RECON_ITEM_KINDS)[number];

export const EXCEPTION_TYPES = def([
  'NO_INTERNAL_MATCH',
  'NO_CUSTODIAN_RECORD',
  'PROBABLE_MATCH',
  'QUANTITY_DIFFERENCE',
  'PRICE_DIFFERENCE',
  'CURRENCY_DIFFERENCE',
  'SETTLEMENT_DATE_DIFFERENCE',
  'CASH_DIFFERENCE',
  'HOLDINGS_VALUE_DIFFERENCE',
  'TRADE_COUNT_DIFFERENCE',
] as const);
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];
export const EXCEPTION_STATUSES = def(['OPEN', 'RESOLVED'] as const);
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

export const BATCH_STATUSES = def(['OPEN', 'COMPLETED'] as const);
export type BatchStatus = (typeof BATCH_STATUSES)[number];

// ── portfolio companies ─────────────────────────────────────────────────────
export const PERIOD_STATUSES = def(['OPEN', 'CLOSED'] as const);
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export const REQUIREMENT_CATEGORIES = def([
  'MANAGEMENT_ACCOUNTS',
  'OPERATING_KPIS',
  'DEBT_CASH',
  'BOARD_PACK',
  'COMPLIANCE',
] as const);
export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];
export const REQUIREMENT_STATUSES = def(['PENDING', 'IN_PROGRESS', 'COMPLETE'] as const);
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const COMPANY_SUBMISSION_STATUSES = def([
  'DRAFT',
  'SUBMITTED',
  'QUESTIONS_OPEN',
  'CORRECTIONS_REQUESTED',
  'RESUBMITTED',
  'ACCEPTED',
] as const);
export type CompanySubmissionStatus = (typeof COMPANY_SUBMISSION_STATUSES)[number];
export const COMPANY_SUBMISSION_LABELS: Record<CompanySubmissionStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  QUESTIONS_OPEN: 'Questions open',
  CORRECTIONS_REQUESTED: 'Corrections requested',
  RESUBMITTED: 'Resubmitted',
  ACCEPTED: 'Accepted',
};
export const COMPANY_SUBMISSION_TONES: Record<CompanySubmissionStatus, Tone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  QUESTIONS_OPEN: 'warning',
  CORRECTIONS_REQUESTED: 'warning',
  RESUBMITTED: 'info',
  ACCEPTED: 'success',
};

export const QUESTION_STATUSES = def(['OPEN', 'ANSWERED', 'CLOSED'] as const);
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

// ── capital ─────────────────────────────────────────────────────────────────
export const FUND_TYPES = def(['PRIVATE_EQUITY', 'PRIVATE_CREDIT'] as const);
export type FundType = (typeof FUND_TYPES)[number];
export const CAPITAL_EVENT_KINDS = def(['CALL', 'DISTRIBUTION'] as const);
export type CapitalEventKind = (typeof CAPITAL_EVENT_KINDS)[number];
export const CAPITAL_EVENT_STATUSES = def(['ISSUED', 'FUNDED', 'PAID', 'OVERDUE', 'CANCELLED'] as const);
export type CapitalEventStatus = (typeof CAPITAL_EVENT_STATUSES)[number];

// ── currencies ──────────────────────────────────────────────────────────────
export const CURRENCIES = def(['USD', 'ZWG', 'ZAR', 'GBP', 'EUR'] as const);
export type Currency = (typeof CURRENCIES)[number];
