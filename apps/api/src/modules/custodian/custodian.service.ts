import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { z } from 'zod';
import { executionCorrectionSchema, executionSchema, type ListQuery, type ReconStatus } from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/auth/request-context';
import { dateOnly, toISODate } from '../../common/decimal';
import { pageArgs, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReferenceService } from '../../common/references/reference.service';
import { DocumentsService, type IncomingFile } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';

export type ExecutionBody = z.infer<typeof executionSchema>;
export type CorrectionBody = z.infer<typeof executionCorrectionSchema>;
export type SubmissionKind = 'EXECUTION' | 'DAY_END';

export interface SubmissionListQuery extends ListQuery {
  kind?: SubmissionKind;
  reconStatus?: ReconStatus;
  accountId?: string;
  custodianId?: string;
  from?: string;
  to?: string;
  includeSuperseded?: 'true' | 'false';
}

export interface DayEndBody {
  statementDate: string;
  custodianAccountId: string;
  closingCash: number;
  currency: string;
  holdingsMarketValue: number;
  tradeCount: number;
  controlNote?: string;
  correction?: boolean;
  correctionReason?: string;
}

const ACCOUNT_INCLUDE = {
  custodianAccount: {
    include: {
      portfolio: { select: { id: true, ref: true, name: true } },
      custodianOrg: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.CustodianExecutionInclude;

type ExecutionRow = Prisma.CustodianExecutionGetPayload<{ include: typeof ACCOUNT_INCLUDE }>;
type DayEndRow = Prisma.CustodianDayEndSubmissionGetPayload<{ include: typeof ACCOUNT_INCLUDE }>;

/** Accepts "2026-09-04", "2026-09-04T10:30" (treated as UTC) or a full ISO instant. */
export function parseInstant(s: string): Date | null {
  const v = s.trim();
  let iso = v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) iso = `${v}T00:00:00Z`;
  else if (!/([zZ]|[+-]\d{2}:?\d{2})$/.test(v)) iso = `${v}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

function validationError(errors: Record<string, string>): never {
  throw new BadRequestException({ statusCode: 400, message: 'Validation failed', errors });
}

function mapExecution(e: ExecutionRow) {
  return {
    id: e.id,
    kind: 'EXECUTION' as const,
    ref: e.ref,
    tradeReference: e.tradeReference,
    account: { id: e.custodianAccount.id, accountNumber: e.custodianAccount.accountNumber, name: e.custodianAccount.name },
    portfolio: e.custodianAccount.portfolio,
    custodian: e.custodianAccount.custodianOrg,
    date: e.executedAt.toISOString(),
    ticker: e.ticker,
    side: e.side,
    quantity: e.quantity,
    price: e.price,
    currency: e.currency,
    settlementDate: toISODate(e.settlementDate),
    broker: e.broker,
    note: e.note,
    closingCash: null,
    holdingsMarketValue: null,
    tradeCount: null,
    version: e.version,
    isCurrent: e.isCurrent,
    status: e.isCurrent ? ('SUBMITTED' as const) : ('SUPERSEDED' as const),
    fileName: null as string | null,
    documentId: null as string | null,
    reconStatus: e.reconStatus,
    submittedByName: e.submittedByName,
    createdAt: e.createdAt.toISOString(),
  };
}

function mapDayEnd(d: DayEndRow) {
  return {
    id: d.id,
    kind: 'DAY_END' as const,
    ref: d.ref,
    tradeReference: null as string | null,
    account: { id: d.custodianAccount.id, accountNumber: d.custodianAccount.accountNumber, name: d.custodianAccount.name },
    portfolio: d.custodianAccount.portfolio,
    custodian: d.custodianAccount.custodianOrg,
    date: toISODate(d.statementDate),
    ticker: null as string | null,
    side: null as string | null,
    quantity: null as Prisma.Decimal | null,
    price: null as Prisma.Decimal | null,
    currency: d.currency,
    settlementDate: null as string | null,
    broker: null as string | null,
    note: d.controlNote,
    closingCash: d.closingCash,
    holdingsMarketValue: d.holdingsMarketValue,
    tradeCount: d.tradeCount,
    version: d.version,
    isCurrent: d.isCurrent,
    status: d.isCurrent ? ('SUBMITTED' as const) : ('SUPERSEDED' as const),
    fileName: d.fileName,
    documentId: d.documentId,
    reconStatus: d.reconStatus,
    submittedByName: d.submittedByName,
    createdAt: d.createdAt.toISOString(),
  };
}
export type SubmissionRow = ReturnType<typeof mapExecution> | ReturnType<typeof mapDayEnd>;

@Injectable()
export class CustodianService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly refs: ReferenceService,
    private readonly docs: DocumentsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── reference data for the portal forms ───────────────────────────────────
  async accounts(ctx: RequestContext) {
    const rows = await this.prisma.custodianAccount.findMany({
      where: { custodianOrgId: ctx.orgId },
      orderBy: { accountNumber: 'asc' },
      include: { portfolio: { select: { id: true, ref: true, name: true } } },
    });
    return rows.map((a) => ({
      id: a.id,
      accountNumber: a.accountNumber,
      name: a.name,
      currency: a.currency,
      status: a.status,
      portfolio: a.portfolio,
    }));
  }

  /** Security master list for the ticker picker (public reference data, no holdings or prices). */
  async securities() {
    const rows = await this.prisma.security.findMany({
      where: { isActive: true, assetClass: { not: 'CASH' } },
      orderBy: { ticker: 'asc' },
      select: { ticker: true, name: true, currency: true },
    });
    return rows;
  }

  async summary(ctx: RequestContext) {
    const where = { isCurrent: true, custodianAccount: { custodianOrgId: ctx.orgId } };
    const [executions, dayEnds, pendingEx, pendingDe, recent] = await Promise.all([
      this.prisma.custodianExecution.count({ where }),
      this.prisma.custodianDayEndSubmission.count({ where }),
      this.prisma.custodianExecution.count({ where: { ...where, reconStatus: 'NOT_STARTED' } }),
      this.prisma.custodianDayEndSubmission.count({ where: { ...where, reconStatus: 'NOT_STARTED' } }),
      this.list(ctx.orgId, { page: 1, pageSize: 6, order: 'desc', sort: 'createdAt' }),
    ]);
    return { executions, dayEnds, awaitingReconciliation: pendingEx + pendingDe, recent: recent.data };
  }

  // ── account scope ─────────────────────────────────────────────────────────
  /** An account of another custodian → 403 + audit event; unknown account → 404. */
  private async ownAccount(ctx: RequestContext, accountId: string, attempted: string) {
    const acct = await this.prisma.custodianAccount.findUnique({
      where: { id: accountId },
      include: { portfolio: { select: { id: true, ref: true, name: true } } },
    });
    if (!acct) throw new NotFoundException('Account not found');
    if (acct.custodianOrgId !== ctx.orgId) {
      await this.audit.record({
        ctx,
        entityType: 'CustodianAccount',
        entityId: acct.id,
        action: 'CUSTODIAN_CROSS_ACCOUNT_DENIED',
        metadata: { attempted, accountNumber: acct.accountNumber, actorName: ctx.name },
      });
      throw new ForbiddenException('This account belongs to another custodian. The attempt has been recorded.');
    }
    return acct;
  }

  // ── executions ────────────────────────────────────────────────────────────
  async submitExecution(ctx: RequestContext, body: ExecutionBody) {
    const acct = await this.ownAccount(ctx, body.custodianAccountId, 'submit execution');
    const executedAt = parseInstant(body.executedAt);
    if (!executedAt) validationError({ executedAt: 'Enter a valid execution date and time' });
    if (body.settlementDate < toISODate(executedAt)) validationError({ settlementDate: 'Settlement date cannot be before the execution date' });

    const existing = await this.prisma.custodianExecution.findFirst({
      where: { custodianAccountId: acct.id, tradeReference: body.tradeReference },
      orderBy: { version: 'desc' },
    });
    if (existing) this.duplicate(body.tradeReference, acct.accountNumber, existing);

    const security = await this.prisma.security.findUnique({ where: { ticker: body.ticker }, select: { id: true } });
    const rawPayload = { ...body, executedAt: executedAt.toISOString(), source: 'CUSTODIAN_PORTAL', submittedAt: new Date().toISOString() };

    try {
      return await this.prisma.$transaction(async (tx) => {
        const ref = await this.refs.execution(tx);
        const row = await tx.custodianExecution.create({
          data: {
            ref,
            custodianAccountId: acct.id,
            tradeReference: body.tradeReference,
            version: 1,
            isCurrent: true,
            executedAt,
            ticker: body.ticker,
            securityId: security?.id ?? null,
            side: body.side,
            quantity: new Prisma.Decimal(body.quantity),
            price: new Prisma.Decimal(body.price),
            currency: body.currency,
            settlementDate: dateOnly(body.settlementDate),
            broker: body.broker,
            note: body.note || null,
            reconStatus: 'NOT_STARTED',
            rawPayload: rawPayload as Prisma.InputJsonValue,
            submittedById: ctx.userId,
            submittedByName: ctx.name,
          },
          include: ACCOUNT_INCLUDE,
        });
        await this.audit.record(
          {
            ctx,
            entityType: 'CustodianExecution',
            entityId: row.id,
            action: 'CUSTODIAN_EXECUTION_SUBMITTED',
            after: { ref, tradeReference: row.tradeReference, version: 1, account: acct.accountNumber, ticker: row.ticker, side: row.side, quantity: body.quantity, price: body.price },
            metadata: { actorName: ctx.name, custodian: ctx.orgName },
          },
          tx,
        );
        await this.notifications.notifyStaff(
          {
            type: 'CUSTODIAN_SUBMISSION',
            title: 'Custodian submission received',
            body: `${ref}: ${body.side} ${body.quantity.toLocaleString('en-US')} ${body.ticker} on ${acct.accountNumber} from ${ctx.orgName}`,
            link: '/internal/operations/reconciliation',
            entityType: 'CustodianExecution',
            entityId: row.id,
          },
          tx,
        );
        return mapExecution(row);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        this.duplicate(body.tradeReference, acct.accountNumber, null);
      }
      throw e;
    }
  }

  private duplicate(tradeReference: string, accountNumber: string, existing: { ref: string; version: number } | null): never {
    const message = existing
      ? `Trade reference ${tradeReference} was already submitted for account ${accountNumber} (${existing.ref}, version ${existing.version}). Submit a correction to supersede it; the original is retained.`
      : `Trade reference ${tradeReference} was already submitted for account ${accountNumber}. Submit a correction to supersede it.`;
    throw new ConflictException({ statusCode: 409, message, errors: { tradeReference: message } });
  }

  /** Corrections never edit or delete the original: a new version supersedes it (UAT CST-003). */
  async correctExecution(ctx: RequestContext, id: string, body: CorrectionBody) {
    const original = await this.prisma.custodianExecution.findFirst({
      where: { id, custodianAccount: { custodianOrgId: ctx.orgId } },
      include: { custodianAccount: true, reconItem: { include: { exceptions: true } } },
    });
    if (!original) throw new NotFoundException('Submission not found');
    if (!original.isCurrent) throw new ConflictException('This version has already been superseded by a later correction.');
    if (body.custodianAccountId !== original.custodianAccountId) validationError({ custodianAccountId: 'A correction must stay on the original account' });
    if (body.tradeReference !== original.tradeReference) validationError({ tradeReference: 'A correction must keep the original trade reference' });

    const executedAt = parseInstant(body.executedAt);
    if (!executedAt) validationError({ executedAt: 'Enter a valid execution date and time' });
    if (body.settlementDate < toISODate(executedAt)) validationError({ settlementDate: 'Settlement date cannot be before the execution date' });

    const security = await this.prisma.security.findUnique({ where: { ticker: body.ticker }, select: { id: true } });
    const { correctionReason, ...values } = body;
    const rawPayload = { ...values, correctionReason, executedAt: executedAt.toISOString(), source: 'CUSTODIAN_PORTAL', supersedes: original.ref, submittedAt: new Date().toISOString() };

    return this.prisma.$transaction(
      async (tx) => {
        await tx.custodianExecution.update({ where: { id: original.id }, data: { isCurrent: false } });
        const ref = await this.refs.execution(tx);
        const row = await tx.custodianExecution.create({
          data: {
            ref,
            custodianAccountId: original.custodianAccountId,
            tradeReference: original.tradeReference,
            version: original.version + 1,
            isCurrent: true,
            supersedesId: original.id,
            correctionReason,
            executedAt,
            ticker: body.ticker,
            securityId: security?.id ?? null,
            side: body.side,
            quantity: new Prisma.Decimal(body.quantity),
            price: new Prisma.Decimal(body.price),
            currency: body.currency,
            settlementDate: dateOnly(body.settlementDate),
            broker: body.broker,
            note: body.note || null,
            reconStatus: 'NOT_STARTED',
            rawPayload: rawPayload as Prisma.InputJsonValue,
            submittedById: ctx.userId,
            submittedByName: ctx.name,
          },
          include: ACCOUNT_INCLUDE,
        });

        // The superseded record's reconciliation item is kept as history; its internal link is released
        // so the corrected version can be matched to the same internal trade, and its open exceptions are
        // closed as superseded (they no longer describe a live custodian record).
        if (original.reconItem) {
          await tx.reconciliationItem.update({ where: { id: original.reconItem.id }, data: { transactionId: null } });
          await tx.reconciliationException.updateMany({
            where: { itemId: original.reconItem.id, status: 'OPEN' },
            data: {
              status: 'RESOLVED',
              resolutionNote: `Superseded by corrected submission ${ref} (version ${row.version}). Re-run reconciliation.`,
              resolvedByName: 'System (superseded)',
              resolvedAt: new Date(),
            },
          });
        }

        await this.audit.record(
          {
            ctx,
            entityType: 'CustodianExecution',
            entityId: row.id,
            action: 'CUSTODIAN_EXECUTION_CORRECTED',
            before: { id: original.id, ref: original.ref, version: original.version, quantity: original.quantity, price: original.price, isCurrent: true },
            after: { ref, version: row.version, quantity: body.quantity, price: body.price, isCurrent: true, correctionReason },
            metadata: { actorName: ctx.name, supersedes: original.ref },
          },
          tx,
        );
        await this.notifications.notifyStaff(
          {
            type: 'CUSTODIAN_SUBMISSION',
            title: 'Custodian correction received',
            body: `${ref} supersedes ${original.ref} on ${original.custodianAccount.accountNumber}: ${correctionReason}`,
            link: '/internal/operations/reconciliation',
            entityType: 'CustodianExecution',
            entityId: row.id,
          },
          tx,
        );
        return mapExecution(row);
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  }

  // ── day-end ───────────────────────────────────────────────────────────────
  async submitDayEnd(ctx: RequestContext, body: DayEndBody, file?: IncomingFile) {
    const acct = await this.ownAccount(ctx, body.custodianAccountId, 'submit day-end');
    const statementDate = dateOnly(body.statementDate);
    if (Number.isNaN(statementDate.getTime())) validationError({ statementDate: 'Use a valid date' });
    if (file && (file.mimetype === 'text/html' || /\.html?$/i.test(file.originalname))) {
      validationError({ file: 'HTML files are not accepted. Upload CSV, Excel, PDF or text.' });
    }

    const existing = await this.prisma.custodianDayEndSubmission.findFirst({
      where: { custodianAccountId: acct.id, statementDate },
      orderBy: { version: 'desc' },
    });
    if (existing && !body.correction) {
      const message = `A day-end package for ${acct.accountNumber} dated ${body.statementDate} was already submitted (${existing.ref}, version ${existing.version}). Submit it as a correction to supersede it; the original is retained.`;
      throw new ConflictException({ statusCode: 409, message, errors: { statementDate: message } });
    }
    if (existing && !(body.correctionReason || body.controlNote)) {
      validationError({ correctionReason: 'Explain the correction' });
    }

    let documentId: string | null = null;
    let fileName: string | null = null;
    let fileSha256: string | null = null;
    if (file && file.buffer?.length) {
      const doc = await this.docs.create(
        file,
        {
          title: `Day-end file ${acct.accountNumber} ${body.statementDate}`,
          category: 'DAY_END_FILE',
          audience: 'CUSTODIAN',
          ownerOrgId: ctx.orgId,
          portfolioId: acct.portfolioId,
          reportDate: statementDate,
        },
        { ctx },
      );
      documentId = doc.id;
      fileName = file.originalname;
      fileSha256 = createHash('sha256').update(file.buffer).digest('hex');
    }

    const rawPayload = {
      statementDate: body.statementDate,
      custodianAccountId: acct.id,
      accountNumber: acct.accountNumber,
      closingCash: body.closingCash,
      currency: body.currency,
      holdingsMarketValue: body.holdingsMarketValue,
      tradeCount: body.tradeCount,
      controlNote: body.controlNote ?? null,
      correctionReason: body.correctionReason ?? null,
      fileName,
      fileSha256,
      source: 'CUSTODIAN_PORTAL',
      submittedAt: new Date().toISOString(),
    };

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if (existing) {
            await tx.custodianDayEndSubmission.update({ where: { id: existing.id }, data: { isCurrent: false } });
            const item = await tx.reconciliationItem.findUnique({ where: { dayEndId: existing.id } });
            if (item) {
              await tx.reconciliationException.updateMany({
                where: { itemId: item.id, status: 'OPEN' },
                data: { status: 'RESOLVED', resolutionNote: 'Superseded by a corrected day-end submission. Re-run reconciliation.', resolvedByName: 'System (superseded)', resolvedAt: new Date() },
              });
            }
          }
          const ref = await this.refs.dayEnd(tx);
          const row = await tx.custodianDayEndSubmission.create({
            data: {
              ref,
              custodianAccountId: acct.id,
              statementDate,
              version: (existing?.version ?? 0) + 1,
              isCurrent: true,
              closingCash: new Prisma.Decimal(body.closingCash),
              currency: body.currency,
              holdingsMarketValue: new Prisma.Decimal(body.holdingsMarketValue),
              tradeCount: body.tradeCount,
              documentId,
              fileName,
              fileSha256,
              controlNote: body.controlNote || body.correctionReason || null,
              reconStatus: 'NOT_STARTED',
              rawPayload: rawPayload as Prisma.InputJsonValue,
              submittedById: ctx.userId,
              submittedByName: ctx.name,
            },
            include: ACCOUNT_INCLUDE,
          });
          await this.audit.record(
            {
              ctx,
              entityType: 'CustodianDayEnd',
              entityId: row.id,
              action: existing ? 'CUSTODIAN_DAY_END_CORRECTED' : 'CUSTODIAN_DAY_END_SUBMITTED',
              before: existing ? { id: existing.id, ref: existing.ref, version: existing.version, closingCash: existing.closingCash, holdingsMarketValue: existing.holdingsMarketValue, tradeCount: existing.tradeCount } : undefined,
              after: { ref, version: row.version, account: acct.accountNumber, statementDate: body.statementDate, closingCash: body.closingCash, holdingsMarketValue: body.holdingsMarketValue, tradeCount: body.tradeCount, fileName, fileSha256 },
              metadata: { actorName: ctx.name, custodian: ctx.orgName },
            },
            tx,
          );
          await this.notifications.notifyStaff(
            {
              type: 'CUSTODIAN_SUBMISSION',
              title: existing ? 'Custodian day-end correction received' : 'Custodian submission received',
              body: `${ref}: day-end package for ${acct.accountNumber} (${body.statementDate}) from ${ctx.orgName}`,
              link: '/internal/operations/reconciliation',
              entityType: 'CustodianDayEnd',
              entityId: row.id,
            },
            tx,
          );
          return mapDayEnd(row);
        },
        { timeout: 20_000, maxWait: 10_000 },
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException({ statusCode: 409, message: 'A day-end package for this account and date was just submitted. Refresh and submit a correction if needed.' });
      }
      throw e;
    }
  }

  // ── registers (custodian: own org, internal: all) ─────────────────────────
  /** `scopeOrgId` is set for custodian users (their own org) and undefined for internal staff. */
  async list(scopeOrgId: string | undefined, q: SubmissionListQuery) {
    const orgFilter = scopeOrgId ?? q.custodianId;
    const accountWhere: Prisma.CustodianAccountWhereInput = orgFilter ? { custodianOrgId: orgFilter } : {};
    const current = q.includeSuperseded === 'true' ? {} : { isCurrent: true };
    const search = q.q?.trim();
    const from = q.from ? dateOnly(q.from) : undefined;
    const toExclusive = q.to ? new Date(dateOnly(q.to).getTime() + 86400000) : undefined;

    const exWhere: Prisma.CustodianExecutionWhereInput = {
      ...current,
      custodianAccount: accountWhere,
      ...(q.reconStatus ? { reconStatus: q.reconStatus } : {}),
      ...(q.accountId ? { custodianAccountId: q.accountId } : {}),
      ...(from || toExclusive ? { executedAt: { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } } : {}),
      ...(search
        ? {
            OR: [
              { ref: { contains: search, mode: 'insensitive' } },
              { tradeReference: { contains: search, mode: 'insensitive' } },
              { ticker: { contains: search, mode: 'insensitive' } },
              { broker: { contains: search, mode: 'insensitive' } },
              { submittedByName: { contains: search, mode: 'insensitive' } },
              { custodianAccount: { accountNumber: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const deWhere: Prisma.CustodianDayEndSubmissionWhereInput = {
      ...current,
      custodianAccount: accountWhere,
      ...(q.reconStatus ? { reconStatus: q.reconStatus } : {}),
      ...(q.accountId ? { custodianAccountId: q.accountId } : {}),
      ...(from || toExclusive ? { statementDate: { ...(from ? { gte: from } : {}), ...(q.to ? { lte: dateOnly(q.to) } : {}) } } : {}),
      ...(search
        ? {
            OR: [
              { ref: { contains: search, mode: 'insensitive' } },
              { fileName: { contains: search, mode: 'insensitive' } },
              { submittedByName: { contains: search, mode: 'insensitive' } },
              { custodianAccount: { accountNumber: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const dir = q.order;
    const exOrder = ((): Prisma.CustodianExecutionOrderByWithRelationInput => {
      switch (q.sort) {
        case 'date': return { executedAt: dir };
        case 'ref': return { ref: dir };
        case 'reconStatus': return { reconStatus: dir };
        case 'account': return { custodianAccount: { accountNumber: dir } };
        case 'submittedBy': return { submittedByName: dir };
        default: return { createdAt: dir };
      }
    })();
    const deOrder = ((): Prisma.CustodianDayEndSubmissionOrderByWithRelationInput => {
      switch (q.sort) {
        case 'date': return { statementDate: dir };
        case 'ref': return { ref: dir };
        case 'reconStatus': return { reconStatus: dir };
        case 'account': return { custodianAccount: { accountNumber: dir } };
        case 'submittedBy': return { submittedByName: dir };
        default: return { createdAt: dir };
      }
    })();

    const need = q.page * q.pageSize;
    const wantEx = q.kind !== 'DAY_END';
    const wantDe = q.kind !== 'EXECUTION';
    const [exRows, deRows, exTotal, deTotal] = await Promise.all([
      wantEx ? this.prisma.custodianExecution.findMany({ where: exWhere, orderBy: [exOrder, { createdAt: 'desc' }], take: need, include: ACCOUNT_INCLUDE }) : [],
      wantDe ? this.prisma.custodianDayEndSubmission.findMany({ where: deWhere, orderBy: [deOrder, { createdAt: 'desc' }], take: need, include: ACCOUNT_INCLUDE }) : [],
      wantEx ? this.prisma.custodianExecution.count({ where: exWhere }) : 0,
      wantDe ? this.prisma.custodianDayEndSubmission.count({ where: deWhere }) : 0,
    ]);

    const merged: SubmissionRow[] = [...exRows.map(mapExecution), ...deRows.map(mapDayEnd)];
    const sortValue = (r: SubmissionRow): string | number => {
      switch (q.sort) {
        case 'date': return r.date;
        case 'ref': return r.ref;
        case 'reconStatus': return r.reconStatus;
        case 'account': return r.account.accountNumber;
        case 'submittedBy': return r.submittedByName ?? '';
        default: return r.createdAt;
      }
    };
    const sign = dir === 'asc' ? 1 : -1;
    merged.sort((a, b) => {
      const av = sortValue(a);
      const bv = sortValue(b);
      if (av < bv) return -1 * sign;
      if (av > bv) return 1 * sign;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
    const { skip, take } = pageArgs(q);
    return paged(merged.slice(skip, skip + take), exTotal + deTotal, q);
  }

  /** Filter dropdown options for the internal register. */
  async options() {
    const [custodians, accounts] = await Promise.all([
      this.prisma.organisation.findMany({ where: { type: 'CUSTODIAN' }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      this.prisma.custodianAccount.findMany({ orderBy: { accountNumber: 'asc' }, select: { id: true, accountNumber: true, name: true, custodianOrgId: true } }),
    ]);
    return { custodians, accounts };
  }

  // ── detail ────────────────────────────────────────────────────────────────
  private normaliseKind(kind: string): SubmissionKind {
    const k = kind.toUpperCase().replace(/-/g, '_');
    if (k === 'EXECUTION' || k === 'EXECUTIONS') return 'EXECUTION';
    if (k === 'DAY_END' || k === 'DAYEND') return 'DAY_END';
    throw new NotFoundException('Submission not found');
  }

  /** `scopeOrgId` set for custodian users; other organisations' ids resolve to 404. */
  async detail(scopeOrgId: string | undefined, kindParam: string, id: string) {
    const kind = this.normaliseKind(kindParam);
    const accountScope: Prisma.CustodianAccountWhereInput = scopeOrgId ? { custodianOrgId: scopeOrgId } : {};

    if (kind === 'EXECUTION') {
      const row = await this.prisma.custodianExecution.findFirst({
        where: { id, custodianAccount: accountScope },
        include: { ...ACCOUNT_INCLUDE, reconItem: { include: { exceptions: true, batch: { select: { ref: true, businessDate: true } } } } },
      });
      if (!row) throw new NotFoundException('Submission not found');
      const versions = await this.prisma.custodianExecution.findMany({
        where: { custodianAccountId: row.custodianAccountId, tradeReference: row.tradeReference },
        orderBy: { version: 'desc' },
        select: { id: true, ref: true, version: true, isCurrent: true, correctionReason: true, quantity: true, price: true, currency: true, settlementDate: true, executedAt: true, submittedByName: true, createdAt: true, reconStatus: true },
      });
      return {
        ...mapExecution(row),
        rawPayload: row.rawPayload,
        correctionReason: row.correctionReason,
        supersedesId: row.supersedesId,
        versions: versions.map((v) => ({ ...v, settlementDate: toISODate(v.settlementDate), executedAt: v.executedAt.toISOString(), createdAt: v.createdAt.toISOString() })),
        document: null,
        reconItem: this.reconSummary(row.reconItem),
      };
    }

    const row = await this.prisma.custodianDayEndSubmission.findFirst({
      where: { id, custodianAccount: accountScope },
      include: { ...ACCOUNT_INCLUDE, reconItem: { include: { exceptions: true, batch: { select: { ref: true, businessDate: true } } } } },
    });
    if (!row) throw new NotFoundException('Submission not found');
    const [versions, document] = await Promise.all([
      this.prisma.custodianDayEndSubmission.findMany({
        where: { custodianAccountId: row.custodianAccountId, statementDate: row.statementDate },
        orderBy: { version: 'desc' },
        select: { id: true, ref: true, version: true, isCurrent: true, closingCash: true, holdingsMarketValue: true, tradeCount: true, currency: true, controlNote: true, fileName: true, submittedByName: true, createdAt: true, reconStatus: true },
      }),
      row.documentId
        ? this.prisma.document.findUnique({
            where: { id: row.documentId },
            select: { id: true, ref: true, title: true, currentVersionNo: true, versions: { orderBy: { versionNo: 'desc' }, take: 1, select: { mimeType: true, sizeBytes: true, sha256: true, fileName: true, versionNo: true } } },
          })
        : null,
    ]);
    const dv = document?.versions[0];
    return {
      ...mapDayEnd(row),
      rawPayload: row.rawPayload,
      fileSha256: row.fileSha256,
      versions: versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })),
      document: document && dv ? { id: document.id, ref: document.ref, title: document.title, fileName: dv.fileName, mimeType: dv.mimeType, sizeBytes: dv.sizeBytes, sha256: dv.sha256, version: dv.versionNo } : null,
      reconItem: this.reconSummary(row.reconItem),
    };
  }

  private reconSummary(
    item: { id: string; status: string; exceptions: Array<{ status: string }>; batch: { ref: string; businessDate: Date } } | null,
  ) {
    if (!item) return null;
    return {
      id: item.id,
      status: item.status,
      batchRef: item.batch.ref,
      businessDate: toISODate(item.batch.businessDate),
      exceptionCount: item.exceptions.length,
      openExceptions: item.exceptions.filter((e) => e.status === 'OPEN').length,
    };
  }
}
