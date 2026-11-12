'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Segmented } from '@/components/nx/filters';
import { EmptyState, ErrorState, Panel, PanelBody, PanelHeader, PanelSkeleton } from '@/components/nx/layout';
import { DayEndForm } from '@/components/features/custodian/day-end-form';
import { ExecutionForm } from '@/components/features/custodian/execution-form';
import { StatusCard } from '@/components/features/custodian/status-card';
import { SubmissionRegister } from '@/components/features/custodian/submission-register';
import { SubmissionSheet } from '@/components/features/custodian/submission-sheet';
import type { AccountOption, SubmissionDetail, SubmissionRow } from '@/components/features/custodian/types';

type Tab = 'execution' | 'dayend' | 'history';

const STEPS = [
  { n: '01 · EXECUTION', t: 'Record the trade after execution' },
  { n: '02 · DAY END', t: 'Submit cash, holdings and trade control totals' },
  { n: '03 · RECONCILE', t: 'Matanho matches against its internal book' },
];

export default function CustodianPortalPage() {
  const session = useSession();
  const [tab, setTab] = React.useState<Tab>('execution');
  const [open, setOpen] = React.useState<SubmissionRow | null>(null);
  const [correction, setCorrection] = React.useState<SubmissionDetail | null>(null);
  const accountsQ = useQuery({ queryKey: ['custodian', 'accounts'], queryFn: () => api<AccountOption[]>('/custodian/accounts') });
  const accounts = accountsQ.data ?? [];

  const startCorrection = (d: SubmissionDetail) => {
    setOpen(null);
    setCorrection(d);
    setTab(d.kind === 'EXECUTION' ? 'execution' : 'dayend');
  };

  return (
    <div>
      {/* hero */}
      <section className="mb-4 rounded-lg border border-border bg-surface px-5 py-5 sm:px-6">
        <div className="eyebrow">TRADE CONFIRMATION · DAY-END BOOK · RECONCILIATION EVIDENCE</div>
        <h1 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-[-0.03em] sm:text-[26px]">Custodian / Counterparty Portal</h1>
        <p className="mt-1.5 max-w-[760px] text-[12.5px] leading-relaxed text-muted-foreground">
          Enter the executed trade as soon as it is available, then submit the independent day-end book later. The asset manager receives both records in the same reconciliation staging area.
        </p>
        {session.data && (
          <p className="mt-2 text-[11.5px] text-ink-3">
            Signed in as <span className="font-semibold text-ink-2">{session.data.name}</span> · {session.data.organisation.name}
          </p>
        )}
        <ol className="mt-4 grid overflow-hidden rounded-lg border border-border bg-surface md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.n} className={`px-3.5 py-3 ${i > 0 ? 'border-t border-border md:border-l md:border-t-0' : ''}`}>
              <span className="eyebrow">{s.n}</span>
              <strong className="mt-1 block text-[12.5px] font-semibold">{s.t}</strong>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Panel>
          <PanelHeader title="Submit counterparty data" description="Use the execution tab during the day. Use Day-end after the official books are final." />
          <PanelBody>
            <Segmented<Tab>
              className="mb-4 max-w-full overflow-x-auto"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'execution', label: 'Trade execution' },
                { value: 'dayend', label: 'Day-end package' },
                { value: 'history', label: 'Submission history' },
              ]}
            />
            {accountsQ.isLoading && <PanelSkeleton rows={6} />}
            {accountsQ.error && <ErrorState message={(accountsQ.error as Error).message} onRetry={() => void accountsQ.refetch()} />}
            {accountsQ.data && accounts.length === 0 && <EmptyState title="No accounts assigned" description="No custodian accounts are linked to your organisation yet. Contact Matanho operations." />}
            {accounts.length > 0 && (
              <>
                <div className={tab === 'execution' ? '' : 'hidden'}>
                  <ExecutionForm accounts={accounts} correctionFor={correction?.kind === 'EXECUTION' ? correction : null} onCorrectionConsumed={() => setCorrection(null)} onSubmitted={() => undefined} />
                </div>
                <div className={tab === 'dayend' ? '' : 'hidden'}>
                  <DayEndForm accounts={accounts} correctionFor={correction?.kind === 'DAY_END' ? correction : null} onCorrectionConsumed={() => setCorrection(null)} onSubmitted={() => undefined} />
                </div>
                {tab === 'history' && (
                  <div className="-mx-4 -mb-4 border-t border-border-soft">
                    <SubmissionRegister mode="custodian" accounts={accounts} onOpen={setOpen} activeId={open?.id} />
                  </div>
                )}
              </>
            )}
          </PanelBody>
        </Panel>

        <StatusCard accounts={accounts} onOpen={setOpen} />
      </div>

      <SubmissionSheet mode="custodian" row={open} onClose={() => setOpen(null)} onCorrect={startCorrection} />
    </div>
  );
}
