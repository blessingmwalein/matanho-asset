import { z } from 'zod';
import {
  CURRENCIES,
  DECLARATION_ANSWERS,
  INVESTOR_TYPES,
  type DocumentCategory,
  type InvestorType,
} from '../enums';

/* ──────────────────────────────────────────────────────────────────────────
 * Public investor onboarding: six steps (see public-onboarding.html)
 *   0 Investor details       1 Ownership & signatories   2 KYC declarations
 *   3 Tax & banking          4 Supporting documents      5 Review & submit
 * The whole application payload lives in InvestorApplication.payload (JSON) while
 * in draft. On submit the API normalises it into BeneficialOwner / AuthorisedSignatory /
 * InvestorDeclaration rows.
 * ────────────────────────────────────────────────────────────────────────── */

export const ONBOARDING_STEPS = [
  { key: 'investor', title: 'Investor', subtitle: 'Profile & relationship', heading: 'Investor details', help: 'Tell us exactly who the investor is and what relationship is being requested.' },
  { key: 'ownership', title: 'Ownership', subtitle: 'Owners & signatories', heading: 'Ownership and authority', help: 'Identify the people who ultimately own, control and are authorised to act for the investor.' },
  { key: 'kyc', title: 'KYC / AML', subtitle: 'Funds & declarations', heading: 'KYC / AML declarations', help: 'Capture the economic purpose, source of funds, source of wealth and risk declarations used in due diligence.' },
  { key: 'taxbank', title: 'Tax & bank', subtitle: 'Tax + funding account', heading: 'Tax and bank verification', help: 'Record FATCA / CRS classification and the verified bank account used for funding.' },
  { key: 'documents', title: 'Evidence', subtitle: 'Supporting documents', heading: 'Supporting evidence', help: 'Upload the original evidence. The original file remains the evidence of record.' },
  { key: 'review', title: 'Review', subtitle: 'Check & submit', heading: 'Review and submit', help: 'Check the application pack, review missing items and make the authorised declaration.' },
] as const;

const req = (label: string, min = 2) => z.string().trim().min(min, `${label} is required`);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');

// Option lists (values double as stored text; mirrors public-onboarding.html)
export const REGULATORY_STATUS_OPTIONS = [
  'Not a regulated financial institution',
  'Regulated financial institution',
  'Pension / retirement arrangement',
  'Government / public institution',
  'Other regulated entity',
] as const;
export const RELATIONSHIP_OPTIONS = [
  'Discretionary managed account',
  'Fund / LP subscription',
  'Segregated mandate',
  'Advisory relationship',
  'Cash / liquidity mandate',
] as const;
export const CLASSIFICATION_OPTIONS = [
  'Institutional / professional investor',
  'Qualified / sophisticated investor',
  'Retail / individual investor',
  'To be confirmed by Compliance',
] as const;
export const OBJECTIVE_OPTIONS = [
  'Long-term capital growth',
  'Income / preservation',
  'Liquidity management',
  'Pension / liability matching',
  'Strategic allocation',
  'Other',
] as const;
export const SOURCE_OF_FUNDS_OPTIONS = [
  'Operating revenue / treasury funds',
  'Investment proceeds',
  'Pension contributions / member assets',
  'Sale of business / asset',
  'Employment / professional income',
  'Inheritance / family wealth',
  'Capital call / investor contributions',
  'Other',
] as const;
export const SOURCE_OF_WEALTH_OPTIONS = [
  'Business / operating activity',
  'Investments / accumulated savings',
  'Pension / institutional assets',
  'Property / asset ownership',
  'Inheritance / family capital',
  'Other',
] as const;
export const TRANSACTION_FREQUENCY_OPTIONS = ['Monthly or less', '2–5 per month', 'Weekly', 'Daily / treasury activity'] as const;
export const FATCA_OPTIONS = [
  'Non-US entity / individual',
  'Participating FFI',
  'Active NFFE',
  'Passive NFFE',
  'US person / US entity',
  'To be confirmed',
] as const;
export const CRS_OPTIONS = [
  'Financial institution',
  'Active non-financial entity',
  'Passive non-financial entity',
  'Individual',
  'To be confirmed',
] as const;

