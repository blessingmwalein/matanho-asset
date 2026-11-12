'use client';

import * as React from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { formatDateTime, titleCase } from '@nexus/shared';
import { api, type Paged } from '@/lib/api';
import { useListState } from '@/lib/use-list-state';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { DataTable } from '@/components/nx/data-table';
import { FilterBar, FilterSelect, SearchInput } from '@/components/nx/filters';
import { InfoList, InfoRow, PageHeader, Panel, PanelBody, PanelHeader, PanelSkeleton } from '@/components/nx/layout';
import { DetailSection } from '@/components/nx/blocks';
import { StatusIndicator } from '@/components/nx/status';

interface Settings {
  environment: string;
  version: string;
  database: string;
  storageDriver: string;
  jwtExpiresIn: string;
  presentationFx: Record<string, number>;
  counts: Record<string, number>;
  notes: string[];
}
interface AuditRow {
  id: string;
  createdAt: string;
  actorEmail: string | null;
  actorRole: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  before: unknown;
  after: unknown;
  metadata: unknown;
  ip: string | null;
}

const STORAGE_NOTE: Record<string, string> = {
  local: 'Local disk (development only; not durable on hosted platforms).',
  db: 'PostgreSQL (bytes stored in the database; durable without object storage).',
  s3: 'Private S3-compatible bucket.',
};

function SystemTab() {
  const q = useQuery({ queryKey: ['admin-settings'], queryFn: () => api<Settings>('/admin/settings') });
  const s = q.data;
  if (!s) return <PanelSkeleton rows={6} />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="System" description="Read-only runtime configuration. Secrets are never displayed." />
        <PanelBody>
          <InfoList>
            <InfoRow label="Version">{s.version}</InfoRow>
            <InfoRow label="Environment">{titleCase(s.environment)}</InfoRow>
            <InfoRow label="Database"><StatusIndicator tone={s.database === 'up' ? 'success' : 'danger'}>{s.database === 'up' ? 'Connected (PostgreSQL)' : 'Unavailable'}</StatusIndicator></InfoRow>
            <InfoRow label="Document storage">{s.storageDriver.toUpperCase()}<span className="mt-0.5 block text-[11.5px] font-normal text-muted-foreground">{STORAGE_NOTE[s.storageDriver]}</span></InfoRow>
            <InfoRow label="Session length">{s.jwtExpiresIn}</InfoRow>
          </InfoList>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Records" description="Live counts from the database." />
        <PanelBody>
          <InfoList>
            {Object.entries(s.counts).map(([k, v]) => (
              <InfoRow key={k} label={titleCase(k.replace(/([A-Z])/g, '_$1'))} mono>{v.toLocaleString('en-US')}</InfoRow>
            ))}
          </InfoList>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Presentation FX" description="Indicative rates used only to display investor values in another currency." />
        <PanelBody>
          <InfoList>
            {Object.entries(s.presentationFx).map(([ccy, r]) => (
              <InfoRow key={ccy} label={`USD → ${ccy}`} mono>{r.toFixed(2)}</InfoRow>
            ))}
          </InfoList>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="MVP notes" />
        <PanelBody>
          <ul className="grid gap-2.5 text-[12.5px] leading-relaxed text-ink-2">
            {s.notes.map((n) => <li key={n} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-ink-3" />{n}</li>)}
          </ul>
        </PanelBody>
      </Panel>
    </div>
  );
}

function AuditTab() {
  const list = useListState({ pageSize: 25 });
  const [open, setOpen] = React.useState<AuditRow | null>(null);
  const types = useQuery({ queryKey: ['audit-types'], queryFn: () => api<Array<{ entityType: string; count: number }>>('/admin/audit/entity-types') });
  const q = useQuery({ queryKey: ['admin-audit', list.params], queryFn: () => api<Paged<AuditRow>>('/admin/audit', { query: list.params }), placeholderData: keepPreviousData });

  const columns = React.useMemo<ColumnDef<AuditRow>[]>(
    () => [
      { id: 'at', header: 'When', cell: ({ row }) => <span className="num whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span> },
      { id: 'actor', header: 'Actor', cell: ({ row }) => <div><div className="truncate">{row.original.actorEmail ?? <span className="text-ink-3">System / public</span>}</div>{row.original.actorRole && <div className="text-[11px] text-muted-foreground">{titleCase(row.original.actorRole)}</div>}</div> },
      { id: 'action', header: 'Action', cell: ({ row }) => <span className="font-mono text-[11.5px] font-semibold">{row.original.action}</span> },
      { id: 'entity', header: 'Entity', cell: ({ row }) => <div>{row.original.entityType}{row.original.entityId && <div className="num max-w-[200px] truncate text-[11px] text-muted-foreground">{row.original.entityId}</div>}</div> },
    ],
    [],
  );

  return (
    <Panel>
      <PanelHeader title="Audit trail" description="Append-only record of business events, access denials and document access. Rows cannot be edited or deleted, even by administrators." />
      <FilterBar>
        <SearchInput value={list.state.q} onChange={list.setQ} placeholder="Search action, actor or entity id…" />
        <FilterSelect label="Entity" value={list.state.filters.entityType} onChange={(v) => list.setFilter('entityType', v)} options={(types.data ?? []).map((t) => ({ value: t.entityType, label: `${t.entityType} (${t.count})` }))} />
      </FilterBar>
      <DataTable
        columns={columns}
        data={q.data?.data}
        loading={q.isFetching}
        error={q.error ? (q.error as Error).message : null}
        meta={q.data?.meta}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onRowClick={setOpen}
        activeId={open?.id}
        dense
        emptyTitle="No audit events"
      />
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent eyebrow="Audit event" title={open?.action ?? ''} description={open && formatDateTime(open.createdAt)}>
          {open && (
            <>
              <DetailSection title="Who and what">
                <InfoList>
                  <InfoRow label="Actor">{open.actorEmail ?? 'System / public'}</InfoRow>
                  <InfoRow label="Role">{open.actorRole ? titleCase(open.actorRole) : '—'}</InfoRow>
                  <InfoRow label="Entity">{open.entityType}</InfoRow>
                  <InfoRow label="Entity id" mono>{open.entityId ?? '—'}</InfoRow>
                  <InfoRow label="IP address" mono>{open.ip ?? '—'}</InfoRow>
                </InfoList>
              </DetailSection>
              {([['Before', open.before], ['After', open.after], ['Metadata', open.metadata]] as const).map(([label, v]) =>
                v ? (
                  <DetailSection key={label} title={label}>
                    <pre className="nx-scroll max-h-[260px] overflow-auto rounded-md border border-border-soft bg-surface-2 p-3 font-mono text-[11px] leading-relaxed">{JSON.stringify(v, null, 2)}</pre>
                  </DetailSection>
                ) : null,
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </Panel>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Administration" title="Settings" description="System configuration overview and the immutable audit trail." />
      <Tabs defaultValue="system">
        <TabsList className="mb-4">
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="audit">Audit trail</TabsTrigger>
        </TabsList>
        <TabsContent value="system"><SystemTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </>
  );
}
