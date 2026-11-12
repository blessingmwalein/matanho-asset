import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import {
  applicationDraftSchema,
  applicationPayloadSchema,
  CLASSIFICATION_OPTIONS,
  computeReadiness,
  CRS_OPTIONS,
  CURRENCIES,
  DECLARATION_ANSWERS,
  deriveRiskFlags,
  DOCUMENT_SLOTS,
  FATCA_OPTIONS,
  INVESTOR_TYPES,
  makeStep1Schema,
  OBJECTIVE_OPTIONS,
  REGULATORY_STATUS_OPTIONS,
  RELATIONSHIP_OPTIONS,
  SOURCE_OF_FUNDS_OPTIONS,
  SOURCE_OF_WEALTH_OPTIONS,
  step0Schema,
  step2Schema,
  step3Schema,
  step5Schema,
  TRANSACTION_FREQUENCY_OPTIONS,
  UPLOAD_LIMITS,
  type ApplicationPayload,
  type InvestorType,
} from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReferenceService } from '../../common/references/reference.service';
import { StorageService } from '../../common/storage/storage.service';
import { DocumentsService, type IncomingFile } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';

const EDITABLE = ['DRAFT', 'INFORMATION_REQUESTED'] as const;
const ACTOR_NAME = 'Applicant';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/* ── Lenient draft schema ────────────────────────────────────────────────────
 * A draft is saved while the applicant is still typing, so values are only type-checked
 * (strict business validation happens on submit). The set of ALLOWED keys comes from the shared
 * `applicationDraftSchema`; unknown keys are stripped. Defaults are deliberately NOT applied
 * so a partial save can never overwrite earlier answers with default values. */
const str = z.string().max(4000);
const choice = <T extends readonly [string, ...string[]]>(values: T) => z.union([z.enum(values), z.literal('')]);
const ownerRow = z.object({
  fullName: str.optional(),
  ownershipPercent: z.number().min(0).max(100).nullable().optional(),
  nationality: str.optional(),
  idReference: str.optional(),
  email: str.optional(),
  phone: str.optional(),
  isController: z.boolean().optional(),
});
const signatoryRow = z.object({ fullName: str.optional(), role: str.optional(), email: str.optional(), authority: str.optional() });

const lenientDraft = z.object({
  investorType: choice(INVESTOR_TYPES),
  legalName: str,
  registrationNumber: str,
  country: str,
  incorporationDate: str,
  regulatoryStatus: choice(REGULATORY_STATUS_OPTIONS),
  regulator: str,
  licenceRef: str,
  website: str,
  taxIdentificationNumber: str,
  registeredAddress: str,
  contactName: str,
  email: str,
  telephone: str,
  investmentObjective: choice(OBJECTIVE_OPTIONS),
  relationshipRequested: choice(RELATIONSHIP_OPTIONS),
  mandate: str,
  initialInvestment: z.number().min(0).max(1e13),
  baseCurrency: choice(CURRENCIES),
  investorClassification: choice(CLASSIFICATION_OPTIONS),
  owners: z.array(ownerRow).max(25),
  signatories: z.array(signatoryRow).max(25),
  ownershipNarrative: str,
  authorityNarrative: str,
  pep: choice(DECLARATION_ANSWERS),
  sanctions: choice(DECLARATION_ANSWERS),
  adverseMedia: choice(DECLARATION_ANSWERS),
  highRiskJurisdiction: choice(DECLARATION_ANSWERS),
  sourceOfFunds: choice(SOURCE_OF_FUNDS_OPTIONS),
  sourceOfWealth: choice(SOURCE_OF_WEALTH_OPTIONS),
  expectedActivity: str,
  transactionFrequency: choice(TRANSACTION_FREQUENCY_OPTIONS),
  riskNarrative: str,
  taxResidency: str,
  fatca: choice(FATCA_OPTIONS),
  crs: choice(CRS_OPTIONS),
  usIndicia: z.boolean(),
  bankName: str,
  bankAccountHolder: str,
  bankAccountNumber: str,
  bankCurrency: choice(CURRENCIES),
  swiftBic: str,
  consent: z.boolean(),
  signatureName: str,
});
const ALLOWED_KEYS = new Set(Object.keys(applicationDraftSchema.shape));