// ── Step 0: investor details ────────────────────────────────────────────────
export const step0Schema = z.object({
  investorType: z.enum(INVESTOR_TYPES, { error: 'Select an investor type' }),
  legalName: req('Legal name'),
  registrationNumber: req('Registration number'),
  country: req('Country'),
  incorporationDate: isoDate.optional().or(z.literal('')),
  regulatoryStatus: z.enum(REGULATORY_STATUS_OPTIONS).optional(),
  regulator: z.string().trim().optional(),
  licenceRef: z.string().trim().optional(),
  website: z.string().trim().optional(),
  taxIdentificationNumber: req('Tax identification number'),
  registeredAddress: req('Registered address', 5),
  contactName: req('Contact person'),
  email: z.email('Enter a valid email address'),
  telephone: req('Telephone', 5),
  investmentObjective: z.enum(OBJECTIVE_OPTIONS, { error: 'Select an investment objective' }),
  relationshipRequested: z.enum(RELATIONSHIP_OPTIONS).default('Discretionary managed account'),
  mandate: z.string().trim().optional(),
  initialInvestment: z.number().min(0).optional(),
  baseCurrency: z.enum(CURRENCIES).default('USD'),
  investorClassification: z.enum(CLASSIFICATION_OPTIONS, { error: 'Select a classification' }),
});

// ── Step 1: ownership & signatories ─────────────────────────────────────────
export const beneficialOwnerSchema = z.object({
  fullName: req('Full name'),
  ownershipPercent: z.number({ error: 'Enter a percentage' }).min(0, 'Min 0%').max(100, 'Max 100%'),
  nationality: req('Nationality'),
  idReference: req('Identification reference'),
  email: z.email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().trim().optional(),
  isController: z.boolean().default(false),
});
export type BeneficialOwnerInput = z.infer<typeof beneficialOwnerSchema>;

export const signatorySchema = z.object({
  fullName: req('Full name'),
  role: req('Role / capacity'),
  email: z.email('Enter a valid email'),
  authority: z.string().trim().optional(),
});
export type SignatoryInput = z.infer<typeof signatorySchema>;

/** Sum of owner percentages (display / validation only; rounded to avoid float noise). */
export function ownershipTotal(owners: ReadonlyArray<{ ownershipPercent?: number | null }>): number {
  const sum = owners.reduce((a, o) => a + (Number(o.ownershipPercent) || 0), 0);
  return Math.round(sum * 10000) / 10000;
}

/** Ownership must total exactly 100% for all non-individual investors; never more than 100%. */
export function ownershipError(investorType: InvestorType | undefined, owners: ReadonlyArray<{ ownershipPercent?: number | null }>): string | null {
  const total = ownershipTotal(owners);
  if (total > 100) return `Ownership totals ${total}% and cannot exceed 100%.`;
  if (investorType && investorType !== 'INDIVIDUAL_HNW' && total !== 100) {
    return `Ownership must total 100% (currently ${total}%). Add controllers with 0% where no ownership applies.`;
  }
  return null;
}

export function makeStep1Schema(investorType?: InvestorType) {
  return z
    .object({
      owners: z.array(beneficialOwnerSchema).min(1, 'Add at least one beneficial owner or controller'),
      signatories: z.array(signatorySchema).min(1, 'Add at least one authorised signatory'),
      ownershipNarrative: z.string().trim().optional(),
      authorityNarrative: z.string().trim().min(5, 'Describe the authority to invest'),
    })
    .superRefine((v, ctx) => {
      const err = ownershipError(investorType, v.owners);
      if (err) ctx.addIssue({ code: 'custom', path: ['owners'], message: err });
    });
}
export const step1Schema = makeStep1Schema();

// ── Step 2: KYC / AML declarations ──────────────────────────────────────────
export const step2Schema = z.object({
  pep: z.enum(DECLARATION_ANSWERS),
  sanctions: z.enum(DECLARATION_ANSWERS),
  adverseMedia: z.enum(DECLARATION_ANSWERS),
  highRiskJurisdiction: z.enum(DECLARATION_ANSWERS),
  sourceOfFunds: z.enum(SOURCE_OF_FUNDS_OPTIONS, { error: 'Select the source of funds' }),
  sourceOfWealth: z.enum(SOURCE_OF_WEALTH_OPTIONS, { error: 'Select the source of wealth' }),
  expectedActivity: req('Expected investment activity', 5),
  transactionFrequency: z.enum(TRANSACTION_FREQUENCY_OPTIONS).default('Monthly or less'),
  riskNarrative: z.string().trim().optional(),
});

