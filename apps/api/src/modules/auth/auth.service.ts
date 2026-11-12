import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { homePathFor, type OrgType } from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/auth/request-context';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  organisation: { id: string; name: string; type: OrgType };
  role: { key: string; name: string };
  permissions: string[];
  homePath: string;
  investorId?: string;
  companyId?: string;
}

export function toSessionUser(ctx: RequestContext): SessionUser {
  return {
    id: ctx.userId,
    name: ctx.name,
    email: ctx.email,
    organisation: { id: ctx.orgId, name: ctx.orgName, type: ctx.orgType },
    role: { key: String(ctx.roleKey), name: ctx.roleName },
    permissions: ctx.permissions,
    homePath: homePathFor(ctx.orgType),
    investorId: ctx.investorId,
    companyId: ctx.companyId,
  };
}

// A real bcrypt hash of a random string, used so unknown emails take the same time as wrong passwords.
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO6x4kY9w0m6m8lq3m9Yb0n1o5kqk8q8e';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        memberships: {
          where: { isPrimary: true },
          include: {
            role: true,
            organisation: { include: { investor: { select: { id: true } }, company: { select: { id: true } } } },
          },
          take: 1,
        },
      },
    });

    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    const membership = user?.memberships[0];
    if (!user || !ok || !membership || user.status !== 'ACTIVE') {
      await this.audit.record({ entityType: 'User', entityId: user?.id, action: 'LOGIN_FAILED', metadata: { email }, ip });
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const accessToken = await this.jwt.signAsync({ sub: user.id, oid: membership.organisationId });

    const ctx: RequestContext = {
      userId: user.id,
      email: user.email,
      name: user.name,
      orgId: membership.organisation.id,
      orgType: membership.organisation.type,
      orgName: membership.organisation.name,
      roleKey: membership.role.key,
      roleName: membership.role.name,
      permissions: membership.role.permissions,
      investorId: membership.organisation.investor?.id,
      companyId: membership.organisation.company?.id,
      ip,
    };
    await this.audit.record({ ctx, entityType: 'User', entityId: user.id, action: 'LOGIN' });
    return { accessToken, user: toSessionUser(ctx) };
  }
}
