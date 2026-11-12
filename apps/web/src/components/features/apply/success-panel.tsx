'use client';

import { CheckCircle2 } from 'lucide-react';
import { APPLICATION_STATUS_LABELS, formatDateTime, type ApplicationStatus } from '@nexus/shared';
import { Panel } from '@/components/nx/layout';
import { ApplicationStatus as StatusLabel } from '@/components/nx/status';

/** Shown after submitting, and when a submitted application is reopened from its link. */
export function SuccessPanel({ reference, status, submittedAt, justSubmitted }: { reference: string; status: ApplicationStatus; submittedAt?: string | null; justSubmitted?: boolean }) {
  const decided = status === 'APPROVED' || status === 'REJECTED';
  return (
    <Panel className="mx-auto max-w-[760px]">
      <div className="px-6 py-10 text-center sm:px-10">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="size-6" />
        </div>
        <div className="eyebrow">{justSubmitted ? 'Application received' : 'Application status'}</div>
        <h2 className="mt-1.5 text-[22px] font-semibold tracking-tight">{decided ? `Your application was ${APPLICATION_STATUS_LABELS[status].toLowerCase()}.` : 'Your application is in review.'}</h2>
        <p className="mx-auto mt-2 max-w-[520px] text-[12.5px] leading-relaxed text-muted-foreground">
          {decided
            ? 'Your Matanho relationship team will be in touch about next steps.'
            : 'A Compliance reviewer will check your declarations, ownership and evidence against the original documents. We will contact you on the email address you provided if anything else is needed. Approval is a human decision.'}
        </p>
        <dl className="mx-auto mt-6 grid max-w-[560px] divide-y divide-border-soft overflow-hidden rounded-lg border border-border text-left sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="px-4 py-3">
            <dt className="eyebrow">Reference</dt>
            <dd className="num mt-1 text-[14px] font-semibold">{reference}</dd>
            <dd className="mt-0.5 text-[10.5px] text-muted-foreground">Quote this in correspondence</dd>
          </div>
          <div className="px-4 py-3">
            <dt className="eyebrow">Status</dt>
            <dd className="mt-1 text-[13px] font-semibold"><StatusLabel status={status} /></dd>
            {submittedAt && <dd className="num mt-0.5 text-[10.5px] text-muted-foreground">Submitted {formatDateTime(submittedAt)}</dd>}
          </div>
          <div className="px-4 py-3">
            <dt className="eyebrow">Decision</dt>
            <dd className="mt-1 text-[13px] font-semibold">Human review</dd>
            <dd className="mt-0.5 text-[10.5px] text-muted-foreground">Compliance approves or declines</dd>
          </div>
        </dl>
      </div>
    </Panel>
  );
}