// ── Step 3: tax & banking ───────────────────────────────────────────────────
export const step3Schema = z.object({
  taxResidency: req('Tax residency'),
  fatca: z.enum(FATCA_OPTIONS, { error: 'Select a FATCA classification' }),
  crs: z.enum(CRS_OPTIONS, { error: 'Select a CRS classification' }),
  usIndicia: z.boolean().default(false),
  bankName: req('Bank name'),
  bankAccountHolder: req('Account holder'),
  bankAccountNumber: req('Account number', 4),
  bankCurrency: z.enum(CURRENCIES).default('USD'),
  swiftBic: z.string().trim().regex(/^[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?$/, 'Enter a valid SWIFT/BIC (8 or 11 characters)'),
});

// ── Step 5: consent ─────────────────────────────────────────────────────────
export const step5Schema = z.object({
  consent: z.literal(true, { error: 'You must accept the declaration to submit' }),
  signatureName: req('Authorised signatory name'),
});

/** Full application payload (what is stored in InvestorApplication.payload). */
export const applicationPayloadSchema = z.object({
  ...step0Schema.shape,
  owners: z.array(beneficialOwnerSchema),
  signatories: z.array(signatorySchema),
  ownershipNarrative: z.string().optional(),
  authorityNarrative: z.string().optional(),
  ...step2Schema.shape,
  ...step3Schema.shape,
  consent: z.boolean().optional(),
  signatureName: z.string().optional(),
});
export type ApplicationPayload = z.infer<typeof applicationPayloadSchema>;

/** Draft payloads are saved partially: every field optional, unknown keys stripped. */
export const applicationDraftSchema = applicationPayloadSchema.partial();
export type ApplicationDraft = z.infer<typeof applicationDraftSchema>;

export const createDraftSchema = z.object({
  legalName: z.string().trim().min(2, 'Legal name is required'),
  email: z.email('Enter a valid email address'),
  investorType: z.enum(INVESTOR_TYPES).optional(),
});

export const saveDraftSchema = z.object({
  step: z.number().int().min(0).max(5).optional(),
  payload: applicationDraftSchema,
});

// ── Evidence slots ──────────────────────────────────────────────────────────
export interface DocumentSlot {
  id: string;
  title: string;
  help: string;
  required: boolean;
  category: DocumentCategory;
}

export const DOCUMENT_SLOTS: DocumentSlot[] = [
  { id: 'legal', title: 'Legal existence / identity', help: 'Certificate of incorporation, trust deed, fund constitution or government ID.', required: true, category: 'REGISTRATION' },
  { id: 'registry', title: 'Registry / constitutional extract', help: 'Current registry extract, governing document or equivalent legal profile.', required: true, category: 'REGISTRATION' },
  { id: 'ownership', title: 'Ownership / control evidence', help: 'Share register, ownership chart, trustee / beneficiary schedule or controller record.', required: true, category: 'OWNERSHIP_EVIDENCE' },
  { id: 'identity', title: 'Owners / signatories ID', help: 'Passport / national identity evidence for required natural persons.', required: true, category: 'IDENTITY' },
  { id: 'address', title: 'Address evidence', help: 'Registered-office or residential address evidence, as applicable.', required: true, category: 'PROOF_OF_ADDRESS' },
  { id: 'bank', title: 'Bank verification', help: 'Recent bank statement, bank letter or controlled account confirmation.', required: true, category: 'BANK_VERIFICATION' },
  { id: 'funds', title: 'Source-of-funds evidence', help: 'Bank-origin evidence, audited record, transaction evidence or equivalent support.', required: true, category: 'SOURCE_OF_FUNDS' },
  { id: 'tax', title: 'Tax / FATCA / CRS', help: 'Tax residence, W-8/W-9 or self-certification evidence where applicable.', required: true, category: 'TAX' },
  { id: 'authority', title: 'Authority to invest', help: 'Board, trustee, IC or authorised-signatory resolution / mandate.', required: true, category: 'AUTHORITY_TO_INVEST' },
  { id: 'subscription', title: 'Subscription / investment mandate', help: 'Subscription agreement, IPS or investment mandate, if available.', required: false, category: 'ADDITIONAL' },
  { id: 'additional', title: 'Additional supporting evidence', help: 'Any other document relevant to KYC, AML, tax or account opening.', required: false, category: 'ADDITIONAL' },
];

// ── Readiness (deterministic completeness; NOT AI) ──────────────────────────
export type ReadinessState = 'good' | 'warn' | 'bad';
export interface ReadinessCheck {
  key: string;
  label: string;
  detail: string;
  state: ReadinessState;
  step: number; // which wizard step fixes it
}

export interface ReadinessResult {
  score: number; // 0–100
  checks: ReadinessCheck[];
  missing: ReadinessCheck[];
  canSubmit: boolean;
}

/**
 * Computes application completeness from the (possibly partial) payload and the set of
 * uploaded slot ids. Used by the public form (live readiness panel), by the API (submit gate)
 * and by staff review (missing information).
 */
export function computeReadiness(payload: Partial<ApplicationPayload> | undefined | null, uploadedSlots: readonly string[]): ReadinessResult {
  const p = payload ?? {};
  const checks: ReadinessCheck[] = [];
  const add = (c: ReadinessCheck) => checks.push(c);

  const s0 = step0Schema.safeParse(p);
  add({
    key: 'investor',
    label: 'Investor details',
    detail: s0.success ? 'Identity, contact and classification complete' : `${s0.error.issues.length} field(s) incomplete`,
    state: s0.success ? 'good' : 'bad',
    step: 0,
  });

  const s1 = makeStep1Schema(p.investorType).safeParse({
    owners: p.owners ?? [],
    signatories: p.signatories ?? [],
    ownershipNarrative: p.ownershipNarrative,
    authorityNarrative: p.authorityNarrative ?? '',
  });
  const total = ownershipTotal(p.owners ?? []);
  add({
    key: 'ownership',
    label: 'Beneficial ownership & signatories',
    detail: s1.success
      ? `${p.owners?.length ?? 0} owner(s) · ${total}% · ${p.signatories?.length ?? 0} signatory(ies)`
      : (s1.error.issues[0]?.message ?? 'Incomplete'),
    state: s1.success ? 'good' : 'bad',
    step: 1,
  });

  const s2 = step2Schema.safeParse(p);
  const flagged = (['pep', 'sanctions', 'adverseMedia', 'highRiskJurisdiction'] as const).filter((k) => p[k] && p[k] !== 'NO');
  add({
    key: 'kyc',
    label: 'KYC / AML declarations',
    detail: s2.success
      ? flagged.length
        ? `Complete · ${flagged.length} declaration(s) flagged for enhanced review`
        : 'Complete · no adverse declarations'
      : `${s2.error.issues.length} field(s) incomplete`,
    state: s2.success ? (flagged.length ? 'warn' : 'good') : 'bad',
    step: 2,
  });

  const s3 = step3Schema.safeParse(p);
  add({
    key: 'taxbank',
    label: 'Tax & bank',
    detail: s3.success ? 'Tax classification and funding account captured' : `${s3.error.issues.length} field(s) incomplete`,
    state: s3.success ? 'good' : 'bad',
    step: 3,
  });

  const required = DOCUMENT_SLOTS.filter((d) => d.required);
  const missingDocs = required.filter((d) => !uploadedSlots.includes(d.id));
  add({
    key: 'documents',
    label: 'Supporting documents',
    detail: missingDocs.length ? `${required.length - missingDocs.length}/${required.length} required uploaded · missing: ${missingDocs.map((d) => d.title).join(', ')}` : `All ${required.length} required documents uploaded`,
    state: missingDocs.length ? 'bad' : 'good',
    step: 4,
  });

  const s5 = step5Schema.safeParse({ consent: p.consent, signatureName: p.signatureName ?? '' });
  add({
    key: 'consent',
    label: 'Declaration & consent',
    detail: s5.success ? `Signed by ${p.signatureName}` : 'Declaration not yet accepted',
    state: s5.success ? 'good' : 'bad',
    step: 5,
  });

  const good = checks.filter((c) => c.state !== 'bad').length;
  const missing = checks.filter((c) => c.state === 'bad');
  return {
    score: Math.round((good / checks.length) * 100),
    checks,
    missing,
    canSubmit: missing.length === 0,
  };
}

/** Internal review flags derived from declarations (flags only, not external screening). */
export function deriveRiskFlags(p: Partial<ApplicationPayload>): string[] {
  const flags: string[] = [];
  if (p.pep && p.pep !== 'NO') flags.push('PEP declared / possible');
  if (p.sanctions && p.sanctions !== 'NO') flags.push('Sanctions exposure declared / possible');
  if (p.adverseMedia && p.adverseMedia !== 'NO') flags.push('Adverse media / legal matters declared');
  if (p.highRiskJurisdiction && p.highRiskJurisdiction !== 'NO') flags.push('Enhanced-risk jurisdiction nexus');
  if (p.usIndicia) flags.push('US indicia present (FATCA)');
  if (p.fatca === 'US person / US entity') flags.push('US person / entity');
  if (p.investorClassification === 'To be confirmed by Compliance') flags.push('Classification to be confirmed');
  return flags;
}
