'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Download, Send } from 'lucide-react';
import { toast } from 'sonner';
import { DOCUMENT_CATEGORY_LABELS, P, formatBytes, formatDateTime, type DocumentCategory } from '@nexus/shared';
import { api, documentUrl } from '@/lib/api';
import { useCan, useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/input';
import { ActivityTimeline, DetailSection, DocumentPreviewPanel, FileChip, FileDropzone, ReviewPanel } from '@/components/nx/blocks';
import { InfoList, InfoRow, PanelSkeleton } from '@/components/nx/layout';
import { DocumentStatus } from '@/components/nx/status';

export interface DocVersion {
  id: string;
  versionNo: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  note: string | null;
  uploadedByName: string | null;
  createdAt: string;
}
export interface DocRow {
  id: string;
  ref: string;
  title: string;
  category: DocumentCategory;
  status: 'DRAFT' | 'UPLOADED' | 'UNDER_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';
  audience: string;
  currentVersionNo: number;
  createdById: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  reportDate: string | null;
  versions: DocVersion[];
  investor?: { id: string; ref: string; legalName: string } | null;
  portfolio?: { id: string; ref: string; name: string } | null;
  company?: { id: string; name: string } | null;
}

/** Document detail drawer: real preview, version history (DOC-002), maker–checker approve/publish (RPT-004). */
export function DocumentSheet({ docId, onClose }: { docId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const can = useCan();
  const { data: me } = useSession();
  const [versionNo, setVersionNo] = React.useState<number | undefined>();
  const [note, setNote] = React.useState('');
  const [confirm, setConfirm] = React.useState<'approve' | 'publish' | null>(null);

  const q = useQuery({ queryKey: ['document', docId], queryFn: () => api<DocRow>(`/documents/${docId}`), enabled: !!docId });
  React.useEffect(() => setVersionNo(undefined), [docId]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['document', docId] });
    void qc.invalidateQueries({ queryKey: ['documents'] });
    void qc.invalidateQueries({ queryKey: ['statements'] });
  };
  const approve = useMutation({
    mutationFn: () => api(`/documents/${docId}/approve`, { method: 'POST', body: {} }),
    onSuccess: () => { toast.success('Document approved', { description: 'It can now be published to the investor.' }); setConfirm(null); refresh(); },
    onError: (e) => { toast.error((e as Error).message); setConfirm(null); },
  });
  const publish = useMutation({
    mutationFn: () => api(`/documents/${docId}/publish`, { method: 'POST', body: {} }),
    onSuccess: () => { toast.success('Published to investor portal', { description: 'The investor has been notified.' }); setConfirm(null); refresh(); },
    onError: (e) => { toast.error((e as Error).message); setConfirm(null); },
  });
  const replace = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      if (note) form.append('note', note);
      return api(`/documents/${docId}/versions`, { method: 'POST', form });
    },
    onSuccess: () => { toast.success('New version saved', { description: 'Earlier versions are preserved.' }); setNote(''); setVersionNo(undefined); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const d = q.data;
  const isMaker = !!d && !!me && d.createdById === me.id;
  const current = d?.versions.find((v) => v.versionNo === (versionNo ?? d.currentVersionNo)) ?? d?.versions[0];
  const canReplace = !!d && can(P.DOCUMENTS_MANAGE) && d.status !== 'PUBLISHED';

  return (
    <>
      <Sheet open={!!docId} onOpenChange={(o) => !o && onClose()}>
        <SheetContent eyebrow={d ? `${d.ref} · ${DOCUMENT_CATEGORY_LABELS[d.category]}` : 'Document'} title={d?.title ?? 'Loading…'} description={d && <DocumentStatus status={d.status} />} width="xl">
          {!d ? (
            <PanelSkeleton rows={6} />
          ) : (
            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="border-b border-border-soft p-5 lg:border-b-0 lg:border-r">
                {current && <DocumentPreviewPanel doc={{ id: d.id, title: d.title, mimeType: current.mimeType, fileName: current.fileName, version: current.versionNo }} height={560} />}
              </div>
              <div>
                {(d.status === 'DRAFT' || d.status === 'APPROVED') && d.investor && (can(P.REPORTS_APPROVE) || can(P.REPORTS_PUBLISH)) && (
                  <div className="border-b border-border-soft p-5">
                    <ReviewPanel title="Publication workflow" description={d.status === 'DRAFT' ? (isMaker ? 'You generated this document, so an independent approver must approve it.' : 'Approve the exact version shown, then publish it to the investor.') : 'Approved. Publishing makes it visible to the investor and notifies them.'}>
                      {d.status === 'DRAFT' && can(P.REPORTS_APPROVE) && (
                        <Button variant="primary" size="sm" disabled={isMaker} onClick={() => setConfirm('approve')}>
                          <CheckCheck /> Approve
                        </Button>
                      )}
                      {d.status === 'APPROVED' && can(P.REPORTS_PUBLISH) && (
                        <Button variant="primary" size="sm" onClick={() => setConfirm('publish')}>
                          <Send /> Publish to investor
                        </Button>
                      )}
                    </ReviewPanel>
                  </div>
                )}
                <DetailSection title="Details">
                  <InfoList>
                    <InfoRow label="Reference" mono>{d.ref}</InfoRow>
                    <InfoRow label="Category">{DOCUMENT_CATEGORY_LABELS[d.category]}</InfoRow>
                    <InfoRow label="Audience">{d.audience.charAt(0) + d.audience.slice(1).toLowerCase()}</InfoRow>
                    {d.investor && <InfoRow label="Investor">{d.investor.legalName}</InfoRow>}
                    {d.portfolio && <InfoRow label="Portfolio">{d.portfolio.name}</InfoRow>}
                    {d.company && <InfoRow label="Company">{d.company.name}</InfoRow>}
                    <InfoRow label="Created">{formatDateTime(d.createdAt)}</InfoRow>
                    {d.approvedAt && <InfoRow label="Approved">{formatDateTime(d.approvedAt)}</InfoRow>}
                    {d.publishedAt && <InfoRow label="Published">{formatDateTime(d.publishedAt)}</InfoRow>}
                  </InfoList>
                </DetailSection>
                <DetailSection title="Versions" description="Every version is retained with its SHA-256 fingerprint.">
                  <ActivityTimeline
                    items={d.versions.map((v) => ({
                      id: v.id,
                      title: (
                        <button className="text-left font-semibold hover:text-primary" onClick={() => setVersionNo(v.versionNo)}>
                          v{v.versionNo} · {v.fileName} {v.versionNo === d.currentVersionNo && <span className="ml-1 text-[10px] font-bold uppercase text-success">current</span>}
                        </button>
                      ),
                      body: (
                        <>
                          <span className="num">{formatBytes(v.sizeBytes)}</span> · <span className="num font-mono text-[10.5px]">{v.sha256.slice(0, 16)}…</span>
                          {v.note ? <span className="block">{v.note}</span> : null}
                          <a className="mt-0.5 inline-flex items-center gap-1 font-semibold text-primary hover:underline" href={documentUrl(d.id, { version: v.versionNo })}>
                            <Download className="size-3" /> Download
                          </a>
                        </>
                      ),
                      at: v.createdAt,
                      actor: v.uploadedByName,
                      tone: v.versionNo === d.currentVersionNo ? 'success' : 'neutral',
                    }))}
                  />
                </DetailSection>
                {canReplace && (
                  <DetailSection title="Upload a new version" description="The previous version stays available in the history.">
                    <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for replacement (optional)" className="mb-2" />
                    <FileDropzone compact loading={replace.isPending} onFiles={(f) => f[0] && replace.mutate(f[0])} title="Choose replacement file" />
                    {replace.isPending && <FileChip name="Uploading…" className="mt-2" />}
                  </DetailSection>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <ConfirmDialog open={confirm === 'approve'} onOpenChange={(o) => !o && setConfirm(null)} title="Approve this document?" description="You are approving the exact version shown. Approval is recorded against your identity and is required before publication." confirmLabel="Approve" loading={approve.isPending} onConfirm={() => approve.mutate()} />
      <ConfirmDialog open={confirm === 'publish'} onOpenChange={(o) => !o && setConfirm(null)} title="Publish to the investor portal?" description={`The investor (${d?.investor?.legalName ?? ''}) will be able to open and download this document and will be notified.`} confirmLabel="Publish" loading={publish.isPending} onConfirm={() => publish.mutate()} />
    </>
  );
}
