'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil } from 'lucide-react';
import {
  DOCUMENT_CATEGORY_LABELS,
  INVESTOR_TYPE_LABELS,
  P,
  PORTFOLIO_TYPE_LABELS,
  formatBytes,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPercent,
  titleCase,
} from '@nexus/shared';
import { api } from '@/lib/api';
import { useCan } from '@/lib/session';
import { useCrumbs } from '@/components/shell/crumbs';
import { Button, IconButton } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { ActivityTimeline } from '@/components/nx/blocks';
import { DataTable } from '@/components/nx/data-table';
import { ErrorState, InfoList, InfoRow, KpiStrip, PageHeader, Panel, PanelBody, PanelHeader, PanelSkeleton } from '@/components/nx/layout';
import { DocumentStatus, KycStatus, SimpleStatus, StatusIndicator, Tag } from '@/components/nx/status';
import { DocumentPreviewSheet, type PreviewTarget } from './document-preview-sheet';
import { InvestorEditDialog } from './investor-edit-dialog';
import type { InvestorDetail } from './types';

type Answer = 'NO' | 'YES' | 'UNKNOWN';
const AnswerStatus = ({ value }: { value: Answer }) => (
  <StatusIndicator tone={value === 'NO' ? 'success' : value === 'YES' ? 'danger' : 'warning'}>{value === 'NO' ? 'No' : value === 'YES' ? 'Yes' : 'Unknown'}</StatusIndicator>
);

