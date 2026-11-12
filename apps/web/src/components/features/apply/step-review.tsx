'use client';

import * as React from 'react';
import { FormProvider } from 'react-hook-form';
import { Check, TriangleAlert } from 'lucide-react';
import {
  DOCUMENT_SLOTS,
  deriveRiskFlags,
  formatMoney,
  INVESTOR_TYPE_LABELS,
  ownershipTotal,
  step5Schema,
  type ReadinessResult,
} from '@nexus/shared';
import { CheckboxField, FormSection, TextField } from '@/components/form/fields';
import { Tag } from '@/components/nx/status';
import { cn } from '@/lib/utils';
import { pick, useStepForm } from './use-step-form';
import type { SlotDocument, StepProps } from './types';

function ReviewCard({ title, step, onEdit, children, disabled }: { title: string; step: number; onEdit: (s: number) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <section className="mb-2.5 overflow-hidden rounded-lg border border-border bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border-soft px-3.5 py-2.5">
        <h4 className="text-[12.5px] font-semibold">{title}</h4>
        {!disabled && (
          <button type="button" onClick={() => onEdit(step)} className="text-[11.5px] font-semibold text-primary hover:underline">
            Edit
          </button>
        )}
      </header>
      <div className="grid gap-x-4 gap-y-3 px-3.5 py-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function Item({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2 lg:col-span-3')}>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 break-words text-[12.5px] font-medium">{children === undefined || children === null || children === '' ? <span className="text-ink-3">Not provided</span> : children}</div>
    </div>
  );
}

const ANSWER_LABEL: Record<string, string> = { NO: 'No', YES: 'Yes / possible', UNKNOWN: 'Unsure' };

