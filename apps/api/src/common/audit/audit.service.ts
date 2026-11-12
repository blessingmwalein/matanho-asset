import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../auth/request-context';

export interface AuditInput {
  /** Acting user context. Omit for system / anonymous (public onboarding) actions. */
  ctx?: Pick<RequestContext, 'userId' | 'email' | 'roleKey' | 'orgId' | 'ip'> | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  ip?: string;
}

const toJson = (v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined => {
  if (v === undefined) return undefined;
  if (v === null) return Prisma.JsonNull;
  // round-trip so Decimal/Date become plain JSON
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
};

/**
 * Append-only audit trail (UAT AUD-001..003). Rows are protected by a DB trigger that
 * rejects UPDATE/DELETE/TRUNCATE. Pass `tx` to write inside the caller's transaction.
 */
@Injectable()
export class AuditService {
  private readonly log = new Logger('Audit');
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    const data: Prisma.AuditEventUncheckedCreateInput = {
      actorId: input.ctx?.userId ?? null,
      actorEmail: input.ctx?.email ?? null,
      actorRole: input.ctx?.roleKey ?? null,
      orgId: input.ctx?.orgId ?? null,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      action: input.action,
      before: toJson(input.before),
      after: toJson(input.after),
      metadata: toJson(input.metadata),
      ip: input.ip ?? input.ctx?.ip ?? null,
    };
    if (tx) {
      await db.auditEvent.create({ data }); // inside a transaction: failures must propagate
      return;
    }
    try {
      await db.auditEvent.create({ data });
    } catch (e) {
      this.log.error(`Failed to write audit event ${input.action}: ${(e as Error).message}`);
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
