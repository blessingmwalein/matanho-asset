'use client';

import * as React from 'react';
import { Download, ExternalLink, File as FileIcon, FileImage, FileSpreadsheet, FileText, Printer, UploadCloud, X } from 'lucide-react';
import { formatBytes, formatDateTime, UPLOAD_LIMITS } from '@nexus/shared';
import { cn } from '@/lib/utils';
import { documentUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';

/* ── Activity timeline ──────────────────────────────────────────────────────── */
export interface TimelineItem {
  id: string;
  title: React.ReactNode;
  body?: React.ReactNode;
  at?: string | Date | null;
  actor?: string | null;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}

const DOT = { neutral: 'bg-ink-3', info: 'bg-info', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' } as const;

export function ActivityTimeline({ items, empty = 'No activity recorded yet.' }: { items: TimelineItem[] | undefined; empty?: string }) {
  if (!items) return <Skeleton className="h-20 w-full" />;
  if (!items.length) return <p className="py-4 text-[12px] text-muted-foreground">{empty}</p>;
  return (
    <ol className="relative">
      {items.map((it, i) => (
        <li key={it.id} className="relative grid grid-cols-[14px_1fr] gap-3 pb-4 last:pb-0">
          {i < items.length - 1 && <span className="absolute left-[6px] top-3.5 h-full w-px bg-border" aria-hidden />}
          <span className={cn('relative z-[1] mt-1.5 size-[9px] justify-self-center rounded-full ring-4 ring-surface', DOT[it.tone ?? 'neutral'])} />
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium leading-snug">{it.title}</div>
            {it.body && <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{it.body}</div>}
            {(it.at || it.actor) && (
              <div className="num mt-0.5 text-[11px] text-ink-3">
                {it.actor && <span>{it.actor}</span>}
                {it.actor && it.at && <span> · </span>}
                {it.at && <span>{formatDateTime(it.at as string)}</span>}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── Detail section inside drawers ──────────────────────────────────────────── */
export function DetailSection({ title, description, actions, children, className }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('border-b border-border-soft px-5 py-4 last:border-b-0', className)}>
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[12.5px] font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/* ── File helpers ───────────────────────────────────────────────────────────── */
export function fileIconFor(mime?: string | null, name?: string) {
  const m = mime ?? '';
  const ext = name?.split('.').pop()?.toLowerCase();
  if (m.startsWith('image/')) return FileImage;
  if (m.includes('sheet') || m.includes('excel') || m === 'text/csv' || ext === 'csv' || ext === 'xlsx') return FileSpreadsheet;
  if (m === 'application/pdf' || m === 'text/html' || ext === 'pdf') return FileText;
  return FileIcon;
}

/* ── File dropzone (generic; RHF wrapper lives in components/form) ──────────── */
export function FileDropzone({
  onFiles,
  multiple,
  accept = UPLOAD_LIMITS.accept,
  disabled,
  loading,
  title = 'Drop a file here, or browse',
  hint = 'PDF, image, CSV or Excel · up to 15 MB',
  compact,
  className,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
  hint?: string;
  compact?: boolean;
  className?: string;
}) {
  const [over, setOver] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);

  const take = (list: FileList | null) => {
    if (!list || !list.length) return;
    const files = Array.from(list).filter((f) => f.size <= UPLOAD_LIMITS.maxBytes);
    onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !disabled && (e.preventDefault(), input.current?.click())}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) take(e.dataTransfer.files);
      }}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[#c4c0b4] bg-surface-2 text-left outline-none transition-colors hover:border-primary hover:bg-primary-soft/50 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/12',
        over && 'border-primary bg-primary-soft',
        compact ? 'px-3 py-2.5' : 'flex-col justify-center px-4 py-6 text-center',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input ref={input} type="file" hidden multiple={multiple} accept={accept} disabled={disabled} onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      <UploadCloud className={cn('shrink-0 text-ink-3', compact ? 'size-4' : 'size-6', loading && 'animate-pulse text-primary')} />
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold">{loading ? 'Uploading…' : title}</div>
        {!compact && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

/** A file row with name, size and optional remove. */
export function FileChip({ name, size, mime, onRemove, href, className }: { name: string; size?: number; mime?: string; onRemove?: () => void; href?: string; className?: string }) {
  const Icon = fileIconFor(mime, name);
  return (
    <div className={cn('flex items-center gap-2.5 rounded-md border border-border bg-surface px-2.5 py-2 text-[12px]', className)}>
      <Icon className="size-4 shrink-0 text-ink-3" />
      <div className="min-w-0 flex-1">
        {href ? (
          <a href={href} className="block truncate font-medium hover:text-primary hover:underline" target="_blank" rel="noreferrer">
            {name}
          </a>
        ) : (
          <div className="truncate font-medium">{name}</div>
        )}
        {size !== undefined && <div className="num text-[10.5px] text-muted-foreground">{formatBytes(size)}</div>}
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="grid size-6 place-items-center rounded text-ink-3 hover:bg-surface-sunken hover:text-foreground">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/* ── Document preview panel ─────────────────────────────────────────────────── */
export interface PreviewDoc {
  id: string;
  title: string;
  mimeType?: string | null;
  fileName?: string | null;
  version?: number;
  /** Override the byte source (e.g. the public applicant endpoint). Defaults to the authenticated /documents/:id/content. */
  inlineUrl?: string;
  downloadUrl?: string;
}

/**
 * Previews the ORIGINAL stored bytes (never a generated placeholder): PDFs and statements in an
 * embedded viewer, images inline. Other types fall back to download. Access is enforced by the API.
 */
export function DocumentPreviewPanel({ doc, className, height = 520, toolbar = true }: { doc: PreviewDoc | null; className?: string; height?: number; toolbar?: boolean }) {
  if (!doc) return null;
  const mime = doc.mimeType ?? '';
  const inline = doc.inlineUrl ?? documentUrl(doc.id, { version: doc.version, inline: true });
  const download = doc.downloadUrl ?? documentUrl(doc.id, { version: doc.version });
  const previewable = mime === 'application/pdf' || mime === 'text/html' || mime.startsWith('image/') || mime.startsWith('text/plain');

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-surface-sunken', className)}>
      {toolbar && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold">{doc.title}</div>
            <div className="truncate text-[10.5px] text-muted-foreground">{doc.fileName}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {previewable && (
              <Button asChild variant="secondary" size="sm">
                <a href={inline} target="_blank" rel="noreferrer">
                  <ExternalLink /> Open
                </a>
              </Button>
            )}
            {mime === 'text/html' && (
              <Button variant="secondary" size="sm" onClick={() => { const w = window.open(inline, '_blank'); w?.addEventListener('load', () => w.print()); }}>
                <Printer /> Print
              </Button>
            )}
            <Button asChild variant="primary" size="sm">
              <a href={download}>
                <Download /> Download
              </a>
            </Button>
          </div>
        </div>
      )}
      {previewable ? (
        mime.startsWith('image/') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={inline} alt={doc.title} className="mx-auto block max-h-full max-w-full object-contain" style={{ maxHeight: height }} />
        ) : (
          <iframe src={inline} title={doc.title} className="block w-full bg-white" style={{ height }} sandbox={mime === 'text/html' ? '' : undefined} />
        )
      ) : (
        <div className="grid place-items-center px-6 py-12 text-center text-[12px] text-muted-foreground">
          <FileIcon className="mb-2 size-7 text-ink-3" />
          Preview is not available for this file type. Download the original to open it.
        </div>
      )}
    </div>
  );
}

/* ── Review & approval panel (sticky action area for staff decisions) ───────── */
export function ReviewPanel({ title = 'Decision', description, children, className }: { title?: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-surface-2 p-4', className)}>
      <div className="mb-3">
        <h3 className="text-[12.5px] font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Small stat used in drawers (3-up KPI row). */
export function DetailKpis({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <div className="grid overflow-hidden rounded-lg border border-border" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((i, idx) => (
        <div key={i.label} className={cn('min-w-0 px-3 py-2.5', idx > 0 && 'border-l border-border')}>
          <div className="eyebrow">{i.label}</div>
          <div className="num mt-1 truncate text-[14.5px] font-semibold tracking-tight">{i.value}</div>
        </div>
      ))}
    </div>
  );
}
