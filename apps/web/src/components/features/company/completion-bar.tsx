import { cn } from '@/lib/utils';

/** Flat completion indicator: thin track with a solid fill (no gradient). */
export function CompletionBar({ pct, className, showLabel = true }: { pct: number; className?: string; showLabel?: boolean }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className={cn('flex min-w-[110px] items-center gap-2', className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label="Completion">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
        <div className={cn('h-full rounded-full', v >= 100 ? 'bg-success' : 'bg-primary')} style={{ width: `${v}%` }} />
      </div>
      {showLabel && <span className="num w-9 text-right text-[12px] font-semibold">{v}%</span>}
    </div>
  );
}
