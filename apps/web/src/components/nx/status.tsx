import * as React from 'react';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  COMPANY_SUBMISSION_LABELS,
  COMPANY_SUBMISSION_TONES,
  DOCUMENT_STATUS_TONES,
  KYC_STATUS_LABELS,
  KYC_STATUS_TONES,
  RECON_STATUS_LABELS,
  RECON_STATUS_TONES,
  TRANSACTION_STATUS_TONES,
  titleCase,
  type Tone,
} from '@nexus/shared';
import { cn, TONE_DOT, TONE_SOFT, TONE_TEXT } from '@/lib/utils';

/**
 * Status indicator: a small coloured dot plus a plain label. Deliberately NOT a filled pill,
 * so tables stay quiet and colour only appears where it carries workflow or financial meaning.
 */
export function StatusIndicator({ tone = 'neutral', children, className, pulse }: { tone?: Tone; children: React.ReactNode; className?: string; pulse?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium', TONE_TEXT[tone] === TONE_TEXT.neutral ? 'text-ink-2' : 'text-foreground', className)}>
      <span className="relative grid size-2 place-items-center">
        {pulse && <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-50', TONE_DOT[tone])} />}
        <span className={cn('relative inline-block size-[7px] rounded-full', TONE_DOT[tone])} />
      </span>
      {children}
    </span>
  );
}

/** Rare, high-signal tag (use sparingly: counts, "New", environment). */
export function Tag({ tone = 'neutral', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex h-[20px] items-center rounded-[5px] px-1.5 text-[10.5px] font-bold uppercase tracking-wide', TONE_SOFT[tone], className)}>{children}</span>;
}

export function ApplicationStatus({ status }: { status: keyof typeof APPLICATION_STATUS_LABELS }) {
  return <StatusIndicator tone={APPLICATION_STATUS_TONES[status]}>{APPLICATION_STATUS_LABELS[status]}</StatusIndicator>;
}
export function KycStatus({ status }: { status: keyof typeof KYC_STATUS_LABELS }) {
  return <StatusIndicator tone={KYC_STATUS_TONES[status]}>{KYC_STATUS_LABELS[status]}</StatusIndicator>;
}
export function ReconStatusLabel({ status }: { status: keyof typeof RECON_STATUS_LABELS }) {
  return <StatusIndicator tone={RECON_STATUS_TONES[status]}>{RECON_STATUS_LABELS[status]}</StatusIndicator>;
}
export function CompanySubmissionStatus({ status }: { status: keyof typeof COMPANY_SUBMISSION_LABELS }) {
  return <StatusIndicator tone={COMPANY_SUBMISSION_TONES[status]}>{COMPANY_SUBMISSION_LABELS[status]}</StatusIndicator>;
}
export function DocumentStatus({ status }: { status: keyof typeof DOCUMENT_STATUS_TONES }) {
  return <StatusIndicator tone={DOCUMENT_STATUS_TONES[status]}>{titleCase(status)}</StatusIndicator>;
}
export function TransactionStatus({ status }: { status: keyof typeof TRANSACTION_STATUS_TONES }) {
  return <StatusIndicator tone={TRANSACTION_STATUS_TONES[status]}>{titleCase(status)}</StatusIndicator>;
}

/** Generic mapper for simple string statuses (ACTIVE, CLOSED …). */
const GENERIC: Record<string, Tone> = {
  ACTIVE: 'success',
  OPEN: 'warning',
  CLOSED: 'neutral',
  ON_HOLD: 'warning',
  SUSPENDED: 'warning',
  DISABLED: 'neutral',
  INVITED: 'info',
  ISSUED: 'warning',
  FUNDED: 'success',
  PAID: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
  DRAFT: 'neutral',
  CONFIRMED: 'success',
  COMPLETED: 'success',
  RESOLVED: 'success',
  ACKNOWLEDGED: 'info',
};
export function SimpleStatus({ value }: { value: string }) {
  return <StatusIndicator tone={GENERIC[value] ?? 'neutral'}>{titleCase(value)}</StatusIndicator>;
}
