/** Presentation-only FX (indicative, NOT a valuation input). Mirrors client-portal.html. */
export const PRESENTATION_FX: Record<string, number> = { USD: 1, ZAR: 17.9, ZWG: 26.8 };

export const PERFORMANCE_PERIODS = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'] as const;
export type PerformancePeriod = (typeof PERFORMANCE_PERIODS)[number];

export const UPLOAD_LIMITS = {
  maxBytes: 15 * 1024 * 1024,
  allowedMime: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/html',
  ],
  accept: '.pdf,.png,.jpg,.jpeg,.csv,.txt,.xls,.xlsx,.doc,.docx',
} as const;

export const SIMPLIFIED_VALUATION_NOTICE =
  'MVP valuation model: market value = quantity × current price. No accruals, fees, FX translation or time-weighted performance.';

export const DEFAULT_PAGE_SIZE = 20;

/** Header used by the web client for safe retries; honoured by the API IdempotencyInterceptor. */
export const IDEMPOTENCY_HEADER = 'idempotency-key';