/**
 * Returns the cleaned partial, the keys the client explicitly cleared (`null`), and the keys that were
 * rejected as the wrong type. A bad value is dropped on its own so it can never block the rest of an autosave.
 */
export function sanitiseDraft(input: Record<string, unknown>): { set: Record<string, unknown>; unset: string[]; rejected: Record<string, string> } {
  const unset: string[] = [];
  const set: Record<string, unknown> = {};
  const rejected: Record<string, string> = {};
  const shape = lenientDraft.shape as Record<string, z.ZodType>;
  for (const [k, v] of Object.entries(input)) {
    if (!ALLOWED_KEYS.has(k) || !shape[k]) continue;
    if (v === null) {
      unset.push(k);
      continue;
    }
    if (v === undefined) continue;
    const r = shape[k]!.safeParse(v);
    if (r.success) set[k] = r.data;
    else rejected[k] = r.error.issues[0]?.message ?? 'Invalid value';
  }
  return { set, unset, rejected };
}

@Injectable()
export class PublicOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refs: ReferenceService,
    private readonly docs: DocumentsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  // ── auth helper ─────────────────────────────────────────────────────────
  /** Loads the application only when the resume token matches (constant-time). Anything else is a 404. */
  private async authorise(reference: string, token: string | undefined) {
    const app = await this.prisma.investorApplication.findUnique({ where: { reference } });
    const given = Buffer.from(hashToken(token ?? ''), 'hex');
    const stored = Buffer.from(app?.resumeTokenHash ?? hashToken('no-such-application'), 'hex');
    const ok = given.length === stored.length && timingSafeEqual(given, stored);
    if (!app || !app.resumeTokenHash || !token || !ok) throw new NotFoundException('Application not found');
    return app;
  }

  private assertEditable(status: string) {
    if (!(EDITABLE as readonly string[]).includes(status)) {
      throw new ConflictException('This application has been submitted and can no longer be edited here.');
    }
  }

  // ── create ──────────────────────────────────────────────────────────────
  async createDraft(input: { legalName: string; email: string; investorType?: InvestorType }, ip?: string) {
    const resumeToken = randomBytes(24).toString('base64url');
    const reference = await this.refs.application();
    const payload: Record<string, unknown> = { legalName: input.legalName, email: input.email };
    if (input.investorType) payload.investorType = input.investorType;
    const app = await this.prisma.investorApplication.create({
      data: {
        reference,
        status: 'DRAFT',
        step: 0,
        resumeTokenHash: hashToken(resumeToken),
        payload: payload as Prisma.InputJsonValue,
        legalName: input.legalName,
        investorType: input.investorType ?? null,
        contactEmail: input.email,
      },
    });
    await this.audit.record({ entityType: 'InvestorApplication', entityId: app.id, action: 'APPLICATION_DRAFT_CREATED', after: { reference, legalName: input.legalName }, ip });
    return { reference, resumeToken };
  }

  // ── read ────────────────────────────────────────────────────────────────
  private async view(app: Awaited<ReturnType<PublicOnboardingService['authorise']>>) {
    const [docRows, notes] = await Promise.all([
      this.prisma.document.findMany({
        where: { applicationId: app.id, requirementKey: { not: null } },
        include: { versions: { orderBy: { versionNo: 'desc' } } },
      }),
      this.prisma.applicationNote.findMany({ where: { applicationId: app.id, kind: 'INFO_REQUEST' }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);

    const documents: Record<string, unknown> = {};
    for (const d of docRows) {
      const latest = d.versions[0];
      if (!d.requirementKey || !latest) continue;
      documents[d.requirementKey] = {
        documentId: d.id,
        fileName: latest.fileName,
        mimeType: latest.mimeType,
        sizeBytes: latest.sizeBytes,
        uploadedAt: latest.createdAt,
        versionNo: latest.versionNo,
        versions: d.versions.map((v) => ({ versionNo: v.versionNo, fileName: v.fileName, sizeBytes: v.sizeBytes, uploadedAt: v.createdAt })),
      };
    }

    const payload = (app.payload ?? {}) as Partial<ApplicationPayload>;
    const readiness = computeReadiness(payload, Object.keys(documents));
    return {
      reference: app.reference,
      status: app.status,
      step: app.step,
      payload,
      documents,
      requestedInfo: notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt, authorName: n.authorName })),
      readiness,
      submittedAt: app.submittedAt,
      lastSavedAt: app.lastSavedAt,
    };
  }

  async get(reference: string, token: string | undefined) {
    return this.view(await this.authorise(reference, token));
  }

  // ── save draft ──────────────────────────────────────────────────────────
  async save(reference: string, token: string | undefined, body: { step?: number; payload: Record<string, unknown> }) {
    const app = await this.authorise(reference, token);
    this.assertEditable(app.status);
    const { set, unset, rejected } = sanitiseDraft(body.payload);

    const merged: Record<string, unknown> = { ...((app.payload ?? {}) as Record<string, unknown>), ...set };
    for (const k of unset) delete merged[k];
    if (JSON.stringify(merged).length > 100_000) throw new BadRequestException('The application is too large to save');

    const m = merged as Partial<ApplicationPayload>;
    const data: Prisma.InvestorApplicationUpdateInput = {
      payload: merged as Prisma.InputJsonValue,
      lastSavedAt: new Date(),
      ...(body.step !== undefined ? { step: body.step } : {}),
    };
    if (m.legalName) data.legalName = m.legalName;
    if (m.investorType && (INVESTOR_TYPES as readonly string[]).includes(m.investorType)) data.investorType = m.investorType;
    if (m.country) data.country = m.country;
    if (m.contactName) data.contactName = m.contactName;
    if (m.email) data.contactEmail = m.email;

    const updated = await this.prisma.investorApplication.update({ where: { id: app.id }, data });
    return { ok: true, savedAt: updated.lastSavedAt, step: updated.step, rejected };
  }

  // ── documents ───────────────────────────────────────────────────────────
  async uploadDocument(reference: string, token: string | undefined, slotId: string, file: IncomingFile | undefined) {
    const app = await this.authorise(reference, token);
    this.assertEditable(app.status);
    const slot = DOCUMENT_SLOTS.find((s) => s.id === slotId);
    if (!slot) throw new BadRequestException({ statusCode: 400, message: 'Unknown document slot', errors: { slot: 'Choose a valid document slot' } });
    if (!file) throw new BadRequestException('A file is required');
    if (file.mimetype === 'text/html') throw new BadRequestException('HTML uploads are not accepted');
    if (file.size > UPLOAD_LIMITS.maxBytes) throw new BadRequestException('File exceeds the upload limit');

    const existing = await this.prisma.document.findFirst({ where: { applicationId: app.id, requirementKey: slot.id }, select: { id: true } });
    let documentId: string;
    if (existing) {
      await this.docs.addVersion(existing.id, file, { name: ACTOR_NAME }, 'Replaced by applicant');
      documentId = existing.id;
    } else {
      const doc = await this.docs.create(
        file,
        { title: slot.title, category: slot.category, applicationId: app.id, requirementKey: slot.id, audience: 'INTERNAL', status: 'UPLOADED' },
        { name: ACTOR_NAME },
      );
      documentId = doc.id;
    }
    await this.prisma.investorApplication.update({ where: { id: app.id }, data: { lastSavedAt: new Date() } });

    const view = await this.view(app);
    return { ok: true, slot: slot.id, document: (view.documents as Record<string, unknown>)[slot.id], readiness: view.readiness, documentId };
  }

  /** Bytes of the applicant's OWN upload (token-authorised). Anything not attached to this application is a 404. */
  async documentContent(reference: string, token: string | undefined, documentId: string, versionNo?: number) {
    const app = await this.authorise(reference, token);
    const doc = await this.prisma.document.findFirst({ where: { id: documentId, applicationId: app.id } });
    if (!doc) throw new NotFoundException('Document not found');
    const version = await this.prisma.documentVersion.findUnique({
      where: { documentId_versionNo: { documentId: doc.id, versionNo: versionNo ?? doc.currentVersionNo } },
    });
    if (!version) throw new NotFoundException('Document not found');
    const buffer = await this.storage.adapterFor(version.storageDriver as 'local' | 's3' | 'db').get(version.storageKey, version.id);
    await this.audit.record({ entityType: 'Document', entityId: doc.id, action: 'DOCUMENT_VIEWED', metadata: { by: 'applicant', reference, versionNo: version.versionNo } });
    return { buffer, fileName: version.fileName, mimeType: version.mimeType, sha256: version.sha256 };
  }

  // ── submit ──────────────────────────────────────────────────────────────
  async submit(reference: string, token: string | undefined) {
    const app = await this.authorise(reference, token);
    const done = (a: { reference: string; status: string; submittedAt: Date | null }) => ({ reference: a.reference, status: a.status, submittedAt: a.submittedAt });

    // Idempotent: anything past DRAFT / INFORMATION_REQUESTED has already been submitted.
    if (!(EDITABLE as readonly string[]).includes(app.status)) return done(app);

    const payload = (app.payload ?? {}) as Partial<ApplicationPayload>;
    const docRows = await this.prisma.document.findMany({ where: { applicationId: app.id, requirementKey: { not: null } }, select: { requirementKey: true } });
    const uploaded = docRows.map((d) => d.requirementKey as string);
    const readiness = computeReadiness(payload, uploaded);

    const errors: Record<string, string> = {};
    const collect = (prefix: string, r: { success: boolean; error?: z.ZodError }) => {
      if (r.success || !r.error) return;
      for (const issue of r.error.issues) {
        const key = `${prefix}${issue.path.length ? `.${issue.path.join('.')}` : ''}`;
        if (!errors[key]) errors[key] = issue.message;
      }
    };
    collect('step0', step0Schema.safeParse(payload));
    collect('step1', makeStep1Schema(payload.investorType).safeParse({ owners: payload.owners ?? [], signatories: payload.signatories ?? [], ownershipNarrative: payload.ownershipNarrative, authorityNarrative: payload.authorityNarrative ?? '' }));
    collect('step2', step2Schema.safeParse(payload));
    collect('step3', step3Schema.safeParse(payload));
    collect('step5', step5Schema.safeParse({ consent: payload.consent, signatureName: payload.signatureName ?? '' }));
    for (const m of readiness.missing) if (!errors[m.key]) errors[m.key] = m.detail;
    if (!readiness.canSubmit || Object.keys(errors).length) {
      throw new BadRequestException({ statusCode: 400, message: 'The application is incomplete. Complete the missing items before submitting.', errors });
    }

    // Safe to read as complete: re-parse into the full typed payload
    const full = applicationPayloadSchema.parse(payload);
    const resubmission = app.status === 'INFORMATION_REQUESTED';
    const nextStatus = resubmission ? 'RESUBMITTED' : 'SUBMITTED';
    const riskFlags = deriveRiskFlags(full);
    const now = new Date();

    const result = await this.prisma.$transaction(
      async (tx) => {
        // Atomic claim: only one concurrent submit can move the status; others fall through to the idempotent path.
        const claim = await tx.investorApplication.updateMany({
          where: { id: app.id, status: { in: ['DRAFT', 'INFORMATION_REQUESTED'] } },
          data: {
            status: nextStatus,
            riskFlags,
            consentAt: now,
            signatureName: full.signatureName ?? '',
            submittedAt: now,
            lastSavedAt: now,
            step: 5,
            ...(resubmission ? { version: { increment: 1 } } : {}),
          },
        });
        if (claim.count === 0) return null;

        await tx.beneficialOwner.deleteMany({ where: { applicationId: app.id, investorId: null } });
        await tx.authorisedSignatory.deleteMany({ where: { applicationId: app.id, investorId: null } });
        await tx.beneficialOwner.createMany({
          data: full.owners.map((o) => ({
            applicationId: app.id,
            fullName: o.fullName,
            ownershipPercent: new Prisma.Decimal(o.ownershipPercent),
            nationality: o.nationality,
            idReference: o.idReference,
            email: o.email || null,
            phone: o.phone || null,
            isController: o.isController ?? false,
          })),
        });
        await tx.authorisedSignatory.createMany({
          data: full.signatories.map((s) => ({ applicationId: app.id, fullName: s.fullName, role: s.role, email: s.email, authority: s.authority || null })),
        });

        const declaration = {
          pep: full.pep,
          sanctions: full.sanctions,
          adverseMedia: full.adverseMedia,
          highRiskJurisdiction: full.highRiskJurisdiction,
          sourceOfFunds: full.sourceOfFunds,
          sourceOfWealth: full.sourceOfWealth,
          expectedActivity: full.expectedActivity,
          transactionFrequency: full.transactionFrequency ?? null,
          riskNarrative: full.riskNarrative || null,
          taxResidency: full.taxResidency,
          fatca: full.fatca,
          crs: full.crs,
          usIndicia: full.usIndicia ?? false,
          bankName: full.bankName,
          bankAccountHolder: full.bankAccountHolder,
          bankAccountNumber: full.bankAccountNumber,
          bankCurrency: full.bankCurrency,
          swiftBic: full.swiftBic,
          consentGiven: true,
          consentAt: now,
          signatureName: full.signatureName ?? '',
          riskFlags,
        };
        await tx.investorDeclaration.upsert({
          where: { applicationId: app.id },
          create: { applicationId: app.id, ...declaration },
          update: declaration,
        });

        await tx.investorApplication.update({
          where: { id: app.id },
          data: { legalName: full.legalName, investorType: full.investorType, country: full.country, contactName: full.contactName, contactEmail: full.email },
        });

        if (resubmission) {
          await tx.applicationNote.create({
            data: { applicationId: app.id, authorId: null, authorName: full.contactName || ACTOR_NAME, kind: 'APPLICANT_RESPONSE', body: 'The applicant updated the application and resubmitted it for review.' },
          });
        }

        await this.audit.record(
          {
            entityType: 'InvestorApplication',
            entityId: app.id,
            action: resubmission ? 'APPLICATION_RESUBMITTED' : 'APPLICATION_SUBMITTED',
            before: { status: app.status },
            after: { status: nextStatus, reference: app.reference, legalName: full.legalName, riskFlags },
          },
          tx,
        );
        await this.notifications.notifyStaff(
          {
            type: 'APPLICATION_SUBMITTED',
            title: resubmission ? 'Investor application resubmitted' : 'New investor application submitted',
            body: `${full.legalName} (${app.reference}) is ready for review.`,
            link: `/internal/onboarding/${app.id}`,
            entityType: 'InvestorApplication',
            entityId: app.id,
          },
          tx,
        );
        return { reference: app.reference, status: nextStatus, submittedAt: now };
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    if (result) return result;
    // Lost the race to a concurrent identical submit: return what it produced.
    const fresh = await this.prisma.investorApplication.findUniqueOrThrow({ where: { id: app.id } });
    return done(fresh);
  }
}
