import type { ApplicationStatus, CompanySubmissionStatus, InvestorType, ReconStatus, Side, TransactionStatus, TransactionType } from '@nexus/shared';

export type TaskKind = 'APPLICATION' | 'KYC_REVIEW' | 'RECON_EXCEPTION' | 'CUSTODIAN_SUBMISSION' | 'COMPANY_PACK' | 'CAPITAL_CALL';

export interface DashboardTask {
  id: string;
  kind: TaskKind;
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  href: string;
  at: string | null;
  dueInDays: number | null;
}

export interface DashboardOverview {
  asOf: string;
  currency: string;
  metrics: {
    aum: string;
    totalPortfolioValue: string;
    fundNav: string;
    activeInvestors: number;
    activePortfolios: number;
    pendingApplications: number;
    pendingKycReviews: number;
    pendingCustodianSubmissions: number;
    openReconExceptions: number;
    upcomingCapitalCalls: { count: number; total: string };
    companyReporting: { byStatus: Record<CompanySubmissionStatus, number>; total: number; awaitingReview: number };
  };
  performance: Array<{ date: string; value: number; benchmark: number | null }>;
  allocation: Array<{ key: string; label: string; value: number; pct: number }>;
  recentActivity: Array<{
    id: string;
    ref: string;
    tradeReference: string | null;
    type: TransactionType;
    side: Side | null;
    security: { ticker: string; name: string } | null;
    portfolio: { id: string; ref: string; name: string };
    quantity: string;
    price: string;
    amount: string;
    currency: string;
    tradeDate: string;
    status: TransactionStatus;
  }>;
  queue: {
    counts: Array<{ kind: TaskKind; label: string; count: number; href: string }>;
    tasks: DashboardTask[];
    total: number;
  };
  recentApplications: Array<{ id: string; reference: string; legalName: string | null; investorType: InvestorType | null; country: string | null; status: ApplicationStatus; submittedAt: string | null }>;
  recentCustodianSubmissions: Array<{ id: string; ref: string; kind: 'EXECUTION' | 'DAY_END'; account: string; custodian: string; summary: string; reconStatus: ReconStatus; createdAt: string }>;
  recentCompanySubmissions: Array<{ id: string; ref: string; company: { id: string; name: string }; period: string; status: CompanySubmissionStatus; completionPct: number; submittedAt: string | null }>;
}
