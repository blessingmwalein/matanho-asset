'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, TriangleAlert } from 'lucide-react';
import { formatDate, formatDateTime, INVESTOR_TYPE_LABELS, type InvestorType } from '@nexus/shared';
import { cn } from '@/lib/utils';
import { DataTable } from '@/components/nx/data-table';
import { ErrorState, InfoList, InfoRow, PageHeader, Panel, PanelBody, PanelHeader, PanelSkeleton } from '@/components/nx/layout';
import { KycStatus, SimpleStatus } from '@/components/nx/status';
import { useProfile } from '@/components/features/portal/hooks';
import type { ProfileView } from '@/components/features/portal/types';

type UserRow = ProfileView['users'][number];

export default function ProfilePage() {
  const q = useProfile();
  const p = q.data;

  const columns = React.useMemo<ColumnDef<UserRow, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'User',
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">
              {row.original.name}
              {row.original.isYou && <span className="ml-1.5 text-[10.5px] font-normal text-muted-foreground">(you)</span>}
            </div>
            <div className="text-[11px] text-muted-foreground">{row.original.email}</div>
          </div>
        ),
      },
      { id: 'role', header: 'Role', cell: ({ row }) => row.original.role },
      { id: 'status', header: 'Access', cell: ({ row }) => <SimpleStatus value={row.original.status} /> },
      { id: 'login', header: 'Last sign-in', cell: ({ row }) => <span className="num text-muted-foreground">{row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt) : 'Not yet'}</span> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader eyebrow="Investor profile" title="Profile & access" description="Approved organisation details, KYC state, bank instructions and portal users. To change any of these, use Contact IR." />

      {q.isError ? (
        <Panel>
          <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />
        </Panel>
      ) : !p ? (
        <PanelSkeleton rows={8} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <Panel>
              <PanelHeader title="Organisation record" description="Approved investor master" actions={<KycStatus status={p.kyc.status} />} />
              <PanelBody>
                <InfoList>
                  <InfoRow label="Legal name">{p.organisation.legalName}</InfoRow>
                  <InfoRow label="Investor type">{INVESTOR_TYPE_LABELS[p.organisation.investorType as InvestorType] ?? p.organisation.investorType}</InfoRow>
                  <InfoRow label="Reference" mono>{p.organisation.ref}</InfoRow>
                  <InfoRow label="Registration" mono>{p.organisation.registrationNumber}</InfoRow>
                  <InfoRow label="Jurisdiction">{p.organisation.country}</InfoRow>
                  <InfoRow label="Registered address">{p.organisation.registeredAddress}</InfoRow>
                  <InfoRow label="Primary contact">{p.organisation.contactName} · {p.organisation.email}</InfoRow>
                  <InfoRow label="Tax ID" mono>{p.organisation.taxIdentificationNumber}</InfoRow>
                  <InfoRow label="Classification">{p.organisation.classification}</InfoRow>
                  <InfoRow label="Base currency">{p.organisation.baseCurrency}</InfoRow>
                  <InfoRow label="Relationship since">{formatDate(p.organisation.since)}</InfoRow>
                  {p.relationshipManager && <InfoRow label="Relationship manager">{p.relationshipManager.name} · {p.relationshipManager.email}</InfoRow>}
                </InfoList>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="KYC & access" description="Client-facing control state" />
              <PanelBody>
                <ul>
                  {p.kyc.items.map((it) => (
                    <li key={it.key} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border-soft py-3 first:border-t-0">
                      <span className={cn('grid size-6 place-items-center rounded-full', it.state === 'current' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
                        {it.state === 'current' ? <Check className="size-3.5" strokeWidth={3} /> : <TriangleAlert className="size-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold">{it.label}</div>
                        <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{it.detail}</div>
                      </div>
                      <span className={cn('text-[11px] font-bold', it.state === 'current' ? 'text-success' : 'text-warning')}>{it.value}</span>
                    </li>
                  ))}
                </ul>
                {p.kyc.nextReviewAt && <p className="mt-2 border-t border-border-soft pt-3 text-[11.5px] text-muted-foreground">Next periodic review: <b className="num font-semibold text-ink-2">{formatDate(p.kyc.nextReviewAt)}</b></p>}
              </PanelBody>
            </Panel>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <Panel>
              <PanelHeader title="Distribution bank" description="Masked summary. Full details are held securely." />
              <PanelBody>
                <InfoList>
                  <InfoRow label="Bank">{p.bank.bankName}</InfoRow>
                  <InfoRow label="Account holder">{p.bank.accountHolder}</InfoRow>
                  <InfoRow label="Account" mono>{p.bank.accountMasked}</InfoRow>
                  <InfoRow label="Currency">{p.bank.currency}</InfoRow>
                  <InfoRow label="SWIFT / BIC" mono>{p.bank.swiftBic}</InfoRow>
                </InfoList>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Bank instructions change only through a verified request to Investor Relations.</p>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Portal users" description={`${p.users.filter((u) => u.status === 'ACTIVE').length} authorised user${p.users.length === 1 ? '' : 's'} for this organisation`} />
              <DataTable columns={columns} data={p.users} getRowId={(r) => r.id} dense />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
