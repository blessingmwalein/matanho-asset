'use client';

import * as React from 'react';
import { useWatch } from 'react-hook-form';
import { ChevronDown, Download, Eye } from 'lucide-react';
import { daysUntil, formatBytes, formatDateTime, type PackColumn, type PackField, type PackFile, type PackRepeater, type PackSection } from '@nexus/shared';
import { documentUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CurrencyField, DateField, FormSection, FullWidth, NumberField, PercentField, RepeaterField, SelectField, TextareaField, TextField } from '@/components/form/fields';
import { FileDropzone, fileIconFor } from '@/components/nx/blocks';
import { Panel } from '@/components/nx/layout';
import { StatusIndicator } from '@/components/nx/status';
import { emptyRow, type FileDoc, type FV, type Task } from './types';

const YEAR = new Date().getFullYear();

/* ── scalar fields ─────────────────────────────────────────────────────────── */
function PackFieldControl({ f, currency }: { f: PackField; currency: string }) {
  const common = { name: f.key, label: f.label, required: f.required, optional: !f.required, help: f.help } as const;
  switch (f.type) {
    case 'money':
      return <CurrencyField<FV> {...common} currency={currency} decimals={2} placeholder="0.00" />;
    case 'number':
      return <NumberField<FV> {...common} decimals={0} placeholder="0" />;
    case 'percent':
      return <PercentField<FV> {...common} decimals={2} placeholder="0.00" />;
    case 'date':
      return <DateField<FV> {...common} fromYear={YEAR - 2} toYear={YEAR + 15} />;
    case 'textarea':
      return <TextareaField<FV> {...common} rows={3} />;
    default:
      return <TextField<FV> {...common} autoComplete="off" />;
  }
}

/* ── repeater cells ────────────────────────────────────────────────────────── */
function MoneyCell({ base, c }: { base: string; c: PackColumn }) {
  const cur = useWatch({ name: `${base}.currency` }) as string | undefined;
  return <CurrencyField<FV> name={`${base}.${c.key}`} label={c.label} required={c.required} currency={cur ?? 'USD'} decimals={2} placeholder="0.00" />;
}

function Cell({ base, c }: { base: string; c: PackColumn }) {
  const name = `${base}.${c.key}`;
  switch (c.type) {
    case 'money':
      return <MoneyCell base={base} c={c} />;
    case 'number':
      return <NumberField<FV> name={name} label={c.label} required={c.required} decimals={0} />;
    case 'date':
      return <DateField<FV> name={name} label={c.label} required={c.required} fromYear={YEAR - 2} toYear={YEAR + 15} />;
    case 'select':
      return <SelectField<FV> name={name} label={c.label} required={c.required} options={c.options ?? []} />;
    default:
      return <TextField<FV> name={name} label={c.label} required={c.required} autoComplete="off" />;
  }
}

/** Certificates expiring within 60 days are flagged; past expiry is shown as expired. */
function ExpiryFlag({ base }: { base: string }) {
  const v = useWatch({ name: `${base}.expiry_date` }) as string | undefined;
  if (!v) return <div className="hidden lg:block" />;
  const days = daysUntil(v);
  if (days === null) return <div />;
  return (
    <div className="self-end pb-2">
      {days < 0 ? (
        <StatusIndicator tone="danger">Expired {Math.abs(days)} day{Math.abs(days) === 1 ? '' : 's'} ago</StatusIndicator>
      ) : days <= 60 ? (
        <StatusIndicator tone="warning">Expires in {days} day{days === 1 ? '' : 's'}</StatusIndicator>
      ) : (
        <StatusIndicator tone="success">Current</StatusIndicator>
      )}
    </div>
  );
}

function PackRepeaterControl({ r }: { r: PackRepeater }) {
  return (
    <RepeaterField<FV>
      name={r.key}
      label={r.label}
      help={r.help}
      addLabel={`Add ${r.label.toLowerCase().replace(/s$/, '')}`}
      emptyRow={emptyRow(r)}
      min={r.minRows}
      renderRow={(base) => (
        <>
          {r.columns.map((c) => (
            <Cell key={c.key} base={base} c={c} />
          ))}
          {r.key === 'certificates' && <ExpiryFlag base={base} />}
        </>
      )}
    />
  );
}

/* ── file slots ────────────────────────────────────────────────────────────── */
export interface PreviewTarget {
  id: string;
  title: string;
  mimeType: string | null;
  fileName: string | null;
  version: number;
}

