'use client';

import { ArrowLeftRight, Banknote, FileText } from 'lucide-react';
import { formatDate } from '@nexus/shared';
import { EmptyState } from '@/components/nx/layout';
import { useMoney } from './hooks';
import type { ActivityItem } from './types';

const ICON = { TRANSACTION: ArrowLeftRight, CAPITAL: Banknote, DOCUMENT: FileText } as const;

/** Recent investor-facing events: trades, capital events and published documents. */
export function ActivityList({ items, onOpenDocument }: { items: ActivityItem[] | undefined; onOpenDocument: (id: string) => void }) {
  const m = useMoney();
  if (!items?.length) return <EmptyState title="No recent activity" description="Trades, capital events and new documents appear here." className="py-8" />;
  return (
    <ul>
      {items.map((a) => {
        const Icon = ICON[a.kind];
        const body = (
          <>
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-surface-sunken text-ink-3">
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[12.5px] font-semibold">{a.title}</span>
              <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                {a.detail}
                {a.amount !== undefined && a.amount !== null ? ` · ${m.full(a.amount)}` : ''}
              </span>
            </span>
            <span className="num shrink-0 pt-0.5 text-[11.5px] text-muted-foreground">{formatDate(a.date).slice(0, 6)}</span>
          </>
        );
        return (
          <li key={a.id} className="border-t border-border-soft first:border-t-0">
            {a.documentId ? (
              <button type="button" onClick={() => onOpenDocument(a.documentId!)} className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-surface-2">
                {body}
              </button>
            ) : (
              <div className="flex items-start gap-3 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
