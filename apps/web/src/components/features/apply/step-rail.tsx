'use client';

import { Check, Lock } from 'lucide-react';
import { ONBOARDING_STEPS } from '@nexus/shared';
import { cn } from '@/lib/utils';
import { CopyLink } from './copy-link';

/**
 * Step rail. Vertical and sticky on desktop; a horizontal strip on mobile.
 * A step can be opened only when every earlier step is complete (no skipping ahead past invalid steps).
 */
export function StepRail({
  current,
  complete,
  reachable,
  onSelect,
  reference,
  resumeLink,
}: {
  current: number;
  complete: boolean[];
  reachable: (step: number) => boolean;
  onSelect: (step: number) => void;
  reference?: string;
  resumeLink?: string;
}) {
  return (
    <aside aria-label="Application steps" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
      <div className="rounded-lg border border-border bg-surface p-1.5">
        <ol className="nx-scroll flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {ONBOARDING_STEPS.map((s, i) => {
            const active = i === current;
            const done = complete[i];
            const open = reachable(i);
            return (
              <li key={s.key} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  disabled={!open}
                  aria-current={active ? 'step' : undefined}
                  onClick={() => onSelect(i)}
                  className={cn(
                    'grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30',
                    active ? 'bg-primary-soft' : open ? 'hover:bg-surface-2' : 'opacity-55',
                    'max-lg:min-w-[150px]',
                  )}
                >
                  <span className={cn('num grid size-7 place-items-center rounded-md text-[11px] font-bold', done ? 'bg-foreground text-white' : active ? 'bg-primary text-white' : 'bg-surface-sunken text-ink-2')}>
                    {done ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold leading-tight">{s.title}</span>
                    <span className="block truncate text-[10.5px] leading-tight text-muted-foreground">{s.subtitle}</span>
                  </span>
                  {!open && <Lock className="size-3 text-ink-3" aria-label="Complete the earlier steps first" />}
                </button>
              </li>
            );
          })}
        </ol>
        {reference && (
          <div className="mt-1.5 hidden border-t border-border-soft px-2.5 pb-1.5 pt-3 lg:block">
            <div className="eyebrow">Application</div>
            <div className="num mt-1 text-[12px] font-semibold">{reference}</div>
            {resumeLink && (
              <div className="mt-3">
                <div className="eyebrow mb-1">Resume link</div>
                <CopyLink value={resumeLink} compact />
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
