'use client';

import { usePortal } from '@/components/shell/portal-shell';

/** Shown whenever the topbar currency is not USD: presentation FX is indicative and never a valuation input. */
export function FxNote() {
  const { currency, fxRate } = usePortal();
  if (currency === 'USD') return null;
  return (
    <p className="mb-3 rounded-md border border-border bg-surface px-3 py-2 text-[11.5px] leading-snug text-muted-foreground">
      Amounts are shown in <b className="font-semibold text-ink-2">{currency}</b> at an indicative presentation rate of <span className="num font-semibold text-ink-2">{fxRate}</span> per US$. This is a convenience translation, not a valuation input; the governing record stays in the original currency.
    </p>
  );
}
