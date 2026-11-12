import type { z } from 'zod';

/** Map a zod error from a shared schema onto react-hook-form field errors (first message per path). */
export function setZodErrors(error: z.ZodError, setError: (name: never, e: { type: string; message: string }) => void) {
  const seen = new Set<string>();
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (!path || seen.has(path)) continue;
    seen.add(path);
    setError(path as never, { type: 'validate', message: issue.message });
  }
}

export const PRICE_SOURCES = ['Manual entry', 'Custodian statement', 'Exchange closing price', 'Broker quote', 'Administrator NAV', 'Bloomberg / Reuters'];
export const BROKERS = ['Imara Edwards Securities', 'First Equity Securities', 'Standard Bank Stockbrokers', 'Interactive Brokers', 'Morgan Stanley Wealth'];

export const todayIso = () => new Date().toISOString().slice(0, 10);
