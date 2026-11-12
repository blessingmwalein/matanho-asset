'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { FormProvider, useForm } from 'react-hook-form';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS, DOCUMENT_STATUSES, P, formatDate, titleCase, type DocumentCategory } from '@nexus/shared';
import { api, type Paged } from '@/lib/api';
import { useCan } from '@/lib/session';
import { useListState } from '@/lib/use-list-state';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { DataTable } from '@/components/nx/data-table';
import { FilterBar, FilterSelect, SearchInput } from '@/components/nx/filters';
import { PageHeader, Panel } from '@/components/nx/layout';
import { DocumentStatus } from '@/components/nx/status';
import { FileField, SearchableSelectField, SelectField, TextField } from '@/components/form/fields';
import { DocumentSheet, type DocRow } from '@/components/features/documents/document-sheet';

interface Options {
  investors: Array<{ id: string; ref: string; name: string }>;
  portfolios: Array<{ id: string; ref: string; name: string; investorId: string; investorName: string }>;
}

interface UploadForm {
  title: string;
  category: DocumentCategory;
  investorId?: string;
  file?: File;
}

function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ['report-options'], queryFn: () => api<Options>('/reports/options'), enabled: open });
  const form = useForm<UploadForm>({ defaultValues: { title: '', category: 'ADDITIONAL', investorId: '' } });
  const upload = useMutation({
    mutationFn: async (v: UploadForm) => {
      const fd = new FormData();
      fd.append('file', v.file as File);
      fd.append('title', v.title);
      fd.append('category', v.category);
      if (v.investorId) fd.append('investorId', v.investorId);
      return api('/documents', { method: 'POST', form: fd });
    },
    onSuccess: () => {
      toast.success('Document uploaded');
      void qc.invalidateQueries({ queryKey: ['documents'] });
      form.reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const submit = form.handleSubmit((v) => {
    let bad = false;
    if (v.title.trim().length < 2) { form.setError('title', { message: 'Title is required' }); bad = true; }
    if (!v.file) { form.setError('file', { message: 'Choose a file to upload' }); bad = true; }
    if (!bad) upload.mutate(v);
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Upload document" description="The original file is stored securely with its SHA-256 fingerprint." size="md">
        <FormProvider {...form}>
          <form onSubmit={submit} className="grid gap-3.5">
            <TextField<UploadForm> name="title" label="Title" required />
            <SelectField<UploadForm> name="category" label="Category" required options={DOCUMENT_CATEGORIES.map((c) => ({ value: c, label: DOCUMENT_CATEGORY_LABELS[c] }))} />
            <SearchableSelectField<UploadForm> name="investorId" label="Related investor" optional placeholder="Select investor" options={(options.data?.investors ?? []).map((i) => ({ value: i.id, label: i.name, hint: i.ref }))} loading={options.isLoading} />
            <FileField<UploadForm> name="file" label="File" required />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={upload.isPending}>Upload</Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export default function DocumentRegisterPage() {
  // useSearchParams (deep link ?doc=) requires a Suspense boundary for static prerendering
  return (
    <React.Suspense fallback={null}>
      <DocumentRegister />
    </React.Suspense>
  );
}

function DocumentRegister() {
  const can = useCan();
  const params = useSearchParams();
  const list = useListState({ sort: 'createdAt', order: 'desc' });
  const [openId, setOpenId] = React.useState<string | null>(params.get('doc'));
  const [uploadOpen, setUploadOpen] = React.useState(false);

  const q = useQuery({
    queryKey: ['documents', list.params],
    queryFn: () => api<Paged<DocRow>>('/documents', { query: list.params }),
    placeholderData: keepPreviousData,
  });

  const columns = React.useMemo<ColumnDef<DocRow>[]>(
    () => [
      { id: 'title', header: 'Document', meta: { sortKey: 'title' }, cell: ({ row: { original: d } }) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{d.title}</div>
          <div className="num truncate text-[11px] text-muted-foreground">{d.ref} · {d.versions[0]?.fileName}</div>
        </div>
      ) },
      { id: 'category', header: 'Category', meta: { sortKey: 'category' }, cell: ({ row }) => DOCUMENT_CATEGORY_LABELS[row.original.category] },
      { id: 'related', header: 'Related to', cell: ({ row: { original: d } }) => d.investor?.legalName ?? d.company?.name ?? d.portfolio?.name ?? <span className="text-ink-3">—</span> },
      { id: 'status', header: 'Status', meta: { sortKey: 'status' }, cell: ({ row }) => <DocumentStatus status={row.original.status} /> },
      { id: 'audience', header: 'Audience', cell: ({ row }) => titleCase(row.original.audience) },
      { id: 'version', header: 'Ver.', meta: { align: 'right' }, cell: ({ row }) => `v${row.original.currentVersionNo}` },
      { id: 'createdAt', header: 'Uploaded', meta: { sortKey: 'createdAt' }, cell: ({ row }) => <span className="num">{formatDate(row.original.createdAt)}</span> },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        eyebrow="Documents"
        title="Document Register"
        description="Every stored document across investors, custodians and portfolio companies. Originals are retained, versioned and fingerprinted; downloads are access-controlled and audited."
        actions={can(P.DOCUMENTS_MANAGE) ? <Button variant="primary" onClick={() => setUploadOpen(true)}><Upload /> Upload document</Button> : null}
      />
      <Panel>
        <FilterBar>
          <SearchInput value={list.state.q} onChange={list.setQ} placeholder="Search title, reference, investor…" />
          <FilterSelect label="Category" value={list.state.filters.category} onChange={(v) => list.setFilter('category', v)} options={DOCUMENT_CATEGORIES.map((c) => ({ value: c, label: DOCUMENT_CATEGORY_LABELS[c] }))} />
          <FilterSelect label="Status" value={list.state.filters.status} onChange={(v) => list.setFilter('status', v)} options={DOCUMENT_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
        </FilterBar>
        <DataTable
          columns={columns}
          data={q.data?.data}
          loading={q.isFetching}
          error={q.error ? (q.error as Error).message : null}
          onRetry={() => void q.refetch()}
          meta={q.data?.meta}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
          sort={list.state.sort}
          order={list.state.order}
          onSort={list.onSort}
          onRowClick={(d) => setOpenId(d.id)}
          activeId={openId ?? undefined}
          emptyTitle="No documents found"
          emptyDescription="Adjust the search or filters, or upload a document."
        />
      </Panel>
      <DocumentSheet docId={openId} onClose={() => setOpenId(null)} />
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </>
  );
}
