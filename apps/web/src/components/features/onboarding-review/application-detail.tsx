'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, CircleAlert, Eye, FileText } from 'lucide-react';
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_SLOTS,
  INVESTOR_TYPE_LABELS,
  ownershipError,
  ownershipTotal,
  formatBytes,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPercent,
  titleCase,
} from '@nexus/shared';
import { api } from '@/lib/api';
import { useCrumbs } from '@/components/shell/crumbs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { IconButton } from '@/components/ui/button';
import { ActivityTimeline, type TimelineItem } from '@/components/nx/blocks';
import { DataTable } from '@/components/nx/data-table';
import { ErrorState, InfoList, InfoRow, PageHeader, Panel, PanelBody, PanelHeader, PanelSkeleton } from '@/components/nx/layout';
import { ApplicationStatus, DocumentStatus, StatusIndicator, Tag } from '@/components/nx/status';
import { DocumentPreviewSheet, type PreviewTarget } from '@/components/features/investors/document-preview-sheet';
import { ApplicationReviewPanel } from './review-panel';
import type { ApplicationDetail, ApplicationDoc } from './types';

const AnswerStatus = ({ value }: { value: 'NO' | 'YES' | 'UNKNOWN' | undefined }) =>
  value ? <StatusIndicator tone={value === 'NO' ? 'success' : value === 'YES' ? 'danger' : 'warning'}>{value === 'NO' ? 'No' : value === 'YES' ? 'Yes' : 'Unknown'}</StatusIndicator> : <>—</>;

const maskAccount = (n?: string) => (n ? `•••• ${n.slice(-4)}` : undefined);

