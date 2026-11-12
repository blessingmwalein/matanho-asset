import { formatDate, formatNumber, formatPrice, formatQuantity, type ReconStatus } from '@nexus/shared';

export type SubmissionKind = 'EXECUTION' | 'DAY_END';

export interface AccountOption {
  id: string;
  accountNumber: string;
  name: string;
  currency: string;
  status: string;
  portfolio: { id: string; ref: string; name: string } | null;
}

export interface SubmissionRow {
  id: string;
  kind: SubmissionKind;
  ref: string;
  tradeReference: string | null;
  account: { id: string; accountNumber: string; name: string };
  portfolio: { id: string; ref: string; name: string } | null;
  custodian: { id: string; name: string };
  /** execution: ISO instant; day-end: statement date */
  date: string;
  ticker: string | null;
  side: 'BUY' | 'SELL' | null;
  quantity: string | null;
  price: string | null;
  currency: string;
  settlementDate: string | null;
  broker: string | null;
  note: string | null;
  closingCash: string | null;
  holdingsMarketValue: string | null;
  tradeCount: number | null;
  version: number;
  isCurrent: boolean;
  status: 'SUBMITTED' | 'SUPERSEDED';
  fileName: string | null;
  documentId: string | null;
  reconStatus: ReconStatus;
  submittedByName: string | null;
  createdAt: string;
}

export interface VersionRow {
  id: string;
  ref: string;
  version: number;
  isCurrent: boolean;
  reconStatus: ReconStatus;
  submittedByName: string | null;
  createdAt: string;
  correctionReason?: string | null;
  quantity?: string;
  price?: string;
  currency?: string;
  settlementDate?: string;
  closingCash?: string;
  holdingsMarketValue?: string;
  tradeCount?: number;
  controlNote?: string | null;
  fileName?: string | null;
}

export interface SubmissionDetail extends SubmissionRow {
  rawPayload: Record<string, unknown>;
  correctionReason?: string | null;
  supersedesId?: string | null;
  fileSha256?: string | null;
  versions: VersionRow[];
  document: { id: string; ref?: string; title: string; fileName: string; mimeType: string; sizeBytes: number; sha256: string; version: number } | null;
  reconItem: { id: string; status: string; batchRef: string; businessDate: string; exceptionCount: number; openExceptions: number } | null;
}

export interface CustodianSummary {
  executions: number;
  dayEnds: number;
  awaitingReconciliation: number;
  recent: SubmissionRow[];
}

/** One-line description of a submission for lists. */
export function summaryOf(r: SubmissionRow): string {
  if (r.kind === 'EXECUTION') return `${r.side} ${formatQuantity(r.quantity)} ${r.ticker} @ ${formatPrice(r.price)} ${r.currency}`;
  return `Cash ${r.currency} ${formatNumber(r.closingCash, 2)} · holdings ${formatNumber(r.holdingsMarketValue, 0)} · ${r.tradeCount} trade${r.tradeCount === 1 ? '' : 's'}`;
}

/** Reference shown in tables: trade reference for executions, statement date for day-end packages. */
export function referenceOf(r: SubmissionRow): string {
  return r.kind === 'EXECUTION' ? (r.tradeReference ?? r.ref) : `Day-end ${formatDate(r.date)}`;
}

/** `datetime-local` value (browser local time) for an ISO instant. */
export function toLocalInput(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
export const addDaysIso = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
