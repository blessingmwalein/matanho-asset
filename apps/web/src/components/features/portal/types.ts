/** Response shapes of /investor-portal/*. Money arrives as decimal strings (display only; never do arithmetic on it). */
export type Money = string | number;

export interface CallDto {
  id: string;
  ref: string;
  kind: 'CALL' | 'DISTRIBUTION';
  fundId: string;
  fundName: string;
  commitmentId: string;
  amount: Money;
  issueDate: string;
  dueDate: string | null;
  status: 'ISSUED' | 'FUNDED' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  fundingAccountMasked: string | null;
  noticeDocumentId: string | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgedByMe: boolean;
  commitment: Money;
  calledToDate: Money;
  afterCall: Money;
  remaining: Money;
}

export interface SeriesPoint {
  date: string;
  value: number;
  benchmark: number | null;
}

export interface AllocationItem {
  key: string;
  label: string;
  value: number;
  pct: number;
}

export interface ActivityItem {
  id: string;
  kind: 'TRANSACTION' | 'CAPITAL' | 'DOCUMENT';
  title: string;
  detail: string;
  amount?: Money;
  date: string;
  documentId: string | null;
}

export interface Overview {
  account: { id: string; name: string; ref: string; type: string } | null;
  currency: string;
  asOf: string | null;
  privateAsOf: string | null;
  nav: Money;
  publicValue: Money;
  privateValue: Money;
  ytdReturnPct: number | null;
  benchmarkYtdPct: number | null;
  oneYearReturnPct: number | null;
  unfundedCommitments: Money;
  distributionsYtd: Money;
  distributionsToDate: Money;
  series: SeriesPoint[];
  allocation: AllocationItem[];
  activity: ActivityItem[];
  nextCall: CallDto | null;
}

export interface PortfolioItem {
  kind: 'portfolio';
  id: string;
  accountId: string | null;
  ref: string;
  name: string;
  type: string;
  status: string;
  value: Money;
  ytdReturnPct: number | null;
  benchmarkYtdPct: number | null;
  topAllocation: { label: string; pct: number } | null;
  benchmark: string | null;
  inceptionDate: string;
}

export interface FundItem {
  kind: 'fund';
  id: string;
  fundId: string;
  accountId: string | null;
  ref: string;
  name: string;
  type: string;
  fundType: string;
  status: string;
  value: Money;
  irr: Money | null;
  tvpi: Money | null;
  dpi: Money | null;
  commitment: Money;
  called: Money;
  unfunded: Money;
  distributed: Money;
  asOf: string;
}

export type InvestmentItem = PortfolioItem | FundItem;

export interface DocRef {
  id: string;
  title: string;
  type: string;
  date: string | null;
}

export interface PortfolioDetail {
  kind: 'portfolio';
  id: string;
  ref: string;
  name: string;
  type: string;
  status: string;
  currency: string;
  benchmark: string | null;
  inceptionDate: string;
  manager: string | null;
  description: string | null;
  value: Money;
  returns: { ytd: number | null; bench: number | null; oneYear: number | null; sinceInception: number | null };
  series: SeriesPoint[];
  holdings: Array<{ ticker: string; name: string; assetClass: string; assetClassLabel: string; quantity: Money; price: Money; marketValue: Money; weightPct: number; valuationDate: string }>;
  documents: DocRef[];
}

export interface FundDetail {
  kind: 'fund';
  id: string;
  fundId: string;
  ref: string;
  name: string;
  type: string;
  fundType: string;
  status: string;
  currency: string;
  vintage: number | null;
  description: string | null;
  asOf: string;
  value: Money;
  irr: Money | null;
  tvpi: Money | null;
  dpi: Money | null;
  commitment: Money;
  called: Money;
  unfunded: Money;
  distributed: Money;
  events: Array<{ id: string; ref: string; kind: 'CALL' | 'DISTRIBUTION'; amount: Money; issueDate: string; dueDate: string | null; status: string; noticeDocumentId: string | null }>;
  documents: DocRef[];
}

export interface CapitalView {
  account: { id: string; name: string } | null;
  currency: string;
  asOf: string | null;
  summary: { totalCommitment: Money; called: Money; unfunded: Money; distributions: Money; nav: Money };
  commitments: Array<{ id: string; fundId: string; fundName: string; fundType: string; commitment: Money; called: Money; unfunded: Money; distributed: Money; nav: Money; irr: Money | null; tvpi: Money | null; dpi: Money | null; asOf: string; status: string }>;
  openCalls: CallDto[];
  activity: Array<{ id: string; ref: string; kind: 'CALL' | 'DISTRIBUTION'; date: string; dueDate: string | null; fundId: string; fundName: string; amount: Money; status: string; noticeDocumentId: string | null; acknowledged: boolean }>;
}

export interface PortalDocument {
  id: string;
  ref: string;
  title: string;
  type: string;
  category: string;
  scope: string;
  date: string;
  publishedAt: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  versionNo: number;
}

export interface ProfileView {
  organisation: {
    ref: string;
    legalName: string;
    investorType: string;
    registrationNumber: string;
    country: string;
    registeredAddress: string;
    contactName: string;
    email: string;
    phone: string | null;
    taxIdentificationNumber: string | null;
    baseCurrency: string;
    classification: string | null;
    investmentObjective: string | null;
    status: string;
    since: string;
  };
  kyc: {
    status: 'PENDING' | 'IN_REVIEW' | 'VERIFIED' | 'EXPIRED' | 'REJECTED';
    reviewedAt: string | null;
    nextReviewAt: string | null;
    items: Array<{ key: string; label: string; detail: string; value: string; state: 'current' | 'attention' }>;
  };
  bank: { bankName: string | null; accountHolder: string | null; accountMasked: string | null; currency: string | null; swiftBic: string | null };
  relationshipManager: { name: string; email: string } | null;
  users: Array<{ id: string; name: string; email: string; role: string; status: string; lastLoginAt: string | null; isYou: boolean }>;
  accounts: Array<{ id: string; name: string; ref: string; type: string }>;
}
