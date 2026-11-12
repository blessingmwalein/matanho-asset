'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { daysUntil, formatDate } from '@nexus/shared';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/nx/layout';
import { cn } from '@/lib/utils';
import { useAcknowledge, useMoney } from './hooks';
import type { CallDto } from './types';

export function AckButton({ call, size }: { call: CallDto; size?: 'sm' | 'md' }) {
  const ack = useAcknowledge();
  const done = call.acknowledgedByMe || call.acknowledged || ack.isSuccess;
  return (
    <Button variant="secondary" size={size} loading={ack.isPending} disabled={done || ack.isPending} onClick={() => ack.mutate(call.id)} title={done ? (call.acknowledgedBy ? `Acknowledged by ${call.acknowledgedBy}` : 'Acknowledged') : 'Confirm that you have received this notice. This is not a payment.'}>
      {done && <Check />}
      {done ? 'Acknowledged' : 'Acknowledge'}
    </Button>
  );
}

function statusText(c: CallDto) {
  if (c.status === 'OVERDUE') return 'Overdue';
  return c.acknowledged ? 'Acknowledged · awaiting funding' : 'Awaiting funding';
}

function dueBadge(due: string | null) {
  const d = daysUntil(due);
  if (d === null) return null;
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} overdue`;
  if (d === 0) return 'Due today';
  return `Due in ${d} day${d === 1 ? '' : 's'}`;
}

/** Overview: "Next investor action" (client-portal.html action card, flat). */
export function NextActionCard({ call, onReview, className }: { call: CallDto | null | undefined; onReview: (documentId: string) => void; className?: string }) {
  const m = useMoney();
  if (!call) {
    return (
      <Panel className={cn('p-4', className)}>
        <div className="eyebrow">Next investor action</div>
        <h3 className="mt-2.5 text-[17px] font-semibold leading-snug tracking-tight">Nothing needs your attention</h3>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">There are no open capital calls. New notices appear here and in the Capital workspace as soon as they are issued.</p>
        <Button asChild variant="secondary" className="mt-4">
          <Link href="/portal/documents">Open documents</Link>
        </Button>
      </Panel>
    );
  }
  const badge = dueBadge(call.dueDate);
  return (
    <Panel className={cn('flex flex-col p-4', className)}>
      <div className="eyebrow">Next investor action</div>
      <h3 className="mt-2.5 text-[17px] font-semibold leading-snug tracking-tight">Capital call due {call.dueDate ? formatDate(call.dueDate).slice(0, 6) : 'soon'}</h3>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        {call.fundName} has a scheduled drawdown. The signed notice and funding instructions are available below. Acknowledging confirms you have received the notice; it is not a payment and does not change your called capital.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {call.noticeDocumentId ? (
          <Button variant="primary" onClick={() => onReview(call.noticeDocumentId!)}>
            Review capital call
          </Button>
        ) : (
          <Button asChild variant="primary">
            <Link href="/portal/capital">Review capital call</Link>
          </Button>
        )}
        <AckButton call={call} />
      </div>
      <dl className="mt-4 text-[12px]">
        {[
          ['Amount due', <b key="a" className="num font-semibold">{m.full(call.amount)}</b>],
          ['Funding account', <b key="f" className="num font-semibold">{call.fundingAccountMasked ?? 'See notice'}</b>],
          ['Status', <b key="s" className="font-semibold">{statusText(call)}</b>],
          ...(badge ? [['Timing', <b key="t" className="font-semibold">{badge}</b>]] : []),
        ].map(([k, v]) => (
          <div key={String(k)} className="flex items-center justify-between gap-3 border-t border-border-soft py-2.5">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="m-0 text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/** Capital page: the open call with commitment arithmetic (client-portal.html .capital-call, flat). */
export function OpenCallCard({ call, onViewNotice }: { call: CallDto; onViewNotice: (documentId: string) => void }) {
  const m = useMoney();
  const badge = dueBadge(call.dueDate);
  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow">Open capital call</div>
          <h2 className="mt-1.5 text-[18px] font-semibold tracking-tight">{call.fundName}</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Capital Call {call.ref} · issued {formatDate(call.issueDate)}
          </p>
        </div>
        <div className="text-right">
          <div className="num text-[22px] font-semibold tracking-tight">{m.full(call.amount)}</div>
          <div className="num text-[11px] text-muted-foreground">
            Due {formatDate(call.dueDate)}
            {badge ? ` · ${badge}` : ''}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border-soft pt-4 sm:grid-cols-4">
        {[
          ['Commitment', m.full(call.commitment)],
          ['Called to date', m.full(call.calledToDate)],
          ['After this call', m.full(call.afterCall)],
          ['Remaining', m.full(call.remaining)],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="eyebrow">{k}</div>
            <div className="num mt-1.5 text-[13px] font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {call.noticeDocumentId ? (
          <Button variant="primary" onClick={() => onViewNotice(call.noticeDocumentId!)}>
            View signed notice
          </Button>
        ) : (
          <Button variant="primary" disabled title="No notice document is attached to this call yet">
            Notice not yet available
          </Button>
        )}
        <AckButton call={call} />
        <span className="text-[11px] text-muted-foreground">
          {call.fundingAccountMasked ? `Funding account ${call.fundingAccountMasked} · ` : ''}
          {statusText(call)}
        </span>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Acknowledging records that you received the notice. It is not proof of payment and does not change called capital; the fund administrator updates that when funds are received.</p>
    </Panel>
  );
}
