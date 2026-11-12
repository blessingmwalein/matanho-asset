import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ANY_PERMS, IS_AUTHENTICATED, IS_PUBLIC, ORG_TYPES_META, PERMS } from './decorators';
import type { RequestContext } from './request-context';

export interface JwtPayload {
  sub: string;
  oid: string;
}

/**
 * Global guard: authenticates the bearer token, rebuilds RequestContext from the database
 * (so role/permission edits apply immediately), then enforces the route's declared access.
 * Denials are logged by AllExceptionsFilter as ACCESS_DENIED audit events.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ec: ExecutionContext): Promise<boolean> {
    const targets = [ec.getHandler(), ec.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const req = ec.switchToHttp().getRequest<Request>();

    // Always try to resolve identity if a token is present (public routes may use it optionally)
    const token = this.extractToken(req);
    if (token) {
      try {
        req.ctx = await this.buildContext(token, req);
      } catch (e) {
        if (!isPublic) throw e;
      }
    }
    if (isPublic) return true;

    if (!req.ctx) throw new UnauthorizedException('Authentication required');
    const ctx = req.ctx;

    const perms = this.reflector.getAllAndOverride<string[]>(PERMS, targets);
    const anyPerms = this.reflector.getAllAndOverride<string[]>(ANY_PERMS, targets);
    const authenticated = this.reflector.getAllAndOverride<boolean>(IS_AUTHENTICATED, targets);
    const orgTypes = this.reflector.getAllAndOverride<string[]>(ORG_TYPES_META, targets);

    if (!perms && !anyPerms && !authenticated) {
      throw new ForbiddenException('Route has no access policy (deny by default)');
    }
    if (perms && !perms.every((p) => ctx.permissions.includes(p))) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    if (anyPerms && !anyPerms.some((p) => ctx.permissions.includes(p))) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    if (orgTypes && !orgTypes.includes(ctx.orgType)) {
      throw new ForbiddenException('This resource is not available to your organisation type');
    }
    return true;
  }

  private extractToken(req: Request): string | null {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return null;
    return h.slice(7).trim() || null;
  }

  private async buildContext(token: string, req: Request): Promise<RequestContext> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Session expired or invalid. Please sign in again.');
    }

    const m = await this.prisma.organisationMembership.findUnique({
      where: { userId_organisationId: { userId: payload.sub, organisationId: payload.oid } },
      include: {
        user: true,
        role: true,
        organisation: { include: { investor: { select: { id: true } }, company: { select: { id: true } } } },
      },
    });
    if (!m || m.user.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');

    return {
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      orgId: m.organisation.id,
      orgType: m.organisation.type,
      orgName: m.organisation.name,
      roleKey: m.role.key,
      roleName: m.role.name,
      permissions: m.role.permissions,
      investorId: m.organisation.investor?.id,
      companyId: m.organisation.company?.id,
      ip: (req.ip as string | undefined) ?? undefined,
    };
  }
}
