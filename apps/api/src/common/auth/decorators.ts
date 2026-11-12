import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { OrgType, Permission } from '@nexus/shared';

export const IS_PUBLIC = 'nexus:public';
export const IS_AUTHENTICATED = 'nexus:authenticated';
export const PERMS = 'nexus:perms';
export const ANY_PERMS = 'nexus:any-perms';
export const ORG_TYPES_META = 'nexus:org-types';

/**
 * The AccessGuard is DENY-BY-DEFAULT: every route must declare exactly one of
 * @Public(), @Authenticated() or @Perms(...). A forgotten decorator returns 403, never data.
 */

/** No login required (health, login, public onboarding). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Any logged-in user. The handler MUST apply org scoping itself using @Ctx(). */
export const Authenticated = () => applyDecorators(SetMetadata(IS_AUTHENTICATED, true), ApiBearerAuth());

/** Caller must hold ALL listed permissions. */
export const Perms = (...perms: Permission[]) => applyDecorators(SetMetadata(PERMS, perms), ApiBearerAuth());

/** Caller must hold AT LEAST ONE of the listed permissions. */
export const AnyPerm = (...perms: Permission[]) => applyDecorators(SetMetadata(ANY_PERMS, perms), ApiBearerAuth());

/** Restrict a route to specific organisation types (in addition to permissions). */
export const OrgTypes = (...types: OrgType[]) => SetMetadata(ORG_TYPES_META, types);
