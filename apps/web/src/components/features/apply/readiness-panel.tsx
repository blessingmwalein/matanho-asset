'use client';

import { Check, Minus, TriangleAlert, X } from 'lucide-react';
import { deriveRiskFlags, type ApplicationPayload, type ReadinessResult } from '@nexus/shared';
import { cn } from '@/lib/utils';
import { Tag } from '@/components/nx/status';

const ICON = {
  good: { Icon: Check, cls: 'bg-success-soft text-success' },
  warn: { Icon: TriangleAlert, cls: 'bg-warning-soft text-warning' },
  bad: { Icon: X, cls: 'bg-danger-soft text-danger' },
} as const;

/**
 * Readiness side panel. This is a deterministic completeness check computed from the draft
 * (the same `computeReadiness` the API uses to gate submission). It is NOT OCR and NOT AI; it does not
 * screen anyone. Compliance makes the decision.
 */
export function ReadinessPanel({
  readiness,
  payload,
  onFix,
  reachable,
}: {
  readiness: ReadinessResult;
  payload: Partial<ApplicationPayload>;
  onFix: (step: number) => void;
  reachable: (step: number) => boolean;
}) {
  const flags = deriveRiskFlags(payload);
  return (
    <aside aria-label="Application readiness" className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface lg:sticky lg:top-4 lg:self-start">
      <div className="border-b border-border-soft px-4 py-3.5">
        <div className="eyebrow">Completeness check</div>
        <h3 className="mt-1 text-[14px] font-semibold">Application readiness</h3>
        <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">Updates as you complete each section. The same check gates submission.</p>
      </div>

      <div className="border-b border-border-soft px-4 py-3.5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] text-muted-foreground">Readiness score</div>
            <div className="num text-[28px] font-semibold leading-none tracking-tight">{readiness.score}%</div>
          </div>
          <span className={cn('text-[11.5px] font-semibold', readiness.canSubmit ? 'text-success' : 'text-warning')}>{readiness.canSubmit ? 'Ready to submit' : `${readiness.missing.length} item${readiness.missing.length === 1 ? '' : 's'} to complete`}</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
          <div className={cn('h-full rounded-full transition-[width] duration-200', readiness.canSubmit ? 'bg-success' : 'bg-primary')} style={{ width: `${readiness.score}%` }} />
        </div>
      </div>

      <ul className="px-4 py-1.5">
        {readiness.checks.map((c) => {
          const { Icon, cls } = ICON[c.state] ?? { Icon: Minus, cls: 'bg-surface-sunken text-ink-3' };
          return (
            <li key={c.key} className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2.5 border-b border-border-soft py-2.5 last:border-b-0">
              <span className={cn('mt-0.5 grid size-[18px] place-items-center rounded-full', cls)}>
                <Icon className="size-2.5" strokeWidth={3} />
              </span>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold leading-tight">{c.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{c.detail}</div>
              </div>
              {c.state === 'bad' && reachable(c.step) && (
                <button type="button" onClick={() => onFix(c.step)} className="text-[11px] font-semibold text-primary hover:underline">
                  Open
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {flags.length > 0 && (
        <div className="border-t border-border-soft px-4 py-3">
          <div className="eyebrow mb-1.5">Flagged for enhanced review</div>
          <div className="flex flex-wrap gap-1.5">
            {flags.map((f) => (
              <Tag key={f} tone="warning">{f}</Tag>
            ))}
          </div>
        </div>
      )}

      <p className="border-t border-border-soft bg-surface-2 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        <b className="font-semibold text-ink-2">Human controlled.</b> This panel checks completeness only. It does not run sanctions, PEP or adverse-media screening; a Compliance reviewer makes the final decision.
      </p>
    </aside>
  );
}
