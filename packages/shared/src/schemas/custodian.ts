import { z } from 'zod';
import { CURRENCIES, SIDES } from '../enums';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');
const isoDateTime = z.string().min(10, 'Enter the execution date and time');

/** Execution submission (JSON body). Mirrors the "Trade execution" tab of custodian-portal.html. */
export const executionSchema = z.object({
  tradeReference: z.string().trim().min(3, 'Trade reference is required'),
  executedAt: isoDateTime,
  custodianAccountId: z.string().min(1, 'Select the account / portfolio'),
  ticker: z.string().trim().min(1, 'Security / ticker is required').transform((s) => s.toUpperCase()),
  side: z.enum(SIDES),
  quantity: z.number({ error: 'Quantity is required' }).positive('Quantity must be greater than zero'),
  price: z.number({ error: 'Execution price is required' }).positive('Price must be greater than zero'),
  currency: z.enum(CURRENCIES).default('USD'),
  settlementDate: isoDate,
  broker: z.string().trim().min(2, 'Executing broker is required'),
  note: z.string().trim().optional(),
});
export type ExecutionInput = z.infer<typeof executionSchema>;

/** A correction supersedes a prior execution (new version; the original is kept). */
export const executionCorrectionSchema = executionSchema.extend({
  correctionReason: z.string().trim().min(5, 'Explain the correction'),
});
export type ExecutionCorrectionInput = z.infer<typeof executionCorrectionSchema>;

/**
 * Day-end submission. Sent as multipart/form-data (fields as strings + the file), so the
 * API validates these with coercion; the web form uses `dayEndFormSchema` (numbers).
 */
export const dayEndFormSchema = z.object({
  statementDate: isoDate,
  custodianAccountId: z.string().min(1, 'Select the custodian account'),
  closingCash: z.number({ error: 'Closing cash is required' }),
  currency: z.enum(CURRENCIES).default('USD'),
  holdingsMarketValue: z.number({ error: 'Holdings market value is required' }).min(0),
  tradeCount: z.number({ error: 'Trade count is required' }).int().min(0),
  controlNote: z.string().trim().optional(),
});
export type DayEndFormInput = z.infer<typeof dayEndFormSchema>;

export const dayEndApiSchema = z.object({
  statementDate: isoDate,
  custodianAccountId: z.string().min(1),
  closingCash: z.coerce.number(),
  currency: z.enum(CURRENCIES).default('USD'),
  holdingsMarketValue: z.coerce.number().min(0),
  tradeCount: z.coerce.number().int().min(0),
  controlNote: z.string().trim().optional(),
});
