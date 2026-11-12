import { z } from 'zod';
import {
  ACCOUNT_TYPES,
  ASSET_CLASSES,
  CURRENCIES,
  PORTFOLIO_STATUSES,
  PORTFOLIO_TYPES,
  SIDES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from '../enums';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');
const positive = (label: string) => z.number({ error: `${label} is required` }).positive(`${label} must be greater than zero`);

// ── portfolios ──────────────────────────────────────────────────────────────
export const createPortfolioSchema = z.object({
  investorId: z.string().min(1, 'Select an investor'),
  name: z.string().trim().min(2, 'Portfolio name is required'),
  type: z.enum(PORTFOLIO_TYPES),
  baseCurrency: z.enum(CURRENCIES).default('USD'),
  managerId: z.string().optional(),
  benchmark: z.string().trim().optional(),
  inceptionDate: isoDate,
  description: z.string().trim().optional(),
  accountId: z.string().optional(),
});
export type CreatePortfolioInput = z.infer<typeof createPortfolioSchema>;

export const updatePortfolioSchema = createPortfolioSchema
  .pick({ name: true, managerId: true, benchmark: true, description: true })
  .partial()
  .extend({ status: z.enum(PORTFOLIO_STATUSES).optional() });
export type UpdatePortfolioInput = z.infer<typeof updatePortfolioSchema>;

export const createAccountSchema = z.object({
  investorId: z.string().min(1),
  name: z.string().trim().min(2),
  type: z.enum(ACCOUNT_TYPES).default('MANDATE'),
  baseCurrency: z.enum(CURRENCIES).default('USD'),
});

// ── securities ──────────────────────────────────────────────────────────────
export const createSecuritySchema = z.object({
  ticker: z.string().trim().min(1, 'Ticker is required').max(24).transform((s) => s.toUpperCase()),
  name: z.string().trim().min(2, 'Security name is required'),
  assetClass: z.enum(ASSET_CLASSES),
  currency: z.enum(CURRENCIES).default('USD'),
  lastPrice: z.number().min(0).default(0),
  isin: z.string().trim().optional(),
  exchange: z.string().trim().optional(),
});
export type CreateSecurityInput = z.infer<typeof createSecuritySchema>;

// ── holdings (manual / draft) ───────────────────────────────────────────────
export const createHoldingSchema = z.object({
  securityId: z.string().optional(),
  /** Alternatively create the security inline */
  newSecurity: createSecuritySchema.optional(),
  quantity: positive('Quantity'),
  averageCost: z.number().min(0, 'Average cost cannot be negative'),
  currentPrice: z.number().min(0, 'Current price cannot be negative'),
  valuationDate: isoDate,
  priceSource: z.string().trim().min(2, 'Record the price source').default('Manual entry'),
});
export type CreateHoldingInput = z.infer<typeof createHoldingSchema>;

export const updateHoldingSchema = z.object({
  quantity: positive('Quantity').optional(),
  averageCost: z.number().min(0).optional(),
  currentPrice: z.number().min(0).optional(),
  valuationDate: isoDate.optional(),
  priceSource: z.string().trim().min(2).optional(),
});
export type UpdateHoldingInput = z.infer<typeof updateHoldingSchema>;

// ── investment activity ─────────────────────────────────────────────────────
export const recordTransactionSchema = z
  .object({
    portfolioId: z.string().min(1, 'Select a portfolio'),
    type: z.enum(TRANSACTION_TYPES).default('TRADE'),
    side: z.enum(SIDES).optional(),
    securityId: z.string().optional(),
    quantity: z.number().min(0).optional(),
    price: z.number().min(0).optional(),
    /** Used for non-trade cash events (CASH_IN, CASH_OUT, DIVIDEND, FEE) */
    amount: z.number().positive().optional(),
    currency: z.enum(CURRENCIES).default('USD'),
    tradeDate: isoDate,
    settlementDate: isoDate.optional(),
    tradeReference: z.string().trim().optional(),
    broker: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    status: z.enum(TRANSACTION_STATUSES).default('COMPLETED'),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'TRADE') {
      if (!v.side) ctx.addIssue({ code: 'custom', path: ['side'], message: 'Select buy or sell' });
      if (!v.securityId) ctx.addIssue({ code: 'custom', path: ['securityId'], message: 'Select a security' });
      if (!v.quantity || v.quantity <= 0) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Quantity must be greater than zero' });
      if (v.price === undefined || v.price <= 0) ctx.addIssue({ code: 'custom', path: ['price'], message: 'Price must be greater than zero' });
    } else if (!v.amount) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Amount is required' });
    }
  });
export type RecordTransactionInput = z.infer<typeof recordTransactionSchema>;

/** Shared list-query shape for every paginated register. */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  q: z.string().trim().optional(),
  sort: z.string().trim().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
