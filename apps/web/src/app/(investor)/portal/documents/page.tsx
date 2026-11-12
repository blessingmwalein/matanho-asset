'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, FileText } from 'lucide-react';
import { formatBytes, formatDate } from '@nexus/shared';
import { documentUrl } from '@/lib/api';
import { EmptyState, ErrorState, PageHeader, Panel, PanelSkeleton } from '@/components/nx/layout';
import { FilterSelect, SearchInput } from '@/components/nx/filters';
import { DocumentViewerDialog } from '@/components/features/portal/document-viewer';
import { usePortalDocuments } from '@/components/features/portal/hooks';

const TYPES = ['Statement', 'Capital', 'Report', 'Financials', 'Notice'].map((v) => ({ value: v, label: v }));

function DocumentsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const deepLink = params.get('doc');
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [type, setType] = React.useState<string | undefined>(undefined);
  const [open, setOpen] = React.useState<string | null>(deepLink);

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 280);
    return () => window.clearTimeout(t);
  }, [search]);

  // ?doc=<id> deep link (notifications link here)
  React.useEffect(() => {
    if (deepLink) setOpen(deepLink);
  }, [deepLink]);

  const q = usePortalDocuments(debounced, type);
  const docs = q.data;

  const close = () => {
    setOpen(null);
    if (deepLink) router.replace('/portal/documents', { scroll: false });
  };

  return (
    <div>
      <PageHeader eyebrow="Investor records" title="Documents" description="Statements, notices, quarterly reports and audited fund records. Each is an authenticated portal copy of the stored original." />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search documents" className="sm:max-w-[360px]" />
        <FilterSelect label="Type" value={type} onChange={setType} options={TYPES} />
        {docs && <span className="num ml-auto text-[11.5px] text-muted-foreground">{docs.length} document{docs.length === 1 ? '' : 's'}</span>}
      </div>

      <Panel>
        {q.isError ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />
        ) : !docs ? (
          <PanelSkeleton rows={6} />
        ) : docs.length === 0 ? (
          <EmptyState title="No documents match" description={debounced || type ? 'Try a different search or clear the type filter.' : 'Published statements, notices and reports appear here.'} icon={<FileText />} />
        ) : (
          <ul>
            {docs.map((d) => (
              <li key={d.id} className="border-b border-border-soft last:border-b-0">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-surface-2 md:grid-cols-[minmax(0,1.7fr)_0.7fr_0.7fr_0.5fr_auto]">
                  <button type="button" onClick={() => setOpen(d.id)} className="col-span-1 flex min-w-0 items-center gap-3 text-left md:col-span-4 md:grid md:grid-cols-[minmax(0,1.7fr)_0.7fr_0.7fr_0.5fr] md:gap-3">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-sunken text-ink-3">
                        <FileText className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-semibold">{d.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {d.scope}
                          <span className="md:hidden"> · {d.type} · {formatDate(d.date)}</span>
                        </span>
                      </span>
                    </span>
                    <span className="hidden text-[12px] text-muted-foreground md:block">{d.type}</span>
                    <span className="num hidden text-[12px] text-muted-foreground md:block">{formatDate(d.date)}</span>
                    <span className="num hidden text-[12px] text-muted-foreground md:block">{formatBytes(d.sizeBytes)}</span>
                  </button>
                  <a
                    href={documentUrl(d.id)}
                    aria-label={`Download ${d.title}`}
                    title="Download copy"
                    className="grid size-8 place-items-center rounded-md text-ink-3 hover:bg-surface-sunken hover:text-foreground"
                  >
                    <Download className="size-4" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <DocumentViewerDialog docId={open} onClose={close} />
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<PanelSkeleton rows={6} />}>
      <DocumentsInner />
    </Suspense>
  );
}
