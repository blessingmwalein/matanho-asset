import type { ExceptionStatus, ExceptionType, ReconItemKind, ReconStatus } from '@nexus/shared';

export interface ReconSummary {
  counts: Record<ReconStatus, number>;
  totalItems: number;
  openExceptions: number;
  unreconciledSubmissions: { executions: number; dayEnds: number; total: number };
  lastRun: { batchRef: string | null; businessDate: string | null; at: string; by: string | null; processed: number | null } | null;
}

export interface ReconRow {
  id: string;
  kind: ReconItemKind;
  status: ReconStatus;
  batch: { id: string; ref: string; businessDate: string };
  portfolio: { id: string; ref: string; name: string } | null;
  tradeReference: string | null;
  ticker: string | null;
  quantity: string | null;
  price: string | null;
  currency: string | null;
  date: string | null;
  custodianRef: string | null;
  custodian: string | null;
  accountNumber: string | null;
  transactionRef: string | null;
  exceptionCount: number;
  openExceptions: number;
  openExceptionTypes: ExceptionType[];
  superseded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DiffRow {
  field: string;
  label: string;
  custodian: string | null;
  internal: string | null;
  differs: boolean;
  note?: string;
}

export interface ReconException {
  id: string;
  type: ExceptionType;
  description: string;
  expected: string | null;
  actual: string | null;
  status: ExceptionStatus;
  resolutionNote: string | null;
  resolvedById: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ReconDetail {
  id: string;
  kind: ReconItemKind;
  status: ReconStatus;
  batch: { id: string; ref: string; businessDate: string };
  portfolio: { id: string; ref: string; name: string; baseCurrency: string } | null;
  tradeReference: string | null;
  ticker: string | null;
  currency: string | null;
  matchKey: string | null;
  superseded: boolean;
  source: Record<string, unknown> | null;
  internal: Record<string, unknown> | null;
  differences: DiffRow[];
  exceptions: ReconException[];
  openExceptions: number;
  submission: {
    kind: 'EXECUTION' | 'DAY_END';
    id: string;
    ref: string;
    version: number;
    isCurrent: boolean;
    reconStatus: ReconStatus;
    correctionReason?: string | null;
    custodian: { id: string; name: string };
    account: { id: string; accountNumber: string; name: string };
    submittedByName: string | null;
    createdAt: string;
    fileName?: string | null;
    fileSha256?: string | null;
    rawPayload: Record<string, unknown>;
    document: { id: string; title: string; fileName: string; mimeType: string; sizeBytes: number; sha256: string; version: number } | null;
  } | null;
  transaction: {
    id: string;
    ref: string;
    tradeReference: string | null;
    side: 'BUY' | 'SELL' | null;
    ticker: string | null;
    security: string | null;
    quantity: string;
    price: string;
    amount: string;
    currency: string;
    tradeDate: string;
    settlementDate: string | null;
    broker: string | null;
    status: string;
  } | null;
  timeline: Array<{ id: string; title: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; body?: string; at: string; actor: string | null }>;
  createdAt: string;
  updatedAt: string;
}

export const EXCEPTION_LABELS: Record<ExceptionType, string> = {
  NO_INTERNAL_MATCH: 'No internal match',
  NO_CUSTODIAN_RECORD: 'No custodian record',
  PROBABLE_MATCH: 'Probable match',
  QUANTITY_DIFFERENCE: 'Quantity difference',
  PRICE_DIFFERENCE: 'Price difference',
  CURRENCY_DIFFERENCE: 'Currency difference',
  SETTLEMENT_DATE_DIFFERENCE: 'Settlement date difference',
  CASH_DIFFERENCE: 'Cash difference',
  HOLDINGS_VALUE_DIFFERENCE: 'Holdings value difference',
  TRADE_COUNT_DIFFERENCE: 'Trade count difference',
};

export const ITEM_KIND_LABELS: Record<ReconItemKind, string> = {
  EXECUTION: 'Execution',
  DAY_END: 'Day-end',
  INTERNAL_ORPHAN: 'Internal only',
};
