'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { ONBOARDING_STEPS, RISK_RATINGS, titleCase, type ReadinessResult, type RiskRating } from '@nexus/shared';
import { ApiError, api } from '@/lib/api';
import { useIdempotencyKey } from '@/lib/idempotency';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/controls';
import { Label, Textarea } from '@/components/ui/input';
import type { StaffOption } from '@/components/features/investors/types';

export function invalidateApplication(qc: QueryClient, id: string) {
  void qc.invalidateQueries({ queryKey: ['application', id] });
  void qc.invalidateQueries({ queryKey: ['applications'] });
  void qc.invalidateQueries({ queryKey: ['application-summary'] });
  void qc.invalidateQueries({ queryKey: ['nav-counts'] });
  void qc.invalidateQueries({ queryKey: ['dashboard'] });
  void qc.invalidateQueries({ queryKey: ['investors'] });
}

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

/** Generic "reason required" decision dialog (request information, reject, reopen). */
export function ReasonDialog({
  open,
  onOpenChange,
  applicationId,
  action,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  tone = 'primary',
  minLength = 5,
  successMessage,
  bodyKey,
  withStep,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  applicationId: string;
  action: 'request-info' | 'reject' | 'reopen';
  title: string;
  description: string;
  label: string;
  placeholder: string;
  confirmLabel: string;
  tone?: 'primary' | 'destructive';
  minLength?: number;
  successMessage: string;
  bodyKey: 'message' | 'reason';
  /** request-info only: let the reviewer point the applicant at a wizard step */
  withStep?: boolean;
}) {
  const qc = useQueryClient();
  const key = useIdempotencyKey();
  const [text, setText] = React.useState('');
  const [step, setStep] = React.useState<string>('none');
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setText('');
      setStep('none');
      setTouched(false);
    }
  }, [open]);

  const tooShort = text.trim().length < minLength;
  const mutation = useMutation({
    mutationFn: () =>
      api(`/applications/${applicationId}/${action}`, {
        method: 'POST',
        idempotencyKey: key.get(),
        body: { [bodyKey]: text.trim(), ...(withStep && step !== 'none' ? { step: Number(step) } : {}) },
      }),
    onSuccess: () => {
      toast.success(successMessage);
      key.reset();
      invalidateApplication(qc, applicationId);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!tooShort) mutation.mutate();
          }}
          className="grid gap-3.5"
          noValidate
        >
          <div className="grid gap-1.5">
            <Label htmlFor="reason-text">{label} <span className="text-danger">*</span></Label>
            <Textarea id="reason-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-invalid={touched && tooShort} />
            {touched && tooShort && (
              <p role="alert" className="text-[11px] font-medium text-danger">
                Enter at least {minLength} characters.
              </p>
            )}
          </div>
          {withStep && (
            <div className="grid gap-1.5">
              <Label>Applicant should revisit <span className="text-[10.5px] font-normal text-ink-3">optional</span></Label>
              <Select value={step} onValueChange={setStep}>
                <SelectTrigger aria-label="Step to revisit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific step</SelectItem>
                  {ONBOARDING_STEPS.map((s, i) => (
                    <SelectItem key={s.key} value={String(i)}>
                      {i + 1}. {s.heading}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant={tone === 'destructive' ? 'destructive' : 'primary'} loading={mutation.isPending}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Approval: explicit human decision with risk rating and relationship manager. Creates the investor in one transaction. */
export function ApproveDialog({
  open,
  onOpenChange,
  applicationId,
  legalName,
  readiness,
  onApproved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  applicationId: string;
  legalName: string;
  readiness: ReadinessResult;
  onApproved?: (investor: { id: string; ref: string }) => void;
}) {
  const qc = useQueryClient();
  const key = useIdempotencyKey();
  const [risk, setRisk] = React.useState<RiskRating>('MEDIUM');
  const [rm, setRm] = React.useState<string>('none');
  const [note, setNote] = React.useState('');
  React.useEffect(() => {
    if (open) {
      setRisk('MEDIUM');
      setRm('none');
      setNote('');
    }
  }, [open]);

  const staff = useQuery({ queryKey: ['staff-options'], queryFn: () => api<StaffOption[]>('/investors/staff-options'), staleTime: 5 * 60_000, enabled: open });

  const mutation = useMutation({
    mutationFn: () =>
      api<{ alreadyApproved: boolean; investor: { id: string; ref: string; legalName: string } }>(`/applications/${applicationId}/approve`, {
        method: 'POST',
        idempotencyKey: key.get(),
        body: { riskRating: risk, ...(rm !== 'none' ? { relationshipManagerId: rm } : {}), ...(note.trim() ? { note: note.trim() } : {}) },
      }),
    onSuccess: (res) => {
      toast.success(res.alreadyApproved ? `Already approved: ${res.investor.ref}` : `Approved. Investor ${res.investor.ref} created.`);
      key.reset();
      invalidateApplication(qc, applicationId);
      onApproved?.(res.investor);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Approve ${legalName}`}
        description="Approval creates the investor record, a default investment account and marks KYC as verified. This is recorded in the audit trail."
        size="md"
      >
        <div className="grid gap-4">
          <ul className="grid gap-1.5 rounded-lg border border-border-soft bg-surface-2 p-3">
            {readiness.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2 text-[12px]">
                {c.state === 'bad' ? <CircleAlert className="mt-px size-3.5 shrink-0 text-danger" /> : <CheckCircle2 className={`mt-px size-3.5 shrink-0 ${c.state === 'warn' ? 'text-warning' : 'text-success'}`} />}
                <span>
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Risk rating <span className="text-danger">*</span></Label>
              <Select value={risk} onValueChange={(v) => setRisk(v as RiskRating)}>
                <SelectTrigger aria-label="Risk rating">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISK_RATINGS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {titleCase(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Relationship manager <span className="text-[10.5px] font-normal text-ink-3">optional</span></Label>
              <Select value={rm} onValueChange={setRm}>
                <SelectTrigger aria-label="Relationship manager">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {(staff.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="approve-note">Decision note <span className="text-[10.5px] font-normal text-ink-3">optional</span></Label>
            <Textarea id="approve-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Basis for approval, conditions or monitoring requirements." />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="primary" loading={mutation.isPending} disabled={!readiness.canSubmit} onClick={() => mutation.mutate()}>
            Approve and create investor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Link shown after a successful approval. */
export function InvestorLink({ investor }: { investor: { id: string; ref: string; legalName: string } }) {
  return (
    <Link href={`/internal/investors/${investor.id}`} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline">
      Open investor {investor.ref}
    </Link>
  );
}
