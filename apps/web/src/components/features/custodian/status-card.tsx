'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDate, formatDateTime } from '@nexus/shared';
import { api } from '@/lib/api';
import { Panel, PanelBody, PanelHeader, PanelSkeleton } from '@/components/nx/layout';
import { ReconStatusLabel } from '@/components/nx/status';
import { referenceOf, summaryOf, type AccountOption, type CustodianSummary, type SubmissionRow } from './types';

/** Right-hand "Submission status" card from custodian-portal.html: counts, recent items, and the caller's accounts. */
export function StatusCard({ accounts, onOpen }: { accounts: AccountOption[]; onOpen: (row: SubmissionRow) => void }) {
  const q = useQuery({ queryKey: ['custodian', 'summary'], queryFn: () => api<CustodianSummary>('/custodian/summary'), refetchInterval: 30_000 });
  const s = q.data;

  return (
    <Panel>
      <PanelHeader title="Submission status" description="Records entered here become available to the manager's Reconciliations workspace." />
      <PanelBody>
        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border">
          {[
            { label: 'Executions', value: s?.executions },
            { label: 'Day-end packs', value: s?.dayEnds },
            { label: 'Awaiting recon', value: s?.awaitingReconciliation },
          ].map((m, i) => (
            <div key={m.label} className={i > 0 ? 'border-l border-border px-3 py-2.5' : 'px-3 py-2.5'}>
              <div className="eyebrow">{m.label}</div>
              <div className="num mt-1 text-[20px] font-semibold tracking-tight">{m.value ?? '–'}</div>
            </div>
          ))}
        </div>

        <h3 className="mb-2 mt-5 text-[12px] font-semibold text-ink-2">Recent submissions</h3>
        {q.isLoading ? (
          <PanelSkeleton rows={3} />
        ) : s && s.recent.length ? (
          <ul className="grid gap-2">
            {s.recent.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <button type="button" onClick={() => onOpen(r)} className="block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-primary-soft-border hover:bg-surface-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[12px] font-semibold">
                      {r.kind === 'EXECUTION' ? 'Execution' : 'Day-end'} · {referenceOf(r)}
                    </span>
                    <ReconStatusLabel status={r.reconStatus} />
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground">{summaryOf(r)}</div>
                  <div className="num mt-0.5 text-[10.5px] text-ink-3">
                    {r.account.accountNumber} · {r.kind === 'EXECUTION' ? formatDateTime(r.createdAt) : `statement ${formatDate(r.date)}`}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-[12px] text-muted-foreground">No submissions yet. Enter the first execution or day-end package.</div>
        )}

        <h3 className="mb-2 mt-5 text-[12px] font-semibold text-ink-2">Your accounts</h3>
        <ul className="divide-y divide-border-soft rounded-lg border border-border">
          {accounts.map((a) => (
            <li key={a.id} className="px-3 py-2 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{a.accountNumber}</span>
                <span className="text-[11px] text-muted-foreground">{a.currency}</span>
              </div>
              <div className="truncate text-[11.5px] text-muted-foreground">{a.portfolio ? `Portfolio ${a.portfolio.ref} · ${a.portfolio.name}` : 'Not linked to a portfolio'}</div>
            </li>
          ))}
        </ul>
      </PanelBody>
    </Panel>
  );
}
