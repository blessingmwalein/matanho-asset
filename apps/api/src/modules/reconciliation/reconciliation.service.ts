import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RECON_STATUS_LABELS, RECON_STATUS_TONES, type ListQuery, type ReconItemKind, type ReconStatus } from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/auth/request-context';
import { dateOnly, toISODate } from '../../common/decimal';
import { buildOrderBy, pageArgs, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface ItemListQuery extends ListQuery {
  status?: ReconStatus;
  kind?: ReconItemKind;
  portfolioId?: string;
  date?: string;
  includeSuperseded?: 'true' | 'false';
}

/** Items whose custodian record is still the current version (superseded history is hidden by default). */
const LIVE_ITEM: Prisma.ReconciliationItemWhereInput = {
  AND: [{ OR: [{ executionId: null }, { execution: { isCurrent: true } }] }, { OR: [{ dayEndId: null }, { dayEnd: { isCurrent: true } }] }],
};

const LIST_INCLUDE = {
  batch: { select: { id: true, ref: true, businessDate: true } },
  portfolio: { select: { id: true, ref: true, name: true } },
  execution: { select: { id: true, ref: true, executedAt: true, isCurrent: true, version: true, custodianAccount: { select: { accountNumber: true, custodianOrg: { select: { name: true } } } } } },
  dayEnd: { select: { id: true, ref: true, statementDate: true, isCurrent: true, version: true, custodianAccount: { select: { accountNumber: true, custodianOrg: { select: { name: true } } } } } },
  transaction: { select: { id: true, ref: true, tradeDate: true } },
  exceptions: { select: { type: true, status: true } },
} satisfies Prisma.ReconciliationItemInclude;
type ListRow = Prisma.ReconciliationItemGetPayload<{ include: typeof LIST_INCLUDE }>;

function mapRow(i: ListRow) {
  const sub = i.execution ?? i.dayEnd;
  const open = i.exceptions.filter((e) => e.status === 'OPEN');
  const date = i.execution ? toISODate(i.execution.executedAt) : i.dayEnd ? toISODate(i.dayEnd.statementDate) : i.transaction ? toISODate(i.transaction.tradeDate) : null;
  return {
    id: i.id,
    kind: i.kind,
    status: i.status,
    batch: { id: i.batch.id, ref: i.batch.ref, businessDate: toISODate(i.batch.businessDate) },
    portfolio: i.portfolio,
    tradeReference: i.tradeReference,
    ticker: i.ticker,
    quantity: i.quantity,
    price: i.price,
    currency: i.currency,
    date,
    custodianRef: sub?.ref ?? null,
    custodian: sub?.custodianAccount.custodianOrg.name ?? null,
    accountNumber: sub?.custodianAccount.accountNumber ?? null,
    transactionRef: i.transaction?.ref ?? null,
    exceptionCount: i.exceptions.length,
    openExceptions: open.length,
    openExceptionTypes: [...new Set(open.map((e) => e.type))],
    superseded: sub ? !sub.isCurrent : false,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

const TIMELINE_TITLES: Record<string, { title: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  CUSTODIAN_EXECUTION_SUBMITTED: { title: 'Submitted by the custodian', tone: 'info' },
  CUSTODIAN_EXECUTION_CORRECTED: { title: 'Custodian submitted a correction (new version)', tone: 'warning' },
  CUSTODIAN_DAY_END_SUBMITTED: { title: 'Day-end package submitted by the custodian', tone: 'info' },
  CUSTODIAN_DAY_END_CORRECTED: { title: 'Custodian submitted a corrected day-end package', tone: 'warning' },
  RECON_EXCEPTION_RESOLVED: { title: 'Exception resolved', tone: 'success' },
  RECON_NOTE_ADDED: { title: 'Note added', tone: 'neutral' },
  RECON_ORPHAN_CLEARED: { title: 'Internal-only item cleared', tone: 'neutral' },
};

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── summary ─────────────────────────────────────────────────────────────────
  async summary() {
    const [grouped, openExceptions, notStartedEx, notStartedDe, lastRunEvent] = await Promise.all([
      this.prisma.reconciliationItem.groupBy({ by: ['status'], where: LIVE_ITEM, _count: { _all: true } }),
      this.prisma.reconciliationException.count({ where: { status: 'OPEN', item: LIVE_ITEM } }),
      this.prisma.custodianExecution.count({ where: { isCurrent: true, reconStatus: 'NOT_STARTED' } }),
      this.prisma.custodianDayEndSubmission.count({ where: { isCurrent: true, reconStatus: 'NOT_STARTED' } }),
      this.prisma.auditEvent.findFirst({ where: { action: 'RECONCILIATION_RUN' }, orderBy: { createdAt: 'desc' } }),
    ]);
    const counts: Record<ReconStatus, number> = { NOT_STARTED: notStartedEx + notStartedDe, MATCHED: 0, UNMATCHED: 0, DIFFERENCE: 0, PENDING_REVIEW: 0, RESOLVED: 0 };
    for (const g of grouped) counts[g.status as ReconStatus] = g._count._all;

    let lastRun: null | { batchRef: string | null; businessDate: string | null; at: string; by: string | null; processed: number | null } = null;
    if (lastRunEvent) {
      const meta = (lastRunEvent.metadata ?? {}) as Record<string, unknown>;
      lastRun = {
        batchRef: (meta.batchRef as string) ?? null,
        businessDate: (meta.businessDate as string) ?? null,
        at: lastRunEvent.createdAt.toISOString(),
        by: (meta.actorName as string) ?? lastRunEvent.actorEmail ?? null,
        processed: typeof meta.processed === 'number' ? meta.processed : null,
      };
    }
    return {
      counts,
      totalItems: Object.entries(counts).filter(([k]) => k !== 'NOT_STARTED').reduce((a, [, v]) => a + v, 0),
      openExceptions,
      unreconciledSubmissions: { executions: notStartedEx, dayEnds: notStartedDe, total: notStartedEx + notStartedDe },
      lastRun,
    };
  }

  // ── list ────────────────────────────────────────────────────────────────────
  async list(q: ItemListQuery) {
    const search = q.q?.trim();
    const where: Prisma.ReconciliationItemWhereInput = {
      AND: [
        q.includeSuperseded === 'true' ? {} : LIVE_ITEM,
        ...(q.status ? [{ status: q.status }] : []),
        ...(q.kind ? [{ kind: q.kind }] : []),
        ...(q.portfolioId ? [{ portfolioId: q.portfolioId }] : []),
        ...(q.date ? [{ batch: { businessDate: dateOnly(q.date) } }] : []),
        ...(search
          ? [
              {
                OR: [
                  { tradeReference: { contains: search, mode: 'insensitive' as const } },
                  { ticker: { contains: search, mode: 'insensitive' as const } },
                  { portfolio: { ref: { contains: search, mode: 'insensitive' as const } } },
                  { portfolio: { name: { contains: search, mode: 'insensitive' as const } } },
                  { execution: { ref: { contains: search, mode: 'insensitive' as const } } },
                  { dayEnd: { ref: { contains: search, mode: 'insensitive' as const } } },
                  { transaction: { ref: { contains: search, mode: 'insensitive' as const } } },
                ],
              },
            ]
          : []),
      ],
    };
    const orderBy = buildOrderBy<Prisma.ReconciliationItemOrderByWithRelationInput>(
      q,
      {
        updatedAt: (d) => ({ updatedAt: d }),
        createdAt: (d) => ({ createdAt: d }),
        status: (d) => ({ status: d }),
        kind: (d) => ({ kind: d }),
        tradeReference: (d) => ({ tradeReference: d }),
        ticker: (d) => ({ ticker: d }),
        portfolio: (d) => ({ portfolio: { ref: d } }),
      },
      { updatedAt: 'desc' },
    );
    const [rows, total] = await Promise.all([
      this.prisma.reconciliationItem.findMany({ where, orderBy, ...pageArgs(q), include: LIST_INCLUDE }),
      this.prisma.reconciliationItem.count({ where }),
    ]);
    return paged(rows.map(mapRow), total, q);
  }

  // ── detail ──────────────────────────────────────────────────────────────────
  async detail(id: string) {
    const item = await this.prisma.reconciliationItem.findUnique({
      where: { id },
      include: {
        batch: { select: { id: true, ref: true, businessDate: true } },
        portfolio: { select: { id: true, ref: true, name: true, baseCurrency: true } },
        exceptions: { orderBy: { createdAt: 'asc' } },
        transaction: { include: { security: { select: { ticker: true, name: true } } } },
        execution: { include: { custodianAccount: { include: { custodianOrg: { select: { id: true, name: true } }, portfolio: { select: { ref: true, name: true } } } } } },
        dayEnd: { include: { custodianAccount: { include: { custodianOrg: { select: { id: true, name: true } }, portfolio: { select: { ref: true, name: true } } } } } },
      },
    });
    if (!item) throw new NotFoundException('Reconciliation item not found');

    let submission: Record<string, unknown> | null = null;
    const entityFilters: Prisma.AuditEventWhereInput[] = [{ entityType: 'ReconciliationItem', entityId: item.id }];
    if (item.execution) {
      const e = item.execution;
      entityFilters.push({ entityType: 'CustodianExecution', entityId: e.id });
      submission = {
        kind: 'EXECUTION',
        id: e.id,
        ref: e.ref,
        version: e.version,
        isCurrent: e.isCurrent,
        reconStatus: e.reconStatus,
        correctionReason: e.correctionReason,
        custodian: e.custodianAccount.custodianOrg,
        account: { id: e.custodianAccount.id, accountNumber: e.custodianAccount.accountNumber, name: e.custodianAccount.name },
        submittedByName: e.submittedByName,
        createdAt: e.createdAt.toISOString(),
        rawPayload: e.rawPayload,
        document: null,
      };
    } else if (item.dayEnd) {
      const d = item.dayEnd;
      entityFilters.push({ entityType: 'CustodianDayEnd', entityId: d.id });
      const doc = d.documentId
        ? await this.prisma.document.findUnique({
            where: { id: d.documentId },
            select: { id: true, title: true, versions: { orderBy: { versionNo: 'desc' }, take: 1, select: { fileName: true, mimeType: true, sizeBytes: true, sha256: true, versionNo: true } } },
          })
        : null;
      const dv = doc?.versions[0];
      submission = {
        kind: 'DAY_END',
        id: d.id,
        ref: d.ref,
        version: d.version,
        isCurrent: d.isCurrent,
        reconStatus: d.reconStatus,
        custodian: d.custodianAccount.custodianOrg,
        account: { id: d.custodianAccount.id, accountNumber: d.custodianAccount.accountNumber, name: d.custodianAccount.name },
        submittedByName: d.submittedByName,
        createdAt: d.createdAt.toISOString(),
        fileName: d.fileName,
        fileSha256: d.fileSha256,
        rawPayload: d.rawPayload,
        document: doc && dv ? { id: doc.id, title: doc.title, fileName: dv.fileName, mimeType: dv.mimeType, sizeBytes: dv.sizeBytes, sha256: dv.sha256, version: dv.versionNo } : null,
      };
    }

    const events = await this.prisma.auditEvent.findMany({ where: { OR: entityFilters }, orderBy: { createdAt: 'asc' }, take: 100 });
    const timeline = events.map((ev) => {
      const meta = (ev.metadata ?? {}) as Record<string, unknown>;
      const after = (ev.after ?? {}) as Record<string, unknown>;
      let title = TIMELINE_TITLES[ev.action]?.title ?? ev.action;
      let tone = TIMELINE_TITLES[ev.action]?.tone ?? 'neutral';
      let body: string | undefined;
      if (ev.action === 'RECON_ITEM_UPDATED') {
        const st = after.status as ReconStatus | undefined;
        title = st ? `Reconciliation: ${RECON_STATUS_LABELS[st] ?? st}` : 'Reconciliation updated';
        tone = st ? RECON_STATUS_TONES[st] : 'neutral';
        body = typeof meta.summary === 'string' ? meta.summary : undefined;
        if (typeof meta.batchRef === 'string') body = `${meta.batchRef}${body ? ': ' + body : ''}`;
      } else if (ev.action === 'RECON_EXCEPTION_RESOLVED') {
        const ex = (after.exception ?? {}) as Record<string, unknown>;
        body = [ex.type, ex.resolutionNote].filter(Boolean).join(': ');
      } else if (ev.action === 'RECON_NOTE_ADDED') {
        body = typeof meta.note === 'string' ? meta.note : undefined;
      } else if (typeof meta.reason === 'string') body = meta.reason;
      else if (ev.action.startsWith('CUSTODIAN_') && typeof meta.supersedes === 'string') body = `Supersedes ${meta.supersedes}`;
      return { id: ev.id, title, tone, body, at: ev.createdAt.toISOString(), actor: (meta.actorName as string) ?? ev.actorEmail ?? null };
    });

    const tx = item.transaction;
    return {
      id: item.id,
      kind: item.kind,
      status: item.status,
      batch: { id: item.batch.id, ref: item.batch.ref, businessDate: toISODate(item.batch.businessDate) },
      portfolio: item.portfolio,
      tradeReference: item.tradeReference,
      ticker: item.ticker,
      currency: item.currency,
      matchKey: item.matchKey,
      superseded: item.execution ? !item.execution.isCurrent : item.dayEnd ? !item.dayEnd.isCurrent : false,
      source: item.sourceSnapshot,
      internal: item.internalSnapshot,
      differences: item.differences ?? [],
      exceptions: item.exceptions.map((x) => ({
        id: x.id,
        type: x.type,
        description: x.description,
        expected: x.expected,
        actual: x.actual,
        status: x.status,
        resolutionNote: x.resolutionNote,
        resolvedById: x.resolvedById,
        resolvedByName: x.resolvedByName,
        resolvedAt: x.resolvedAt?.toISOString() ?? null,
        createdAt: x.createdAt.toISOString(),
      })),
      openExceptions: item.exceptions.filter((x) => x.status === 'OPEN').length,
      submission,
      transaction: tx
        ? {
            id: tx.id,
            ref: tx.ref,
            tradeReference: tx.tradeReference,
            side: tx.side,
            ticker: tx.security?.ticker ?? null,
            security: tx.security?.name ?? null,
            quantity: tx.quantity,
            price: tx.price,
            amount: tx.amount,
            currency: tx.currency,
            tradeDate: toISODate(tx.tradeDate),
            settlementDate: tx.settlementDate ? toISODate(tx.settlementDate) : null,
            broker: tx.broker,
            status: tx.status,
          }
        : null,
      timeline,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  // ── resolution ──────────────────────────────────────────────────────────────
  /** Records the resolution (note, user, time). Never touches internal data or the custodian's source values. */
  async resolveException(ctx: RequestContext, exceptionId: string, note: string) {
    const ex = await this.prisma.reconciliationException.findUnique({ where: { id: exceptionId }, include: { item: true } });
    if (!ex) throw new NotFoundException('Exception not found');
    if (ex.status === 'RESOLVED') throw new ConflictException('This exception has already been resolved.');

    return this.prisma.$transaction(async (tx) => {
      const resolvedAt = new Date();
      const updated = await tx.reconciliationException.update({
        where: { id: exceptionId },
        data: { status: 'RESOLVED', resolutionNote: note, resolvedById: ctx.userId, resolvedByName: ctx.name, resolvedAt },
      });
      const open = await tx.reconciliationException.count({ where: { itemId: ex.itemId, status: 'OPEN' } });
      let itemStatus = ex.item.status;
      if (open === 0) {
        itemStatus = 'RESOLVED';
        await tx.reconciliationItem.update({ where: { id: ex.itemId }, data: { status: 'RESOLVED' } });
        if (ex.item.executionId) await tx.custodianExecution.update({ where: { id: ex.item.executionId }, data: { reconStatus: 'RESOLVED' } });
        if (ex.item.dayEndId) await tx.custodianDayEndSubmission.update({ where: { id: ex.item.dayEndId }, data: { reconStatus: 'RESOLVED' } });
      }
      await this.audit.record(
        {
          ctx,
          entityType: 'ReconciliationItem',
          entityId: ex.itemId,
          action: 'RECON_EXCEPTION_RESOLVED',
          before: { exception: { id: ex.id, type: ex.type, status: 'OPEN' }, itemStatus: ex.item.status },
          after: { exception: { id: ex.id, type: ex.type, status: 'RESOLVED', resolutionNote: note }, itemStatus },
          metadata: { actorName: ctx.name, openRemaining: open },
        },
        tx,
      );
      return {
        exception: { ...updated, resolvedAt: resolvedAt.toISOString(), createdAt: updated.createdAt.toISOString() },
        item: { id: ex.itemId, status: itemStatus },
        itemResolved: open === 0,
        openRemaining: open,
      };
    });
  }

  async addNote(ctx: RequestContext, itemId: string, note: string) {
    const item = await this.prisma.reconciliationItem.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!item) throw new NotFoundException('Reconciliation item not found');
    await this.audit.record({ ctx, entityType: 'ReconciliationItem', entityId: itemId, action: 'RECON_NOTE_ADDED', metadata: { note, actorName: ctx.name } });
    return { ok: true };
  }
}
