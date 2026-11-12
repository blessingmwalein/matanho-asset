'use client';

import * as React from 'react';
import Link from 'next/link';
import { formatDate, formatMoney, formatQuantity, TRANSACTION_TYPE_LABELS } from '@nexus/shared';
import { cn } from '@/lib/utils';
import { EmptyState, Panel, PanelHeader } from '@/components/nx/layout';
import { ApplicationStatus, CompanySubmissionStatus, ReconStatusLabel, TransactionStatus } from '@/components/nx/status';
import type { DashboardOverview } from './types';

/** Compact table used for the "recent …" blocks. Rows are links; numbers right-aligned and tabular. */
function MiniTable<T extends { id: string }>({
  rows,
  columns,
  href,
  empty,
}: {
  rows: T[];
  columns: Array<{ header: string; align?: 'right'; className?: string; cell: (r: T) => React.ReactNode }>;
  href: (r: T) => string;
  empty: string;
}) {
  if (!rows.length) return <EmptyState title={empty} className="py-8" />;
  return (
    <div className="nx-scroll overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-border-soft bg-surface-2">
            {columns.map((c) => (
              <th key={c.header} className={cn('h-8 whitespace-nowrap px-3 text-left text-[10px] font-bold uppercase tracking-[0.07em] text-ink-3', c.align === 'right' && 'text-right')}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border-soft last:border-b-0 hover:bg-surface-2">
              {columns.map((c, i) => (
                <td key={c.header} className={cn('px-3 py-2 align-middle', c.align === 'right' && 'num text-right', c.className)}>
                  {i === 0 ? (
                    <Link href={href(r)} className="block hover:text-primary">
                      {c.cell(r)}
                    </Link>
                  ) : (
                    c.cell(r)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RecentApplications({ rows }: { rows: DashboardOverview['recentApplications'] }) {
  return (
    <Panel>
      <PanelHeader title="Recent applications" actions={<Link href="/internal/onboarding" className="text-[12px] font-semibold text-primary hover:underline">View all</Link>} />
      <MiniTable
        rows={rows}
        href={(r) => `/internal/onboarding/${r.id}`}
        empty="No applications yet"
        columns={[
          { header: 'Applicant', cell: (r) => (<><span className="block max-w-[170px] truncate font-semibold">{r.legalName ?? r.reference}</span><span className="num text-[10.5px] text-muted-foreground">{r.reference}</span></>) },
          { header: 'Status', cell: (r) => <ApplicationStatus status={r.status} /> },
          { header: 'Submitted', align: 'right', cell: (r) => formatDate(r.submittedAt) },
        ]}
      />
    </Panel>
  );
}

export function RecentCustodianSubmissions({ rows }: { rows: DashboardOverview['recentCustodianSubmissions'] }) {
  return (
    <Panel>
      <PanelHeader title="Custodian submissions" actions={<Link href="/internal/operations/custodian" className="text-[12px] font-semibold text-primary hover:underline">View all</Link>} />
      <MiniTable
        rows={rows}
        href={() => '/internal/operations/custodian'}
        empty="No custodian submissions yet"
        columns={[
          { header: 'Submission', cell: (r) => (<><span className="block max-w-[190px] truncate font-semibold">{r.summary}</span><span className="num text-[10.5px] text-muted-foreground">{r.account} · {r.custodian}</span></>) },
          { header: 'Recon', cell: (r) => <ReconStatusLabel status={r.reconStatus} /> },
          { header: 'Received', align: 'right', cell: (r) => formatDate(r.createdAt) },
        ]}
      />
    </Panel>
  );
}

export function RecentCompanySubmissions({ rows }: { rows: DashboardOverview['recentCompanySubmissions'] }) {
  return (
    <Panel>
      <PanelHeader title="Company submissions" actions={<Link href="/internal/companies/submissions" className="text-[12px] font-semibold text-primary hover:underline">View all</Link>} />
      <MiniTable
        rows={rows}
        href={() => '/internal/companies/submissions'}
        empty="No company submissions yet"
        columns={[
          { header: 'Company', cell: (r) => (<><span className="block max-w-[170px] truncate font-semibold">{r.company.name}</span><span className="num text-[10.5px] text-muted-foreground">{r.period} · {r.completionPct}% complete</span></>) },
          { header: 'Status', cell: (r) => <CompanySubmissionStatus status={r.status} /> },
          { header: 'Submitted', align: 'right', cell: (r) => formatDate(r.submittedAt) },
        ]}
      />
    </Panel>
  );
}

export function RecentActivity({ rows }: { rows: DashboardOverview['recentActivity'] }) {
  return (
    <Panel>
      <PanelHeader title="Recent investment activity" actions={<Link href="/internal/activity" className="text-[12px] font-semibold text-primary hover:underline">View all</Link>} />
      {rows.length === 0 ? (
        <EmptyState title="No transactions yet" description="Recorded trades and cash events appear here." className="py-8" />
      ) : (
        <ul className="divide-y divide-border-soft border-t border-border-soft">
          {rows.map((t) => (
            <li key={t.id}>
              <Link href={`/internal/activity`} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2">
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold">
                    {t.type === 'TRADE' ? `${t.side === 'BUY' ? 'Buy' : 'Sell'} ${formatQuantity(t.quantity)} ${t.security?.ticker ?? ''}` : TRANSACTION_TYPE_LABELS[t.type]}
                  </span>
                  <span className="num block truncate text-[11px] text-muted-foreground">
                    {t.portfolio.ref} · {formatDate(t.tradeDate)} · {t.tradeReference ?? t.ref}
                  </span>
                </span>
                <span className="grid justify-items-end gap-0.5">
                  <span className="num text-[12.5px] font-semibold">{formatMoney(t.amount, t.currency, { decimals: 0 })}</span>
                  <TransactionStatus status={t.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