/** Step 6: summary per section, missing information, declaration and consent. Submit lives in the wizard footer. */
export function StepReview({
  payload,
  onValues,
  registerValidator,
  disabled,
  readiness,
  documents,
  goToStep,
  submitErrors,
}: Pick<StepProps, 'payload' | 'onValues' | 'registerValidator' | 'disabled'> & {
  readiness: ReadinessResult;
  documents: Record<string, SlotDocument>;
  goToStep: (step: number) => void;
  submitErrors?: Record<string, string> | null;
}) {
  const form = useStepForm(step5Schema, { consent: false, signatureName: '', ...pick(payload, ['consent', 'signatureName']) }, { onValues, registerValidator });
  const p = payload;
  const flags = deriveRiskFlags(p);
  const owners = p.owners ?? [];
  const last4 = p.bankAccountNumber ? `•••• ${p.bankAccountNumber.slice(-4)}` : undefined;
  const required = DOCUMENT_SLOTS.filter((s) => s.required);
  const otherMissing = readiness.missing.filter((m) => m.key !== 'consent');

  return (
    <div>
      {otherMissing.length > 0 ? (
        <div className="mb-3 rounded-lg border border-[#ecd9b0] bg-warning-soft p-3.5">
          <div className="flex items-center gap-2 text-[12.5px] font-semibold text-warning">
            <TriangleAlert className="size-4" /> {otherMissing.length} section{otherMissing.length === 1 ? '' : 's'} still need attention
          </div>
          <ul className="mt-2 grid gap-1.5">
            {otherMissing.map((m) => (
              <li key={m.key} className="flex items-start justify-between gap-3 text-[12px]">
                <span className="min-w-0">
                  <b className="font-semibold">{m.label}:</b> <span className="text-ink-2">{m.detail}</span>
                </span>
                <button type="button" onClick={() => goToStep(m.step)} className="shrink-0 font-semibold text-primary hover:underline">
                  Fix
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#cfe6dd] bg-success-soft px-3.5 py-2.5 text-[12.5px] font-semibold text-success">
          <Check className="size-4" /> All sections are complete. Review the summary and sign the declaration to submit.
        </div>
      )}

      {submitErrors && Object.keys(submitErrors).length > 0 && (
        <div role="alert" className="mb-3 rounded-lg border border-[#e6c3c9] bg-danger-soft p-3.5 text-[12px]">
          <div className="font-semibold text-danger">The server rejected the submission</div>
          <ul className="mt-1.5 list-disc pl-4 text-ink-2">
            {Object.entries(submitErrors).slice(0, 8).map(([k, v]) => (
              <li key={k}>
                <span className="font-medium">{k}:</span> {v}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ReviewCard title="Investor" step={0} onEdit={goToStep} disabled={disabled}>
        <Item label="Type">{p.investorType ? INVESTOR_TYPE_LABELS[p.investorType] : undefined}</Item>
        <Item label="Legal name">{p.legalName}</Item>
        <Item label="Registration">{p.registrationNumber}</Item>
        <Item label="Jurisdiction">{p.country}</Item>
        <Item label="Tax ID">{p.taxIdentificationNumber}</Item>
        <Item label="Classification">{p.investorClassification}</Item>
        <Item label="Contact">{[p.contactName, p.email, p.telephone].filter(Boolean).join(' · ')}</Item>
        <Item label="Relationship">{p.relationshipRequested ?? 'Discretionary managed account'}</Item>
        <Item label="Initial investment">{p.initialInvestment ? formatMoney(p.initialInvestment, p.baseCurrency ?? 'USD', { decimals: 0 }) : undefined}</Item>
        <Item label="Registered address" wide>{p.registeredAddress}</Item>
      </ReviewCard>

      <ReviewCard title="Ownership and signatories" step={1} onEdit={goToStep} disabled={disabled}>
        <Item label="Beneficial owners" wide>
          {owners.length ? (
            <ul className="grid gap-0.5">
              {owners.map((o, i) => (
                <li key={i} className="num">
                  {o.fullName || 'Unnamed'} · {o.ownershipPercent ?? 0}%{o.isController ? ' · controller' : ''}
                </li>
              ))}
              <li className="num text-muted-foreground">Total {ownershipTotal(owners)}%</li>
            </ul>
          ) : undefined}
        </Item>
        <Item label="Authorised signatories" wide>
          {p.signatories?.length ? p.signatories.map((s) => `${s.fullName} (${s.role})`).join(', ') : undefined}
        </Item>
        <Item label="Authority to invest" wide>{p.authorityNarrative}</Item>
      </ReviewCard>

      <ReviewCard title="KYC / AML declarations" step={2} onEdit={goToStep} disabled={disabled}>
        <Item label="PEP">{p.pep ? ANSWER_LABEL[p.pep] : undefined}</Item>
        <Item label="Sanctions">{p.sanctions ? ANSWER_LABEL[p.sanctions] : undefined}</Item>
        <Item label="Adverse media">{p.adverseMedia ? ANSWER_LABEL[p.adverseMedia] : undefined}</Item>
        <Item label="Enhanced-risk jurisdictions">{p.highRiskJurisdiction ? ANSWER_LABEL[p.highRiskJurisdiction] : undefined}</Item>
        <Item label="Source of funds">{p.sourceOfFunds}</Item>
        <Item label="Source of wealth">{p.sourceOfWealth}</Item>
        <Item label="Expected activity" wide>{p.expectedActivity}</Item>
        {flags.length > 0 && (
          <Item label="Flagged for enhanced review" wide>
            <span className="flex flex-wrap gap-1.5">
              {flags.map((f) => (
                <Tag key={f} tone="warning">{f}</Tag>
              ))}
            </span>
          </Item>
        )}
      </ReviewCard>

      <ReviewCard title="Tax and bank" step={3} onEdit={goToStep} disabled={disabled}>
        <Item label="Tax residence">{p.taxResidency}</Item>
        <Item label="FATCA">{p.fatca}</Item>
        <Item label="CRS">{p.crs}</Item>
        <Item label="Bank">{p.bankName}</Item>
        <Item label="Account holder">{p.bankAccountHolder}</Item>
        <Item label="Account">{last4 ? `${last4} (${p.bankCurrency ?? 'USD'})` : undefined}</Item>
        <Item label="SWIFT / BIC">{p.swiftBic}</Item>
      </ReviewCard>

      <ReviewCard title="Uploaded documents" step={4} onEdit={goToStep} disabled={disabled}>
        {required.map((s) => (
          <Item key={s.id} label={s.title}>
            {documents[s.id] ? (
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 shrink-0 text-success" />
                <span className="truncate">{documents[s.id]!.fileName}</span>
              </span>
            ) : (
              <span className="text-danger">Missing</span>
            )}
          </Item>
        ))}
      </ReviewCard>

      <FormProvider {...form}>
        <FormSection title="Electronic declaration" description="Submission records the typed signatory name and the time of submission." className="mt-5 border-t border-border-soft pt-5" columns={1}>
          <fieldset disabled={disabled} className="m-0 grid min-w-0 gap-3 border-0 p-0">
            <TextField name="signatureName" label="Authorised signatory name" required placeholder="Full name of the person signing" />
            <CheckboxField
              name="consent"
              label="I confirm that I am authorised to submit this application and that the information is accurate to the best of my knowledge."
              description="Matanho may verify identity, ownership, source of funds, source of wealth, tax status, sanctions, PEP and adverse-media information for KYC / AML purposes. A Compliance reviewer makes the final decision on this application."
            />
          </fieldset>
        </FormSection>
      </FormProvider>
    </div>
  );
}