export function ApplicationDetailView() {
  const { id } = useParams<{ id: string }>();
  const [preview, setPreview] = React.useState<PreviewTarget | null>(null);
  const query = useQuery({ queryKey: ['application', id], queryFn: () => api<ApplicationDetail>(`/applications/${id}`), enabled: !!id });
  const app = query.data;
  useCrumbs(app ? [{ label: app.payload.legalName ?? app.reference }] : null);

  if (query.isLoading) {
    return (
      <>
        <PageHeader eyebrow="Application" title="Loading…" />
        <Panel>
          <PanelSkeleton rows={8} />
        </Panel>
      </>
    );
  }
  if (query.error || !app) {
    return (
      <Panel>
        <ErrorState message={(query.error as Error | null)?.message ?? 'Application not found'} onRetry={() => query.refetch()} />
      </Panel>
    );
  }

  const p = app.payload;
  const openDoc = (d: ApplicationDoc, versionNo: number) => {
    const v = d.versions.find((x) => x.versionNo === versionNo);
    setPreview({ id: d.id, title: d.title, mimeType: v?.mimeType, fileName: v?.fileName, version: versionNo, subtitle: `${d.ref} · version ${versionNo}${v ? ` · ${formatBytes(v.sizeBytes)}` : ''}` });
  };

  return (
    <>
      <PageHeader
        eyebrow={`Application · ${app.reference}`}
        title={p.legalName ?? 'Unnamed applicant'}
        description={[p.investorType ? INVESTOR_TYPE_LABELS[p.investorType] : null, p.country, app.submittedAt ? `Submitted ${formatDate(app.submittedAt)}` : 'Not submitted'].filter(Boolean).join(' · ')}
        meta={<ApplicationStatus status={app.status} />}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <Tabs defaultValue="investor">
            <TabsList className="px-2">
              <TabsTrigger value="investor">Investor</TabsTrigger>
              <TabsTrigger value="ownership">Ownership & signatories</TabsTrigger>
              <TabsTrigger value="declarations">
                Declarations & risk
                {app.riskFlags.length > 0 && <Tag tone="warning">{app.riskFlags.length}</Tag>}
              </TabsTrigger>
              <TabsTrigger value="taxbank">Tax & bank</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="investor" className="p-4">
              <InfoList>
                <InfoRow label="Legal name">{p.legalName}</InfoRow>
                <InfoRow label="Investor type">{p.investorType ? INVESTOR_TYPE_LABELS[p.investorType] : undefined}</InfoRow>
                <InfoRow label="Registration no." mono>{p.registrationNumber}</InfoRow>
                <InfoRow label="Country">{p.country}</InfoRow>
                <InfoRow label="Incorporated">{p.incorporationDate ? formatDate(p.incorporationDate) : undefined}</InfoRow>
                <InfoRow label="Regulatory status">{p.regulatoryStatus}</InfoRow>
                <InfoRow label="Regulator">{[p.regulator, p.licenceRef].filter(Boolean).join(' · ') || undefined}</InfoRow>
                <InfoRow label="Website">{p.website}</InfoRow>
                <InfoRow label="Tax ID" mono>{p.taxIdentificationNumber}</InfoRow>
                <InfoRow label="Registered address">{p.registeredAddress}</InfoRow>
                <InfoRow label="Contact">{[p.contactName, p.email, p.telephone].filter(Boolean).join(' · ') || undefined}</InfoRow>
                <InfoRow label="Objective">{p.investmentObjective}</InfoRow>
                <InfoRow label="Relationship">{p.relationshipRequested}</InfoRow>
                <InfoRow label="Mandate">{p.mandate}</InfoRow>
                <InfoRow label="Initial investment" mono>{p.initialInvestment !== undefined ? formatMoney(p.initialInvestment, p.baseCurrency ?? 'USD', { decimals: 0 }) : undefined}</InfoRow>
                <InfoRow label="Base currency">{p.baseCurrency}</InfoRow>
                <InfoRow label="Classification">{p.investorClassification}</InfoRow>
              </InfoList>
            </TabsContent>

            <TabsContent value="ownership" className="p-4">
              <OwnershipTab app={app} />
            </TabsContent>

            <TabsContent value="declarations" className="p-4">
              <DeclarationsTab app={app} />
            </TabsContent>

            <TabsContent value="taxbank" className="p-4">
              <InfoList>
                <InfoRow label="Tax residency">{app.declaration?.taxResidency ?? p.taxResidency}</InfoRow>
                <InfoRow label="FATCA">{app.declaration?.fatca ?? p.fatca}</InfoRow>
                <InfoRow label="CRS">{app.declaration?.crs ?? p.crs}</InfoRow>
                <InfoRow label="US indicia">{(app.declaration?.usIndicia ?? p.usIndicia) ? 'Present' : 'None declared'}</InfoRow>
                <InfoRow label="Bank">{app.declaration?.bankName ?? p.bankName}</InfoRow>
                <InfoRow label="Account holder">{app.declaration?.bankAccountHolder ?? p.bankAccountHolder}</InfoRow>
                <InfoRow label="Account" mono>{app.declaration?.bankAccountMasked ?? maskAccount(p.bankAccountNumber)}</InfoRow>
                <InfoRow label="Currency">{app.declaration?.bankCurrency ?? p.bankCurrency}</InfoRow>
                <InfoRow label="SWIFT / BIC" mono>{app.declaration?.swiftBic ?? p.swiftBic}</InfoRow>
              </InfoList>
              <p className="mt-3 text-[11px] text-muted-foreground">Account numbers are masked. The original bank evidence is in Documents.</p>
            </TabsContent>

            <TabsContent value="documents" className="p-4">
              <DocumentsTab app={app} onPreview={openDoc} />
            </TabsContent>

            <TabsContent value="history" className="p-4">
              <HistoryTab app={app} />
            </TabsContent>
          </Tabs>
        </Panel>

        <ApplicationReviewPanel app={app} />
      </div>
      <DocumentPreviewSheet doc={preview} onClose={() => setPreview(null)} />
    </>
  );
}

// ── ownership ─────────────────────────────────────────────────────────────────
type OwnerRow = { id: string; fullName: string; ownershipPercent: number; nationality: string; idReference: string; isController: boolean };

