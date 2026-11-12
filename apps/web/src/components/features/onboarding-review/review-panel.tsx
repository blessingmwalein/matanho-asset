'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, CircleAlert, CircleDot, MessageSquarePlus, Play, ShieldCheck, ThumbsDown, Undo2, Send } from 'lucide-react';
import { P, formatDateTime } from '@nexus/shared';
import { ApiError, api } from '@/lib/api';
import { useCan } from '@/lib/session';
import { useIdempotencyKey } from '@/lib/idempotency';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { ReviewPanel } from '@/components/nx/blocks';
import { Panel, PanelBody, PanelHeader } from '@/components/nx/layout';
import { ApplicationStatus } from '@/components/nx/status';
import { ApproveDialog, InvestorLink, ReasonDialog, invalidateApplication } from './decision-dialogs';
import type { ApplicationDetail } from './types';

type Dialog = 'start' | 'info' | 'approve' | 'reject' | 'reopen' | null;

const NOTE_LABEL = { NOTE: 'Note', INFO_REQUEST: 'Information request', DECISION: 'Decision', APPLICANT_RESPONSE: 'Applicant response' } as const;

/** Sticky review workspace: readiness checklist, internal notes, and the decision actions (all server-enforced). */
export function ApplicationReviewPanel({ app }: { app: ApplicationDetail }) {
  const qc = useQueryClient();
  const can = useCan();
  const startKey = useIdempotencyKey();
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [note, setNote] = React.useState('');

  const canReview = can(P.ONBOARDING_REVIEW);
  const canDecide = can(P.ONBOARDING_APPROVE);
  const a = app.actions;
  const legalName = app.payload.legalName ?? app.reference;
  const r = app.readiness;

  const start = useMutation({
    mutationFn: () => api(`/applications/${app.id}/start-review`, { method: 'POST', idempotencyKey: startKey.get() }),
    onSuccess: () => {
      toast.success('Review started. You are now the assigned reviewer.');
      startKey.reset();
      invalidateApplication(qc, app.id);
      setDialog(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not start the review'),
  });

  const addNote = useMutation({
    mutationFn: () => api(`/applications/${app.id}/notes`, { method: 'POST', body: { body: note.trim() } }),
    onSuccess: () => {
      toast.success('Note added');
      setNote('');
      invalidateApplication(qc, app.id);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not add the note'),
  });

  const approveBlocked = a.approve && !r.canSubmit ? `Resolve ${r.missing.length} open readiness item(s) before approving.` : null;
  const primary: 'start' | 'approve' | null = a.startReview && canReview ? 'start' : a.approve && canDecide && r.canSubmit ? 'approve' : null;

  return (
    <div className="grid gap-4 lg:sticky lg:top-[72px]">
      <Panel>
        <PanelHeader
          title="Readiness checklist"
          description="Deterministic completeness check. It does not replace reviewer judgement."
          actions={<span className={cn('num text-[13px] font-semibold', r.canSubmit ? 'text-success' : 'text-warning')}>{r.score}%</span>}
        />
        <PanelBody className="pt-0">
          <ul className="grid gap-2">
            {r.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2 text-[12px]">
                {c.state === 'bad' ? (
                  <CircleAlert className="mt-px size-3.5 shrink-0 text-danger" />
                ) : c.state === 'warn' ? (
                  <CircleDot className="mt-px size-3.5 shrink-0 text-warning" />
                ) : (
                  <CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" />
                )}
                <span className="min-w-0">
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </PanelBody>
      </Panel>

      <ReviewPanel title="Decision" description="Each action is recorded with before/after in the audit trail.">
        <div className="mb-1 flex w-full items-center justify-between text-[12px]">
          <span className="text-muted-foreground">Current status</span>
          <ApplicationStatus status={app.status} />
        </div>
        <div className="grid w-full gap-2">
          <Button variant={primary === 'start' ? 'primary' : 'secondary'} disabled={!a.startReview || !canReview} onClick={() => setDialog('start')}>
            <Play /> Start review
          </Button>
          <Button variant="secondary" disabled={!a.requestInfo || !canReview} onClick={() => setDialog('info')}>
            <Send /> Request information
          </Button>
          <Button variant={primary === 'approve' ? 'primary' : 'secondary'} disabled={!a.approve || !canDecide || !r.canSubmit} onClick={() => setDialog('approve')}>
            <ShieldCheck /> Approve
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="destructive" disabled={!a.reject || !canDecide} onClick={() => setDialog('reject')}>
              <ThumbsDown /> Reject
            </Button>
            <Button variant="secondary" disabled={!a.reopen || !canDecide} onClick={() => setDialog('reopen')}>
              <Undo2 /> Reopen
            </Button>
          </div>
        </div>
        <div className="w-full text-[11.5px] leading-snug text-muted-foreground">
          {app.status === 'APPROVED' && app.investor ? (
            <div className="grid gap-1">
              <span>Approved {app.decidedAt ? formatDateTime(app.decidedAt) : ''}{app.decidedBy ? ` by ${app.decidedBy}` : ''}.</span>
              <InvestorLink investor={app.investor} />
            </div>
          ) : app.status === 'REJECTED' ? (
            <span>Rejected{app.decisionReason ? `: ${app.decisionReason}` : ''}. Reopen to continue the review.</span>
          ) : app.status === 'INFORMATION_REQUESTED' ? (
            <span>Waiting for the applicant to respond. The application returns to the queue when they resubmit.</span>
          ) : app.status === 'DRAFT' ? (
            <span>The applicant has not submitted this application yet.</span>
          ) : approveBlocked ? (
            <span>{approveBlocked}</span>
          ) : a.startReview ? (
            <span>Start the review to assign yourself and unlock approval.</span>
          ) : !canReview && !canDecide ? (
            <span>You have read-only access to onboarding.</span>
          ) : null}
        </div>
      </ReviewPanel>

      <Panel>
        <PanelHeader title="Internal notes" description="Visible to staff only." />
        <PanelBody className="pt-0">
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a review note…" disabled={!canReview} aria-label="Internal note" />
          <div className="mt-2 flex justify-end">
            <Button variant="secondary" size="sm" disabled={!canReview || note.trim().length < 2} loading={addNote.isPending} onClick={() => addNote.mutate()}>
              <MessageSquarePlus /> Add note
            </Button>
          </div>
          {app.notes.length > 0 && (
            <ul className="mt-3 grid gap-2.5 border-t border-border-soft pt-3">
              {app.notes.slice(0, 4).map((n) => (
                <li key={n.id} className="text-[12px]">
                  <div className="flex items-center justify-between gap-2 text-[10.5px] text-ink-3">
                    <span className="font-semibold uppercase tracking-wide">{NOTE_LABEL[n.kind]}</span>
                    <span className="num">{formatDateTime(n.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 leading-relaxed text-ink-2">{n.body}</p>
                  {n.authorName && <p className="text-[10.5px] text-ink-3">{n.authorName}</p>}
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>

      <ConfirmDialog
        open={dialog === 'start'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Start review"
        description={`Assign yourself as reviewer of ${legalName}? The application moves to “Under review”.`}
        confirmLabel="Start review"
        loading={start.isPending}
        onConfirm={() => start.mutate()}
      />
      <ReasonDialog
        open={dialog === 'info'}
        onOpenChange={(o) => !o && setDialog(null)}
        applicationId={app.id}
        action="request-info"
        title="Request information"
        description="Tell the applicant exactly what is missing or unclear. They resume the same application to respond."
        label="Information required"
        placeholder="e.g. Please upload a certified copy of the board resolution authorising this investment."
        confirmLabel="Send request"
        successMessage="Information requested from the applicant"
        bodyKey="message"
        withStep
      />
      <ApproveDialog
        open={dialog === 'approve'}
        onOpenChange={(o) => !o && setDialog(null)}
        applicationId={app.id}
        legalName={legalName}
        readiness={r}
      />
      <ReasonDialog
        open={dialog === 'reject'}
        onOpenChange={(o) => !o && setDialog(null)}
        applicationId={app.id}
        action="reject"
        title={`Reject ${legalName}`}
        description="A reason is required and is recorded permanently. A rejected application can be reopened later."
        label="Reason for rejection"
        placeholder="State the compliance or documentation basis for the decision."
        confirmLabel="Reject application"
        tone="destructive"
        successMessage="Application rejected"
        bodyKey="reason"
      />
      <ReasonDialog
        open={dialog === 'reopen'}
        onOpenChange={(o) => !o && setDialog(null)}
        applicationId={app.id}
        action="reopen"
        title="Reopen application"
        description="The application returns to “Under review” with you as reviewer. A reason is required."
        label="Reason for reopening"
        placeholder="e.g. Applicant supplied the missing evidence outside the portal."
        confirmLabel="Reopen application"
        successMessage="Application reopened for review"
        bodyKey="reason"
      />
    </div>
  );
}