export function InvestorDetailView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const [editing, setEditing] = React.useState(false);
  const [preview, setPreview] = React.useState<PreviewTarget | null>(null);

  const query = useQuery({ queryKey: ['investor', id], queryFn: () => api<InvestorDetail>(`/investors/${id}`), enabled: !!id });
  const inv = query.data;
  useCrumbs(inv ? [{ label: inv.legalName }] : null);

  if (query.isLoading) {
    return (
      <>
        <PageHeader eyebrow="Investor" title="Loading…" />
        <Panel>
          <PanelSkeleton rows={6} />
        </Panel>
      </>
    );
  }
  if (query.error || !inv) {
    return (
      <Panel>
        <ErrorState message={(query.error as Error | null)?.message ?? 'Investor not found'} onRetry={() => query.refetch()} />
      </Panel>
    );
  }

  const kyc = inv.kyc;
  return (
    <>
      <PageHeader
        eyebrow={`Investor · ${inv.ref}`}
        title={inv.legalName}
        description={`${INVESTOR_TYPE_LABELS[inv.investorType]} · ${inv.country}`}
        meta={
          <div className="flex items-center gap-4">
            <KycStatus status={kyc.status} />
            <SimpleStatus value={inv.status} />
          </div>
        }
        actions={
          can(P.INVESTORS_MANAGE) ? (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          ) : undefined
        }
      />

      <KpiStrip
        className="mb-5"
        items={[
          { label: 'Total portfolio value', value: formatMoney(inv.totalPortfolioValue, inv.baseCurrency, { decimals: 0 }), hint: `${inv.portfolios.length} portfolio(s)` },
          { label: 'KYC', value: <KycStatus status={kyc.status} />, hint: kyc.nextReviewAt ? `Next review ${formatDate(kyc.nextReviewAt)}` : 'No review scheduled' },
          { label: 'Risk rating', value: kyc.riskRating ? titleCase(kyc.riskRating) : '—', hint: kyc.riskFlags.length ? `${kyc.riskFlags.length} flag(s)` : 'No flags' },
          { label: 'Relationship manager', value: <span className="text-[15px]">{inv.relationshipManager?.name ?? 'Unassigned'}</span>, hint: inv.relationshipManager?.email },
          { label: 'Client since', value: <span className="text-[15px]">{formatDate(inv.createdAt)}</span>, hint: inv.baseCurrency + ' base currency' },
        ]}
      />

      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
          <TabsTrigger value="kyc">KYC</TabsTrigger>
          <TabsTrigger value="owners">Beneficial owners</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="portfolios">Portfolios</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="Investor profile" />
              <PanelBody>
                <InfoList>
                  <InfoRow label="Legal name">{inv.legalName}</InfoRow>
                  <InfoRow label="Investor type">{INVESTOR_TYPE_LABELS[inv.investorType]}</InfoRow>
                  <InfoRow label="Registration no." mono>{inv.registrationNumber}</InfoRow>
                  <InfoRow label="Tax ID" mono>{inv.taxIdentificationNumber}</InfoRow>
                  <InfoRow label="Country">{inv.country}</InfoRow>
                  <InfoRow label="Registered address">{inv.registeredAddress}</InfoRow>
                  <InfoRow label="Objective">{inv.investmentObjective}</InfoRow>
                  <InfoRow label="Classification">{inv.classification}</InfoRow>
                  <InfoRow label="Base currency">{inv.baseCurrency}</InfoRow>
                  {kyc.application && (
                    <InfoRow label="Onboarding">
                      <Link href={`/internal/onboarding/${kyc.application.id}`} className="text-primary hover:underline">
                        {kyc.application.reference}
                      </Link>
                    </InfoRow>
                  )}
                </InfoList>
              </PanelBody>
            </Panel>
            <div className="grid content-start gap-4">
              <Panel>
                <PanelHeader title="Portfolios" description="Current value is the sum of holdings (simplified valuation)." />
                <PanelBody>
                  {inv.portfolios.length === 0 ? (
                    <p className="py-4 text-[12px] text-muted-foreground">No portfolios have been opened for this investor yet.</p>
                  ) : (
                    <ul className="divide-y divide-border-soft">
                      {inv.portfolios.map((p) => (
                        <li key={p.id}>
                          <Link href={`/internal/portfolios/${p.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">
                            <span className="min-w-0">
                              <span className="block truncate text-[12.5px] font-semibold">{p.name}</span>
                              <span className="num text-[11px] text-muted-foreground">{p.ref}</span>
                            </span>
                            <span className="num text-[12.5px] font-semibold">{formatMoney(p.currentValue, p.baseCurrency, { decimals: 0 })}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </PanelBody>
              </Panel>
              <Panel>
                <PanelHeader title="Recent activity" />
                <PanelBody>
                  <ActivityTimeline
                    items={inv.activity.slice(0, 5).map((a) => ({ id: a.id, title: a.title, body: a.detail, at: a.at, actor: a.actor, tone: a.kind === 'TRANSACTION' ? 'info' : 'neutral' }))}
                  />
                </PanelBody>
              </Panel>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="contact">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="Primary contact" />
              <PanelBody>
                <InfoList>
                  <InfoRow label="Contact person">{inv.contact.name}</InfoRow>
                  <InfoRow label="Email">
                    <a href={`mailto:${inv.contact.email}`} className="text-primary hover:underline">
                      {inv.contact.email}
                    </a>
                  </InfoRow>
                  <InfoRow label="Telephone" mono>{inv.contact.phone}</InfoRow>
                  <InfoRow label="Relationship manager">{inv.relationshipManager ? `${inv.relationshipManager.name} · ${inv.relationshipManager.email}` : 'Unassigned'}</InfoRow>
                </InfoList>
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHeader title="Funding bank account" description="Verified during onboarding. Account numbers are masked." />
              <PanelBody>
                <InfoList>
                  <InfoRow label="Bank">{inv.bank.bankName}</InfoRow>
                  <InfoRow label="Account holder">{inv.bank.accountHolder}</InfoRow>
                  <InfoRow label="Account" mono>{inv.bank.accountMasked}</InfoRow>
                  <InfoRow label="Currency">{inv.bank.currency}</InfoRow>
                  <InfoRow label="SWIFT / BIC" mono>{inv.bank.swiftBic}</InfoRow>
                </InfoList>
              </PanelBody>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="kyc">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="KYC status" />
              <PanelBody>
                <InfoList>
                  <InfoRow label="Status"><KycStatus status={kyc.status} /></InfoRow>
                  <InfoRow label="Risk rating">{kyc.riskRating ? titleCase(kyc.riskRating) : 'Not rated'}</InfoRow>
                  <InfoRow label="Last reviewed">{formatDate(kyc.reviewedAt)}</InfoRow>
                  <InfoRow label="Next review">{formatDate(kyc.nextReviewAt)}</InfoRow>
                  <InfoRow label="Risk flags">
                    {kyc.riskFlags.length ? (
                      <span className="flex flex-wrap gap-1.5">
                        {kyc.riskFlags.map((f) => (
                          <Tag key={f} tone="warning">{f}</Tag>
                        ))}
                      </span>
                    ) : (
                      'None recorded'
                    )}
                  </InfoRow>
                </InfoList>
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHeader title="Declarations" description="As declared by the investor at onboarding." />
              <PanelBody>
                {kyc.declaration ? (
                  <InfoList>
                    <InfoRow label="PEP"><AnswerStatus value={kyc.declaration.pep} /></InfoRow>
                    <InfoRow label="Sanctions"><AnswerStatus value={kyc.declaration.sanctions} /></InfoRow>
                    <InfoRow label="Adverse media"><AnswerStatus value={kyc.declaration.adverseMedia} /></InfoRow>
                    <InfoRow label="High-risk jurisdiction"><AnswerStatus value={kyc.declaration.highRiskJurisdiction} /></InfoRow>
                    <InfoRow label="Source of funds">{kyc.declaration.sourceOfFunds}</InfoRow>
                    <InfoRow label="Source of wealth">{kyc.declaration.sourceOfWealth}</InfoRow>
                    <InfoRow label="Expected activity">{kyc.declaration.expectedActivity}</InfoRow>
                    <InfoRow label="Tax residency">{kyc.declaration.taxResidency}</InfoRow>
                    <InfoRow label="FATCA / CRS">{kyc.declaration.fatca} · {kyc.declaration.crs}</InfoRow>
                    <InfoRow label="Consent">{kyc.declaration.consentGiven ? `Given ${formatDateTime(kyc.declaration.consentAt)} by ${kyc.declaration.signatureName}` : 'Not given'}</InfoRow>
                  </InfoList>
                ) : (
                  <p className="py-4 text-[12px] text-muted-foreground">No declaration is on file for this investor.</p>
                )}
              </PanelBody>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="owners">
          <OwnersTab inv={inv} />
        </TabsContent>

        <TabsContent value="accounts">
          <Panel>
            <DataTable<InvestorDetail['accounts'][number]>
              columns={accountColumns}
              data={inv.accounts}
              emptyTitle="No investment accounts"
              emptyDescription="An account is created automatically when an application is approved."
            />
          </Panel>
        </TabsContent>

        <TabsContent value="portfolios">
          <Panel>
            <DataTable<InvestorDetail['portfolios'][number]>
              columns={portfolioColumns}
              data={inv.portfolios}
              onRowClick={(p) => router.push(`/internal/portfolios/${p.id}`)}
              emptyTitle="No portfolios"
              emptyDescription="Create a portfolio from the Portfolios register."
            />
          </Panel>
        </TabsContent>

        <TabsContent value="documents">
          <Panel>
            <DataTable<InvestorDetail['documents'][number]>
              columns={documentColumns((d) => setPreview({ id: d.id, title: d.title, mimeType: d.file?.mimeType, fileName: d.file?.fileName, version: d.currentVersionNo, subtitle: `${d.ref} · ${DOCUMENT_CATEGORY_LABELS[d.category]}` }))}
              data={inv.documents}
              emptyTitle="No documents"
              emptyDescription="Onboarding evidence, statements and notices for this investor appear here."
            />
          </Panel>
        </TabsContent>

        <TabsContent value="activity">
          <Panel>
            <PanelHeader title="Activity" description="Audit events and recent investment activity." />
            <PanelBody>
              <ActivityTimeline
                items={inv.activity.map((a) => ({ id: a.id, title: a.title, body: a.detail, at: a.at, actor: a.actor, tone: a.kind === 'TRANSACTION' ? 'info' : 'neutral' }))}
                empty="No activity recorded yet."
              />
            </PanelBody>
          </Panel>
        </TabsContent>
      </Tabs>

      {can(P.INVESTORS_MANAGE) && <InvestorEditDialog investor={inv} open={editing} onOpenChange={setEditing} />}
      <DocumentPreviewSheet doc={preview} onClose={() => setPreview(null)} />
    </>
  );
}

function OwnersTab({ inv }: { inv: InvestorDetail }) {
  const total = inv.owners.reduce((a, o) => a + Number(o.ownershipPercent), 0);
  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHeader title="Beneficial owners & controllers" description={inv.owners.length ? `Declared ownership totals ${formatPercent(total, 2)}.` : undefined} />
        <DataTable<InvestorDetail['owners'][number]>
          columns={ownerColumns}
          data={inv.owners}
          emptyTitle="No beneficial owners on file"
          emptyDescription="Ownership is captured during onboarding."
        />
      </Panel>
      <Panel>
        <PanelHeader title="Authorised signatories" />
        <DataTable<InvestorDetail['signatories'][number]> columns={signatoryColumns} data={inv.signatories} emptyTitle="No signatories on file" />
      </Panel>
    </div>
  );
}

const ownerColumns: ColumnDef<InvestorDetail['owners'][number]>[] = [
  { id: 'name', header: 'Name', cell: ({ row }) => <span className="font-semibold">{row.original.fullName}</span> },
  { id: 'nationality', header: 'Nationality', cell: ({ row }) => row.original.nationality },
  { id: 'id', header: 'ID reference', cell: ({ row }) => <span className="num">{row.original.idReference}</span> },
  { id: 'controller', header: 'Controller', cell: ({ row }) => (row.original.isController ? 'Yes' : 'No') },
  { id: 'pct', header: 'Ownership', meta: { align: 'right' }, cell: ({ row }) => formatPercent(row.original.ownershipPercent, 2) },
];

const signatoryColumns: ColumnDef<InvestorDetail['signatories'][number]>[] = [
  { id: 'name', header: 'Name', cell: ({ row }) => <span className="font-semibold">{row.original.fullName}</span> },
  { id: 'role', header: 'Role', cell: ({ row }) => row.original.role },
  { id: 'email', header: 'Email', cell: ({ row }) => row.original.email },
  { id: 'authority', header: 'Authority', cell: ({ row }) => row.original.authority ?? '—' },
];

const accountColumns: ColumnDef<InvestorDetail['accounts'][number]>[] = [
  {
    id: 'name',
    header: 'Account',
    cell: ({ row }) => (
      <div>
        <div className="font-semibold">{row.original.name}</div>
        <div className="num text-[11px] text-muted-foreground">{row.original.ref}</div>
      </div>
    ),
  },
  { id: 'type', header: 'Type', cell: ({ row }) => titleCase(row.original.type) },
  { id: 'currency', header: 'Currency', cell: ({ row }) => row.original.baseCurrency },
  { id: 'portfolios', header: 'Portfolios', meta: { align: 'right' }, cell: ({ row }) => row.original.portfolioCount },
  { id: 'value', header: 'Value', meta: { align: 'right' }, cell: ({ row }) => formatMoney(row.original.value, row.original.baseCurrency, { decimals: 0 }) },
  { id: 'status', header: 'Status', cell: ({ row }) => <SimpleStatus value={row.original.status} /> },
];

const portfolioColumns: ColumnDef<InvestorDetail['portfolios'][number]>[] = [
  {
    id: 'name',
    header: 'Portfolio',
    cell: ({ row }) => (
      <div>
        <Link href={`/internal/portfolios/${row.original.id}`} className="font-semibold hover:text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {row.original.name}
        </Link>
        <div className="num text-[11px] text-muted-foreground">{row.original.ref}</div>
      </div>
    ),
  },
  { id: 'type', header: 'Type', cell: ({ row }) => PORTFOLIO_TYPE_LABELS[row.original.type] },
  { id: 'manager', header: 'Manager', cell: ({ row }) => row.original.manager ?? '—' },
  { id: 'benchmark', header: 'Benchmark', cell: ({ row }) => <span className="text-ink-2">{row.original.benchmark ?? '—'}</span> },
  { id: 'inception', header: 'Inception', cell: ({ row }) => <span className="num">{formatDate(row.original.inceptionDate)}</span> },
  { id: 'value', header: 'Value', meta: { align: 'right' }, cell: ({ row }) => <span className="font-semibold">{formatMoney(row.original.currentValue, row.original.baseCurrency, { decimals: 0 })}</span> },
  { id: 'status', header: 'Status', cell: ({ row }) => <SimpleStatus value={row.original.status} /> },
];

const documentColumns = (onPreview: (d: InvestorDetail['documents'][number]) => void): ColumnDef<InvestorDetail['documents'][number]>[] => [
  {
    id: 'title',
    header: 'Document',
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-semibold">{row.original.title}</div>
        <div className="num text-[11px] text-muted-foreground">{row.original.ref}{row.original.file ? ` · ${row.original.file.fileName} · ${formatBytes(row.original.file.sizeBytes)}` : ''}</div>
      </div>
    ),
  },
  { id: 'category', header: 'Category', cell: ({ row }) => <span className="text-ink-2">{DOCUMENT_CATEGORY_LABELS[row.original.category]}</span> },
  { id: 'status', header: 'Status', cell: ({ row }) => <DocumentStatus status={row.original.status} /> },
  { id: 'version', header: 'Ver.', meta: { align: 'right' }, cell: ({ row }) => `v${row.original.currentVersionNo}` },
  { id: 'date', header: 'Added', cell: ({ row }) => <span className="num">{formatDate(row.original.createdAt)}</span> },
  {
    id: 'preview',
    header: '',
    meta: { width: '48px', align: 'right' },
    cell: ({ row }) => (
      <IconButton label="Preview document" size="icon-sm" onClick={(e) => { e.stopPropagation(); onPreview(row.original); }}>
        <Eye />
      </IconButton>
    ),
  },
];
