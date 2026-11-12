'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, Panel, PanelHeader } from '@/components/nx/layout';
import { Tag } from '@/components/nx/status';
import type { DashboardOverview, DashboardTask } from './types';

const DOT: Record<DashboardTask['priority'], string> = { high: 'bg-danger', medium: 'bg-warning', low: 'bg-ink-3' };
const PRIORITY_LABEL: Record<DashboardTask['priority'], string> = { high: 'Urgent', medium: 'Due', low: 'In progress' };

/** Work queue: prioritised tasks from every module with counts and deep links. */
export function NeedsAttention({ queue, className }: { queue: DashboardOverview['queue']; className?: string }) {
  const counts = queue.counts;
  return (
    <Panel className={cn('flex flex-col', className)}>
      <PanelHeader title="Needs attention" description="Open work across onboarding, operations and reporting." actions={queue.total > 0 ? <Tag tone="warning">{queue.total} open</Tag> : <Tag tone="success">All clear</Tag>} />
      <div className="grid grid-cols-2 gap-px border-y border-border-soft bg-border-soft sm:grid-cols-3">
        {counts.map((c) => (
          <Link key={c.kind} href={c.href} className="group min-w-0 bg-surface px-4 py-2.5 transition-colors hover:bg-surface-2">
            <div className={cn('num text-[20px] font-semibold leading-none tracking-tight', c.count === 0 && 'text-ink-3')}>{c.count}</div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground group-hover:text-foreground">{c.label}</div>
          </Link>
        ))}
      </div>
      {queue.tasks.length === 0 ? (
        <EmptyState icon={<CircleCheck />} title="Nothing needs attention" description="New applications, exceptions and submissions will appear here as they arrive." className="py-10" />
      ) : (
        <ul className="nx-scroll max-h-[340px] min-h-0 flex-1 divide-y divide-border-soft overflow-y-auto">
          {queue.tasks.map((t) => (
            <li key={t.id}>
              <Link href={t.href} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2">
                <span className={cn('size-2 shrink-0 rounded-full', DOT[t.priority])} title={PRIORITY_LABEL[t.priority]} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium">{t.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{t.detail}</span>
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