function OwnershipTab({ app }: { app: ApplicationDetail }) {
  const p = app.payload;
  const owners: OwnerRow[] = app.owners.length
    ? app.owners.map((o) => ({ id: o.id, fullName: o.fullName, ownershipPercent: Number(o.ownershipPercent), nationality: o.nationality, idReference: o.idReference, isController: o.isController }))
    : (p.owners ?? []).map((o, i) => ({ id: String(i), fullName: o.fullName, ownershipPercent: o.ownershipPercent, nationality: o.nationality, idReference: o.idReference, isController: !!o.isController }));
  const signatories = app.signatories.length ? app.signatories : (p.signatories ?? []).map((s, i) => ({ id: String(i), fullName: s.fullName, role: s.role, email: s.email, authority: s.authority ?? null }));
  const total = ownershipTotal(owners);
  const error = ownershipError(p.investorType, owners);

  const ownerCols: ColumnDef<OwnerRow>[] = [
    { id: 'name', header: 'Name', cell: ({ row }) => <span className="font-semibold">{row.original.fullName}</span> },
    { id: 'nat', header: 'Nationality', cell: ({ row }) => row.original.nationality },
    { id: 'idref', header: 'ID reference', cell: ({ row }) => <span className="num">{row.original.idReference}</span> },
    { id: 'ctl', header: 'Controller', cell: ({ row }) => (row.original.isController ? 'Yes' : 'No') },
    { id: 'pct', header: 'Ownership', meta: { align: 'right' }, cell: ({ row }) => formatPercent(row.original.ownershipPercent, 2) },
  ];
  const sigCols: ColumnDef<(typeof signatories)[number]>[] = [
    { id: 'name', header: 'Name', cell: ({ row }) => <span className="font-semibold">{row.original.fullName}</span> },
    { id: 'role', header: 'Role', cell: ({ row }) => row.original.role },
    { id: 'email', header: 'Email', cell: ({ row }) => row.original.email },
    { id: 'auth', header: 'Authority', cell: ({ row }) => row.original.authority ?? '—' },
  ];

  return (
    <div className="grid gap-5">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold">Beneficial owners & controllers</h3>
          <span className="flex items-center gap-1.5 text-[12px]">
            {error ? <CircleAlert className="size-3.5 text-danger" /> : <CheckCircle2 className="size-3.5 text-success" />}
            <span className={error ? 'text-danger' : 'text-success'}>{formatPercent(total, 2)} declared</span>
          </span>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <DataTable<OwnerRow> columns={ownerCols} data={owners} dense emptyTitle="No beneficial owners declared" />
        </div>
        {error && <p role="alert" className="mt-2 text-[11.5px] font-medium text-danger">{error}</p>}
        {p.ownershipNarrative && <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{p.ownershipNarrative}</p>}
      </div>
      <div>
        <h3 className="mb-2 text-[13px] font-semibold">Authorised signatories</h3>
        <div className="overflow-hidden rounded-lg border border-border">
          <DataTable columns={sigCols} data={signatories} dense emptyTitle="No signatories declared" />
        </div>
        {p.authorityNarrative && <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{p.authorityNarrative}</p>}
      </div>
    </div>
  );
}