export function FileSlot({
  slot,
  docs,
  editable,
  uploading,
  onUpload,
  onPreview,
}: {
  slot: PackFile;
  docs: FileDoc[];
  editable: boolean;
  uploading: boolean;
  onUpload: (key: string, file: File) => void;
  onPreview: (p: PreviewTarget) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[12.5px] font-semibold">
          {slot.label}
          {slot.required && <span className="ml-0.5 text-danger">*</span>}
        </div>
        {slot.help && <div className="text-[11px] text-muted-foreground">{slot.help}</div>}
      </div>
      {docs.length > 0 && (
        <ul className="mb-2.5 grid gap-1.5">
          {docs.map((d) => {
            const Icon = fileIconFor(d.mimeType, d.fileName ?? undefined);
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-2.5 rounded-md border border-border bg-surface px-2.5 py-2 text-[12px]">
                <Icon className="size-4 shrink-0 text-ink-3" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{d.fileName}</div>
                  <div className="num text-[10.5px] text-muted-foreground">
                    Version {d.versionNo}
                    {d.versions.length > 1 ? ` of ${d.versions.length}` : ''} · {formatBytes(d.sizeBytes)} · {formatDateTime(d.uploadedAt)}
                    {d.uploadedByName ? ` · ${d.uploadedByName}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button type="button" size="sm" variant="secondary" onClick={() => onPreview({ id: d.id, title: d.title, mimeType: d.mimeType, fileName: d.fileName, version: d.versionNo })}>
                    <Eye /> Preview
                  </Button>
                  <Button asChild size="sm" variant="tertiary">
                    <a href={documentUrl(d.id, { version: d.versionNo })} aria-label={`Download ${d.fileName}`}>
                      <Download /> Download
                    </a>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editable ? (
        <FileDropzone compact loading={uploading} onFiles={(f) => f[0] && onUpload(slot.key, f[0])} title={docs.length ? 'Upload a new version' : 'Upload file'} />
      ) : (
        docs.length === 0 && <p className="text-[11.5px] text-muted-foreground">No file uploaded.</p>
      )}
    </div>
  );
}

/* ── sections ──────────────────────────────────────────────────────────────── */
function groupFields(fields: PackField[]): Array<{ group: string | null; fields: PackField[] }> {
  const out: Array<{ group: string | null; fields: PackField[] }> = [];
  for (const f of fields) {
    const g = f.group ?? null;
    const last = out[out.length - 1];
    if (last && last.group === g) last.fields.push(f);
    else out.push({ group: g, fields: [f] });
  }
  return out;
}

export function PackSectionPanel({
  section,
  task,
  open,
  onToggle,
  editable,
  currency,
  files,
  uploadingKey,
  onUpload,
  onPreview,
}: {
  section: PackSection;
  task: Task;
  open: boolean;
  onToggle: () => void;
  editable: boolean;
  currency: string;
  files: Record<string, FileDoc[]>;
  uploadingKey: string | null;
  onUpload: (key: string, file: File) => void;
  onPreview: (p: PreviewTarget) => void;
}) {
  const tone = task.status === 'COMPLETE' ? 'success' : task.status === 'EXPIRED' ? 'danger' : task.status === 'IN_PROGRESS' ? 'info' : 'warning';
  return (
    <Panel id={`section-${section.key}`} className="scroll-mt-24">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-surface-2">
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold tracking-tight">{section.title}</h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{section.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <StatusIndicator tone={tone}>{task.label}</StatusIndicator>
          <ChevronDown className={cn('size-4 text-ink-3 transition-transform', open && 'rotate-180')} />
        </div>
      </button>
      {open && (
        <div className="border-t border-border-soft px-4 py-4">
          <fieldset disabled={!editable} className="m-0 min-w-0 border-0 p-0">
            {groupFields(section.fields).map((g, i) => (
              <FormSection key={g.group ?? `g${i}`} title={g.group ?? undefined} columns={g.fields.some((f) => f.type === 'textarea') ? 1 : 3}>
                {g.fields.map((f) =>
                  f.type === 'textarea' ? (
                    <FullWidth key={f.key}>
                      <PackFieldControl f={f} currency={currency} />
                    </FullWidth>
                  ) : (
                    <PackFieldControl key={f.key} f={f} currency={currency} />
                  ),
                )}
              </FormSection>
            ))}
            {section.repeaters.map((r) => (
              <div key={r.key} className="mb-5 last:mb-0">
                <PackRepeaterControl r={r} />
              </div>
            ))}
          </fieldset>
          {section.files.length > 0 && (
            <div className={cn('grid gap-3', (section.fields.length > 0 || section.repeaters.length > 0) && 'mt-5 border-t border-border-soft pt-4')}>
              <div>
                <h4 className="text-[12.5px] font-semibold">Supporting files</h4>
                <p className="text-[11.5px] text-muted-foreground">Re-uploading a file adds a new version; earlier versions are kept.</p>
              </div>
              {section.files.map((slot) => (
                <FileSlot key={slot.key} slot={slot} docs={files[slot.key] ?? []} editable={editable} uploading={uploadingKey === slot.key} onUpload={onUpload} onPreview={onPreview} />
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

