import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ALL_PERMISSIONS, PRESENTATION_FX, P, ROLE_DEFINITIONS, type ListQuery } from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/auth/request-context';
import { env } from '../../common/config/env';
import { buildOrderBy, pageArgs, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';

/** Permissions the Administrator role may never lose (prevents locking everyone out). */
const ADMIN_LOCKED: string[] = [P.ADMIN_USERS, P.ADMIN_ROLES, P.ADMIN_SETTINGS, P.AUDIT_READ];

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  // ── users ────────────────────────────────────────────────────────────────
  async listUsers(q: ListQuery & { orgType?: string; status?: string }) {
    const where: Prisma.UserWhereInput = {
      ...(q.status ? { status: q.status as 'ACTIVE' | 'DISABLED' | 'INVITED' } : {}),
      ...(q.orgType ? { memberships: { some: { organisation: { type: q.orgType as never } } } } : {}),
      ...(q.q
        ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }, { memberships: { some: { organisation: { name: { contains: q.q, mode: 'insensitive' } } } } }] }
        : {}),
    };
    const orderBy = buildOrderBy<Prisma.UserOrderByWithRelationInput>(
      q,
      { name: (d) => ({ name: d }), email: (d) => ({ email: d }), status: (d) => ({ status: d }), lastLoginAt: (d) => ({ lastLoginAt: d }) },
      { createdAt: 'desc' },
    );
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy,
        ...pageArgs(q),
        include: { memberships: { where: { isPrimary: true }, include: { organisation: { select: { id: true, name: true, type: true } }, role: { select: { id: true, key: true, name: true } } } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paged(
      rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        status: u.status,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        organisation: u.memberships[0]?.organisation ?? null,
        role: u.memberships[0]?.role ?? null,
      })),
      total,
      q,
    );
  }

  async createUser(ctx: RequestContext, body: { email: string; name: string; organisationId: string; roleKey: string; password: string }) {
    const [org, role] = await Promise.all([
      this.prisma.organisation.findUnique({ where: { id: body.organisationId } }),
      this.prisma.role.findUnique({ where: { key: body.roleKey } }),
    ]);
    if (!org) throw new NotFoundException('Organisation not found');
    if (!role) throw new NotFoundException('Role not found');
    if (role.orgType !== org.type) throw new BadRequestException(`The ${role.name} role cannot be assigned to a ${org.type.toLowerCase().replace('_', ' ')} organisation.`);
    const email = body.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('A user with this email already exists');

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { email, name: body.name, passwordHash: await bcrypt.hash(body.password, 10), status: 'ACTIVE' } });
      await tx.organisationMembership.create({ data: { userId: u.id, organisationId: org.id, roleId: role.id, isPrimary: true } });
      await this.audit.record({ ctx, entityType: 'User', entityId: u.id, action: 'USER_CREATED', after: { email, name: body.name, organisation: org.name, role: role.key } }, tx);
      return u;
    });
    return { id: user.id, email: user.email };
  }

  async updateUser(ctx: RequestContext, id: string, body: { name?: string; status?: 'ACTIVE' | 'DISABLED'; roleKey?: string; password?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { memberships: { where: { isPrimary: true }, include: { role: true, organisation: true } } } });
    if (!user) throw new NotFoundException('User not found');
    const m = user.memberships[0];
    if (id === ctx.userId && (body.status === 'DISABLED' || (body.roleKey && body.roleKey !== m?.role.key))) {
      throw new ForbiddenException('You cannot disable or change the role of your own account.');
    }

    const before = { name: user.name, status: user.status, role: m?.role.key };
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { ...(body.name ? { name: body.name } : {}), ...(body.status ? { status: body.status } : {}), ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 10) } : {}) },
      });
      if (body.roleKey && m && body.roleKey !== m.role.key) {
        const role = await tx.role.findUnique({ where: { key: body.roleKey } });
        if (!role) throw new NotFoundException('Role not found');
        if (role.orgType !== m.organisation.type) throw new BadRequestException('That role does not apply to this organisation type');
        await tx.organisationMembership.update({ where: { id: m.id }, data: { roleId: role.id } });
      }
      await this.audit.record(
        { ctx, entityType: 'User', entityId: id, action: body.password ? 'USER_PASSWORD_RESET' : 'USER_UPDATED', before, after: { name: body.name ?? user.name, status: body.status ?? user.status, role: body.roleKey ?? m?.role.key }, metadata: body.password ? { passwordChanged: true } : undefined },
        tx,
      );
    });
    return { ok: true };
  }

  organisations() {
    return this.prisma.organisation.findMany({ select: { id: true, name: true, type: true }, orderBy: [{ type: 'asc' }, { name: 'asc' }] });
  }

  // ── roles ────────────────────────────────────────────────────────────────
  async listRoles() {
    const roles = await this.prisma.role.findMany({ include: { _count: { select: { memberships: true } } }, orderBy: [{ orgType: 'asc' }, { name: 'asc' }] });
    return roles.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, orgType: r.orgType, permissions: r.permissions, userCount: r._count.memberships, isSystem: r.isSystem }));
  }

  /** Catalogue grouped by area for the permission editor. */
  permissionCatalogue() {
    const groups = new Map<string, string[]>();
    for (const p of ALL_PERMISSIONS) {
      const area = p.split('.')[0]!;
      groups.set(area, [...(groups.get(area) ?? []), p]);
    }
    return Array.from(groups, ([area, permissions]) => ({ area, permissions }));
  }

  async updateRole(ctx: RequestContext, id: string, body: { permissions: string[]; description?: string }) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    const unknown = body.permissions.filter((p) => !(ALL_PERMISSIONS as string[]).includes(p));
    if (unknown.length) throw new BadRequestException(`Unknown permission(s): ${unknown.join(', ')}`);
    if (role.key === 'ADMIN') {
      const missing = ADMIN_LOCKED.filter((p) => !body.permissions.includes(p));
      if (missing.length) throw new ForbiddenException(`The Administrator role must keep: ${missing.join(', ')}`);
    }
    // external roles may only hold their own portal permission
    const def = ROLE_DEFINITIONS.find((d) => d.key === role.key);
    if (def && def.orgType !== 'ASSET_MANAGER' && body.permissions.some((p) => !p.startsWith('portal.'))) {
      throw new BadRequestException('External roles can only hold portal permissions.');
    }
    const permissions = Array.from(new Set(body.permissions)).sort();
    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({ where: { id }, data: { permissions, ...(body.description !== undefined ? { description: body.description } : {}) } });
      await this.audit.record(
        { ctx, entityType: 'Role', entityId: id, action: 'ROLE_PERMISSIONS_CHANGED', before: { permissions: role.permissions }, after: { permissions }, metadata: { role: role.key, added: permissions.filter((p) => !role.permissions.includes(p)), removed: role.permissions.filter((p) => !permissions.includes(p)) } },
        tx,
      );
    });
    return { ok: true };
  }

  // ── audit viewer ─────────────────────────────────────────────────────────
  async listAudit(q: ListQuery & { entityType?: string; action?: string; actorId?: string; from?: string; to?: string }) {
    const where: Prisma.AuditEventWhereInput = {
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.action ? { action: { contains: q.action, mode: 'insensitive' } } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) } } : {}),
      ...(q.q ? { OR: [{ action: { contains: q.q, mode: 'insensitive' } }, { actorEmail: { contains: q.q, mode: 'insensitive' } }, { entityId: { contains: q.q, mode: 'insensitive' } }, { entityType: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return paged(rows, total, q);
  }

  async auditEntityTypes() {
    const rows = await this.prisma.auditEvent.groupBy({ by: ['entityType'], _count: { _all: true }, orderBy: { entityType: 'asc' } });
    return rows.map((r) => ({ entityType: r.entityType, count: r._count._all }));
  }

  // ── settings (read-only system overview) ─────────────────────────────────
  async settings() {
    let database = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    const [users, organisations, investors, portfolios, documents, auditEvents] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.organisation.count(),
      this.prisma.investor.count(),
      this.prisma.portfolio.count(),
      this.prisma.document.count(),
      this.prisma.auditEvent.count(),
    ]);
    return {
      environment: env.NODE_ENV,
      version: '0.1.0-mvp',
      database,
      storageDriver: this.storage.activeDriver,
      jwtExpiresIn: env.JWT_EXPIRES_IN,
      presentationFx: PRESENTATION_FX,
      counts: { users, organisations, investors, portfolios, documents, auditEvents },
      notes: [
        'Valuation model is simplified: market value = quantity × price. No accruals, fees, FX translation or time-weighted returns.',
        'FX rates shown to investors are indicative presentation rates only and are not used in any valuation.',
        'Email delivery, scheduled reports, external screening and broker integrations are out of MVP scope.',
      ],
    };
  }
}
