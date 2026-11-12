import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { OrgType, RoleKey } from '@nexus/shared';

/**
 * Built by AccessGuard on every authenticated request from the DB (not from the JWT),
 * so permission/role changes take effect immediately.
 *
 * Scoping rules services MUST apply:
 *  - INVESTOR user      → only rows where investorId === ctx.investorId
 *  - CUSTODIAN user     → only accounts where custodianOrgId === ctx.orgId
 *  - PORTFOLIO_COMPANY  → only rows where companyId === ctx.companyId
 *  - ASSET_MANAGER      → staff; gated by permission strings, not by org
 */
export interface RequestContext {
  userId: string;
  email: string;
  name: string;
  orgId: string;
  orgType: OrgType;
  orgName: string;
  roleKey: RoleKey | string;
  roleName: string;
  permissions: string[];
  investorId?: string;
  companyId?: string;
  ip?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    ctx?: RequestContext;
  }
}

export const isStaff = (ctx: RequestContext) => ctx.orgType === 'ASSET_MANAGER';

/** Param decorator: `@Ctx() ctx: RequestContext` */
export const Ctx = createParamDecorator((_data: unknown, ec: ExecutionContext): RequestContext => {
  const req = ec.switchToHttp().getRequest();
  return req.ctx as RequestContext;
});
