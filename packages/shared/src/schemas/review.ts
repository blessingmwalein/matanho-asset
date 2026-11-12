import { z } from 'zod';
import { RISK_RATINGS, ROLE_KEYS } from '../enums';

// ── onboarding review (staff) ───────────────────────────────────────────────
export const addNoteSchema = z.object({ body: z.string().trim().min(2, 'Write a note') });
export const requestInfoSchema = z.object({
  message: z.string().trim().min(5, 'Describe the information required'),
  step: z.number().int().min(0).max(5).optional(),
});
export const approveApplicationSchema = z.object({
  note: z.string().trim().optional(),
  riskRating: z.enum(RISK_RATINGS).default('MEDIUM'),
  relationshipManagerId: z.string().optional(),
});
export const rejectApplicationSchema = z.object({ reason: z.string().trim().min(5, 'A reason is required') });
export const reopenApplicationSchema = z.object({ reason: z.string().trim().min(5, 'A reason is required') });
export const applicantResponseSchema = z.object({ message: z.string().trim().optional() });

// ── reconciliation ──────────────────────────────────────────────────────────
export const runReconciliationSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export const resolveExceptionSchema = z.object({
  note: z.string().trim().min(10, 'Add a resolution note (at least 10 characters)'),
});
export const addItemNoteSchema = z.object({ note: z.string().trim().min(3) });

// ── company reporting review ────────────────────────────────────────────────
export const raiseQuestionSchema = z.object({
  question: z.string().trim().min(5, 'Write the question'),
  requirementKey: z.string().optional(),
});
export const answerQuestionSchema = z.object({ answer: z.string().trim().min(2, 'Write an answer') });
export const requestCorrectionsSchema = z.object({ message: z.string().trim().min(5, 'Describe the corrections required') });
export const acceptSubmissionSchema = z.object({ note: z.string().trim().optional() });

// ── reports / documents ─────────────────────────────────────────────────────
export const generateStatementSchema = z.object({
  portfolioId: z.string().min(1, 'Select a portfolio'),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date'),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export const approveDocumentSchema = z.object({ note: z.string().trim().optional() });

// ── capital ─────────────────────────────────────────────────────────────────
export const acknowledgeCapitalCallSchema = z.object({ note: z.string().trim().optional() });
export const serviceRequestSchema = z.object({
  subject: z.string().trim().min(3, 'Add a subject'),
  message: z.string().trim().min(5, 'Write your message'),
});

// ── auth & admin ────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(2),
  organisationId: z.string().min(1),
  roleKey: z.enum(ROLE_KEYS),
  password: z.string().min(10, 'Use at least 10 characters'),
});
export const updateUserSchema = z.object({
  name: z.string().trim().min(2).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  roleKey: z.enum(ROLE_KEYS).optional(),
  password: z.string().min(10).optional(),
});
export const updateRoleSchema = z.object({
  permissions: z.array(z.string()).min(0),
  description: z.string().trim().optional(),
});
