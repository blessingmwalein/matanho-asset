import type { AssetClass, DocumentCategory, DocumentStatus, HoldingSource, HoldingStatus, PortfolioStatus, PortfolioType, Side, TransactionStatus, TransactionType } from '@nexus/shared';

export interface PortfolioRow {
  id: string;
  ref: string;
  name: string;
  investor: { id: string; ref: string; legalName: string };
  type: PortfolioType;
  baseCurrency: string;
  manager: string | null;
  benchmark: string | null;
  inceptionDate: string;
  status: PortfolioStatus;
  currentValue: string;
}

export interface PortfolioOption {
  id: string;
  ref: string;
  name: string;
  baseCurrency: string;
  status: PortfolioStatus;
  investorId: string;
  investorName: string;
}

export interface SecurityOption {
  id: string;
  ticker: string;
  name: string;
  isin: string | null;
  assetClass: AssetClass;
  currency: string;
  exchange: string | null;
  lastPrice: string;
  priceDate: string;
}

export interface HoldingRow {
  id: string;
  portfolioId: string;
  portfolio: { id: string; ref: string; name: string } | null;
  investorName?: string;
  security: { id: string; ticker: string; name: string; assetClass: AssetClass; exchange: string | null };
  quantity: string;
  averageCost: string;
  currentPrice: string;
  currency: string;
  marketValue: string;
  allocationPct: string;
  valuationDate: string;
  source: HoldingSource;
  priceSource: string | null;
  status: HoldingStatus;
  updatedAt: string;
}

export interface TxnRow {
  id: string;
  ref: string;
  tradeReference: string | null;
  portfolio: { id: string; ref: string; name: string; baseCurrency: string };
  security: { id: string; ticker: string; name: string; assetClass: AssetClass } | null;
  type: TransactionType;
  side: Side | null;
  quantity: string;
  price: string;
  amount: string;
  currency: string;
  tradeDate: string;
  settlementDate: string | null;
  broker: string | null;
  notes: string | null;
  status: TransactionStatus;
  createdAt: string;
}

export interface PortfolioDetail {
  id: string;
  ref: string;
  name: string;
  description: string | null;
  investor: { id: string; ref: string; legalName: string };
  account: { id: string; ref: string; name: string } | null;
  manager: { id: string; name: string } | null;
  type: PortfolioType;
  baseCurrency: string;
  benchmark: string | null;
  inceptionDate: string;
  status: PortfolioStatus;
  createdAt: string;
  currentValue: string;
  holdingsCount: number;
  valuationDate: string | null;
  draftHoldings: number;
  performance: Array<{ date: string; value: number; benchmark: number | null }>;
  allocation: Array<{ key: string; label: string; value: number; pct: number }>;
  holdings: HoldingRow[];
  recentTransactions: Array<{
    id: string;
    ref: string;
    tradeReference: string | null;
    type: TransactionType;
    side: Side | null;
    security: { id: string; ticker: string; name: string } | null;
    quantity: string;
    price: string;
    amount: string;
    currency: string;
    tradeDate: string;
    status: TransactionStatus;
    notes: string | null;
  }>;
  documents: Array<{
    id: string;
    ref: string;
    title: string;
    category: DocumentCategory;
    status: DocumentStatus;
    audience: string;
    reportDate: string | null;
    createdAt: string;
    file: { fileName: string; mimeType: string; sizeBytes: number } | null;
  }>;
}

/** Query keys touched by any holding / transaction mutation. */
export const PORTFOLIO_QUERY_KEYS = [['portfolio'], ['portfolios'], ['holdings'], ['transactions'], ['dashboard'], ['investor']] as const;
