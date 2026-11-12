'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Eye, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { DOCUMENT_SLOTS, formatBytes, formatDateTime, UPLOAD_LIMITS, type DocumentSlot, type ReadinessResult } from '@nexus/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DocumentPreviewPanel, FileChip, FileDropzone } from '@/components/nx/blocks';
import { Tag } from '@/components/nx/status';
import { applicantDocUrl } from './pointer';
import type { DraftIdentity, SlotDocument } from './types';

export interface UploadResult {
  ok: boolean;
  slot: string;
  document: SlotDocument;
  readiness: ReadinessResult;
}

function SlotCard({
  slot,
  doc,
  busy,
  highlight,
  disabled,
  onFile,
  onPreview,
}: {
  slot: DocumentSlot;
  doc?: SlotDocument;
  busy: boolean;
  highlight: boolean;
  disabled?: boolean;
  onFile: (file: File) => void;
  onPreview: () => void;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col rounded-lg border bg-surface p-3', highlight && !doc && slot.required ? 'border-danger' : 'border-border')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold leading-snug">{slot.title}</div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{slot.help}</p>
        </div>
        {doc ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-success">
            <Check className="size-3.5" /> Uploaded
          </span>
        ) : slot.required ? (
          <Tag tone="warning" className="shrink-0">Required</Tag>
        ) : (
          <span className="shrink-0 text-[10.5px] text-ink-3">Optional</span>
        )}
      </div>

      <div className="mt-3 grid gap-2">
        {doc && (
          <>
            <FileChip name={doc.fileName} size={doc.sizeBytes} mime={doc.mimeType} />
            <div className="flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
              <span className="num">
                Version {doc.versionNo}
                {doc.versions.length > 1 ? ` of ${doc.versions.length}` : ''} · {formatDateTime(doc.uploadedAt)}
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={onPreview}>
                <Eye /> Preview
              </Button>
            </div>
          </>
        )}
        <FileDropzone
          compact
          loading={busy}
          disabled={disabled || busy}
          title={doc ? 'Replace file' : 'Upload file'}
          accept={UPLOAD_LIMITS.accept}
          onFiles={(files) => files[0] && onFile(files[0])}
        />
      </div>
    </div>
  );
}

/** Step 5: one card per evidence slot. Files upload straight to the API; the original stays the record. */
export function StepDocuments({
  identity,
  documents,
  disabled,
  onUploaded,
  registerValidator,
}: {
  identity: DraftIdentity;
  documents: Record<string, SlotDocument>;
  disabled?: boolean;
  onUploaded: (res: UploadResult) => void;
  registerValidator: (fn: () => Promise<boolean>) => void;
}) {
  const [busySlot, setBusySlot] = React.useState<string | null>(null);
  const [highlight, setHighlight] = React.useState(false);
  const [preview, setPreview] = React.useState<{ slot: DocumentSlot; doc: SlotDocument } | null>(null);

  const upload = useMutation({
    mutationFn: ({ slot, file }: { slot: DocumentSlot; file: File }) => {
      const form = new FormData();
      form.append('slot', slot.id);
      form.append('file', file);
      return api<UploadResult>(`/public/applications/${encodeURIComponent(identity.reference)}/documents`, { form, query: { token: identity.token } });
    },
    onMutate: ({ slot }) => setBusySlot(slot.id),
    onSuccess: (res, { slot }) => {
      onUploaded(res);
      toast.success(`${slot.title} uploaded`, { description: res.document.versionNo > 1 ? `Saved as version ${res.document.versionNo}; earlier versions are kept.` : undefined });
    },
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => setBusySlot(null),
  });

  const required = DOCUMENT_SLOTS.filter((s) => s.required);
  const missing = required.filter((s) => !documents[s.id]);

  const missingRef = React.useRef(missing.length);
  missingRef.current = missing.length;
  React.useEffect(() => {
    registerValidator(async () => {
      if (missingRef.current === 0) return true;
      setHighlight(true);
      toast.error(`${missingRef.current} required document${missingRef.current === 1 ? '' : 's'} still missing`);
      return false;
    });
  }, [registerValidator]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold">Supporting evidence</h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">Upload the original evidence. PDF, image, CSV, Excel or Word, up to {formatBytes(UPLOAD_LIMITS.maxBytes)} each. Replacing a file keeps the earlier version.</p>
        </div>
        <span className="num inline-flex items-center gap-1.5 text-[12px] font-semibold">
          <Paperclip className="size-3.5 text-ink-3" />
          {required.length - missing.length}/{required.length} required uploaded
        </span>
      </div>

      <div className="grid gap-2.5 md:grid-cols-2">
        {DOCUMENT_SLOTS.map((slot) => (
          <SlotCard
            key={slot.id}
            slot={slot}
            doc={documents[slot.id]}
            busy={busySlot === slot.id}
            highlight={highlight}
            disabled={disabled}
            onFile={(file) => upload.mutate({ slot, file })}
            onPreview={() => documents[slot.id] && setPreview({ slot, doc: documents[slot.id]! })}
          />
        ))}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent title={preview?.slot.title ?? 'Preview'} description="Your uploaded file, exactly as stored." size="xl">
          {preview && (
            <DocumentPreviewPanel
              height={560}
              doc={{
                id: preview.doc.documentId,
                title: preview.slot.title,
                mimeType: preview.doc.mimeType,
                fileName: preview.doc.fileName,
                version: preview.doc.versionNo,
                inlineUrl: applicantDocUrl(identity, preview.doc.documentId, { version: preview.doc.versionNo }),
                downloadUrl: applicantDocUrl(identity, preview.doc.documentId, { version: preview.doc.versionNo, download: true }),
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
