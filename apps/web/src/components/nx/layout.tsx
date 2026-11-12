'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/controls';

/* ── Page header ────────────────────────────────────────────────────────────── */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-foreground">{title}</h1>
        {description && <p className="mt-1 max-w-[720px] text-[12.5px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {(actions || meta) && (
        <div className="flex flex-wrap items-center gap-2">
          {meta}
          {actions}
        </div>
      )}
    </div>
  );
}

/* ── Panels ─────────────────────────────────────────────────────────────────── */
export function Panel({ className, children, ...props }: React.ComponentProps<'section'>) {
  return (
    <section className={cn('min-w-0 overflow-hidden rounded-lg border border-border bg-surface', className)} {...props}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-4 pb-3 pt-3.5', className)}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PanelBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-4 pb-4', className)} {...props} />;
}

/* ── Key/value rows (financial summary panels, profile details) ─────────────── */
export function InfoRow({ label, children, className, mono }: { label: React.ReactNode; children: React.ReactNode; className?: string; mono?: boolean }) {
  return (
    <div className={cn('grid grid-cols-[minmax(110px,150px)_1fr] items-baseline gap-3 border-b border-border-soft py-2.5 text-[12.5px] last:border-b-0', className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-words font-medium text-foreground', mono && 'num')}>{children ?? '—'}</dd>
    </div>
  );
}

export function InfoList({ className, ...props }: React.ComponentProps<'dl'>) {
  return <dl className={cn('m-0', className)} {...props} />;
}

/** Row of label/value pairs separated by hairlines, for financial summaries. */
export function FinancialSummary({ items, className }: { items: Array<{ label: string; value: React.ReactNode; tone?: 'up' | 'down'; hint?: string }>; className?: string }) {
  return (
    <div className={cn('grid divide-x divide-border-soft border-y border-border-soft', className)} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0 px-4 py-3">
          <div className="eyebrow">{i.label}</div>
          <div className={cn('num mt-1.5 truncate text-[16px] font-semibold tracking-tight', i.tone === 'up' && 'text-success', i.tone === 'down' && 'text-danger')}>{i.value}</div>
          {i.hint && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{i.hint}</div>}
        </div>
      ))}
    </div>
  );
}

/* ── Metrics ────────────────────────────────────────────────────────────────── */
export interface MetricProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: { value: string; tone: 'up' | 'down' | 'flat' };
  href?: string;
  loading?: boolean;
  icon?: React.ReactNode;
}

function MetricInner({ label, value, hint, delta, loading, icon }: MetricProps) {
  return (
    <div className="min-w-0 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow truncate">{label}</span>
        {icon && <span className="text-ink-3 [&_svg]:size-3.5">{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-2.5 h-6 w-24" />
      ) : (
        <div className="num mt-2 truncate text-[21px] font-semibold leading-none tracking-[-0.03em]">{value}</div>
      )}
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        {delta && !loading && (
          <span className={cn('num font-semibold', delta.tone === 'up' && 'text-success', delta.tone === 'down' && 'text-danger')}>{delta.value}</span>
        )}
        {hint && <span className="truncate">{hint}</span>}
      </div>
    </div>
  );
}

/** Hairline-divided strip of metrics (compact; replaces a row of boxed cards). */
export function KpiStrip({ items, className, columns }: { items: MetricProps[]; className?: string; columns?: number }) {
  const cols = columns ?? items.length;
  return (
    <div
      className={cn('grid overflow-hidden rounded-lg border border-border bg-surface', className)}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${cols > 4 ? 150 : 190}px, 1fr))` }}
    >
      {items.map((m, i) => {
        const inner = <MetricInner {...m} />;
        const border = 'border-b border-r border-border-soft [&:last-child]:border-r-0';
        return m.href ? (
          <Link key={m.label + i} href={m.href} className={cn(border, 'transition-colors hover:bg-surface-2')}>
            {inner}
          </Link>
        ) : (
          <div key={m.label + i} className={border}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/* ── Empty / loading / error ────────────────────────────────────────────────── */
export function EmptyState({ title, description, action, icon, className }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 grid size-10 place-items-center rounded-full bg-surface-sunken text-ink-3 [&_svg]:size-5">{icon ?? <Inbox />}</div>
      <div className="text-[13px] font-semibold">{title}</div>
      {description && <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="text-[13px] font-semibold text-danger">Something went wrong</div>
      <p className="mt-1 max-w-sm text-[12px] text-muted-foreground">{message ?? 'The data could not be loaded. Your changes are safe; try again.'}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 text-[12px] font-semibold text-primary hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" style={{ width: `${92 - i * 9}%` }} />
      ))}
    </div>
  );
}

/* ── Breadcrumbs (rendered by shells) ───────────────────────────────────────── */
export interface Crumb {
  label: string;
  href?: string;
}
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex min-w-0 items-center gap-1.5 text-[12px]', className)}>
      {items.map((c, i) => (
        <React.Fragment key={`${c.label}-${i}`}>
          {i > 0 && <ChevronRight className="size-3 shrink-0 text-ink-3" />}
          {c.href && i < items.length - 1 ? (
            <Link href={c.href} className="truncate text-muted-foreground hover:text-foreground">
              {c.label}
            </Link>
          ) : (
            <span className={cn('truncate', i === items.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{c.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
