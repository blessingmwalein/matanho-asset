'use client';

import { useQuery } from '@tanstack/react-query';
import { formatBytes, formatDate } from '@nexus/shared';
import { api } from '@/lib/api';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/controls';
import { DocumentPreviewPanel } from '@/components/nx/blocks';
import { ErrorState } from '@/components/nx/layout';

interface DocDetail {
  id: string;
  ref: string;
  title: string;
  reportDate: string | null;
  publishedAt: string | null;
  currentVersionNo: number;
  versions: Array<{ versionNo: number; fileName: string; mimeType: string; sizeBytes: number }>;
  portfolio?: { name: string } | null;
}

/**
 * Paper-style viewer: previews the REAL stored file (PDF, frozen HTML statement, image) from the
 * authenticated /documents/:id/content endpoint. The API only serves an investor their own PUBLISHED documents.
 */
export function DocumentViewerDialog({ docId, onClose, fallbackTitle }: { docId: string | null; onClose: () => void; fallbackTitle?: string }) {
  const q = useQuery({
    queryKey: ['portal', 'doc', docId],
    enabled: !!docId,
    queryFn: () => api<DocDetail>(`/documents/${docId}`),
    retry: false,
  });
  const doc = q.data;
  const version = doc?.versions.find((v) => v.versionNo === doc.currentVersionNo) ?? doc?.versions[0];

  return (
    <Dialog open={!!docId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={doc?.title ?? fallbackTitle ?? 'Document'}
        description={doc ? [doc.ref, doc.reportDate ? formatDate(doc.reportDate) : doc.publishedAt ? formatDate(doc.publishedAt) : null, version ? formatBytes(version.sizeBytes) : null].filter(Boolean).join(' · ') : 'Authenticated investor copy'}
        size="xl"
      >
        {q.isLoading && <Skeleton className="h-[480px] w-full" />}
        {q.isError && <ErrorState message="This document is not available to you, or it was withdrawn." />}
        {doc && version && (
          <DocumentPreviewPanel
            height={580}
            doc={{ id: doc.id, title: doc.title, mimeType: version.mimeType, fileName: version.fileName, version: version.versionNo }}
          />
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          This is an authenticated investor copy. Amounts may be shown in another currency for convenience elsewhere in the portal; the governing legal record is the signed source document in its original currency.
        </p>
      </DialogContent>
    </Dialog>
  );
}