// ── declarations ──────────────────────────────────────────────────────────────
function DeclarationsTab({ app }: { app: ApplicationDetail }) {
  const d = app.declaration;
  const p = app.payload;
  return (
    <div className="grid gap-5">
      <div>
        <h3 className="mb-2 text-[13px] font-semibold">Risk flags</h3>
        {app.riskFlags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {app.riskFlags.map((f) => (
              <Tag key={f} tone="warning">{f}</Tag>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">No adverse declarations or risk flags.</p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">Flags are derived from the applicant’s own declarations. They are not external screening results.</p>
      </div>
      <InfoList>
        <InfoRow label="PEP"><AnswerStatus value={d?.pep ?? p.pep} /></InfoRow>
        <InfoRow label="Sanctions"><AnswerStatus value={d?.sanctions ?? p.sanctions} /></InfoRow>
        <InfoRow label="Adverse media"><AnswerStatus value={d?.adverseMedia ?? p.adverseMedia} /></InfoRow>
        <InfoRow label="High-risk jurisdiction"><AnswerStatus value={d?.highRiskJurisdiction ?? p.highRiskJurisdiction} /></InfoRow>
        <InfoRow label="Source of funds">{d?.sourceOfFunds ?? p.sourceOfFunds}</InfoRow>
        <InfoRow label="Source of wealth">{d?.sourceOfWealth ?? p.sourceOfWealth}</InfoRow>
        <InfoRow label="Expected activity">{d?.expectedActivity ?? p.expectedActivity}</InfoRow>
        <InfoRow label="Frequency">{d?.transactionFrequency ?? p.transactionFrequency}</InfoRow>
        <InfoRow label="Applicant narrative">{d?.riskNarrative ?? p.riskNarrative ?? undefined}</InfoRow>
        <InfoRow label="Consent">
          {app.consentAt || d?.consentGiven ? `Given ${formatDateTime(d?.consentAt ?? app.consentAt)} · signed ${d?.signatureName ?? app.signatureName ?? p.signatureName ?? ''}` : 'Not given'}
        </InfoRow>
      </InfoList>
    </div>
  );
}

// ── documents ─────────────────────────────────────────────────────────────────
function DocumentsTab({ app, onPreview }: { app: ApplicationDetail; onPreview: (d: ApplicationDoc, versionNo: number) => void }) {
  const have = new Set(app.documents.filter((d) => d.status !== 'REJECTED').map((d) => d.requirementKey));
  const docColumns: ColumnDef<ApplicationDoc>[] = [
    {
      id: 'title',
      header: 'Document',
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{row.original.title}</div>
          <div className="num text-[11px] text-muted-foreground">{row.original.ref} · {row.original.slotTitle ?? DOCUMENT_CATEGORY_LABELS[row.original.category]}</div>
        </div>
      ),
    },
    { id: 'status', header: 'Status', cell: ({ row }) => <DocumentStatus status={row.original.status} /> },
    {
      id: 'versions',
      header: 'Versions',
      cell: ({ row }) => (
        <ul className="grid gap-1">
          {row.original.versions.map((v) => (
            <li key={v.versionNo} className="flex items-center gap-2 text-[11.5px]">
              <span className="num font-semibold">v{v.versionNo}</span>
              <span className="min-w-0 truncate text-ink-2">{v.fileName}</span>
              <span className="num text-muted-foreground">{formatBytes(v.sizeBytes)}</span>
              <span className="num hidden text-ink-3 xl:inline" title={v.sha256}>{v.sha256.slice(0, 8)}</span>
              <IconButton label={`Preview version ${v.versionNo}`} size="icon-sm" onClick={() => onPreview(row.original, v.versionNo)}>
                <Eye />
              </IconButton>
            </li>
          ))}
        </ul>
      ),
    },
    { id: 'added', header: 'Uploaded', cell: ({ row }) => <span className="num">{formatDate(row.original.versions[0]?.createdAt ?? row.original.createdAt)}</span> },
  ];

  return (
    <div className="grid gap-5">
      <div>
        <h3 className="mb-2 text-[13px] font-semibold">Evidence checklist</h3>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {DOCUMENT_SLOTS.map((s) => {
            const ok = have.has(s.id);
            return (
              <li key={s.id} className="flex items-start gap-2 rounded-md border border-border-soft bg-surface-2 px-2.5 py-2 text-[12px]">
                {ok ? <CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" /> : s.required ? <CircleAlert className="mt-px size-3.5 shrink-0 text-danger" /> : <FileText className="mt-px size-3.5 shrink-0 text-ink-3" />}
                <span className="min-w-0">
                  <span className="font-medium">{s.title}</span>
                  <span className="block text-[11px] text-muted-foreground">{ok ? 'Uploaded' : s.required ? 'Required: missing' : 'Optional'}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-[13px] font-semibold">Uploaded files</h3>
        <div className="overflow-hidden rounded-lg border border-border">
          <DataTable<ApplicationDoc> columns={docColumns} data={app.documents} dense emptyTitle="No documents uploaded" emptyDescription="The applicant has not uploaded any evidence yet." />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Previews show the original stored file. Replacements keep every earlier version.</p>
      </div>
    </div>
  );
}

// ── history ───────────────────────────────────────────────────────────────────
const NOTE_TONE = { NOTE: 'neutral', INFO_REQUEST: 'warning', DECISION: 'info', APPLICANT_RESPONSE: 'success' } as const;
const NOTE_TITLE = { NOTE: 'Internal note', INFO_REQUEST: 'Information requested', DECISION: 'Decision recorded', APPLICANT_RESPONSE: 'Applicant response' } as const;

function HistoryTab({ app }: { app: ApplicationDetail }) {
  const items: Array<TimelineItem & { ts: number }> = [
    ...app.notes.map((n) => ({
      id: `note-${n.id}`,
      title: NOTE_TITLE[n.kind],
      body: n.body,
      at: n.createdAt,
      actor: n.authorName ?? 'Applicant',
      tone: NOTE_TONE[n.kind],
      ts: new Date(n.createdAt).getTime(),
    })),
    ...app.history.map((h) => ({
      id: `audit-${h.id}`,
      title: titleCase(h.action),
      body: undefined,
      at: h.at,
      actor: h.actor,
      tone: (/REJECT/.test(h.action) ? 'danger' : /APPROVED/.test(h.action) ? 'success' : 'neutral') as TimelineItem['tone'],
      ts: new Date(h.at).getTime(),
    })),
  ].sort((a, b) => b.ts - a.ts);
  return <ActivityTimeline items={items} empty="No history recorded for this application yet." />;
}
