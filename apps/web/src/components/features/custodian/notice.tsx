import * as React from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  info: 'border-primary-soft-border bg-primary-soft',
  warning: 'border-[#ecd9b0] bg-warning-soft',
  danger: 'border-[#e6c3c9] bg-danger-soft',
  success: 'border-[#bfe0d3] bg-success-soft',
  neutral: 'border-border bg-surface-2',
} as const;

/** Flat inline notice (no icons-in-circles, no gradients): used for duplicates, status banners and gate errors. */
export function Notice({
  tone = 'info',
  title,
  children,
  actions,
  className,
  role,
}: {
  tone?: keyof typeof TONES;
  title?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  role?: 'alert' | 'status';
}) {
  return (
    <div role={role} className={cn('rounded-lg border px-3.5 py-3 text-[12.5px] leading-relaxed', TONES[tone], className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          {title && <div className="font-semibold text-foreground">{title}</div>}
          {children && <div className={cn('text-ink-2', title && 'mt-0.5')}>{children}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
