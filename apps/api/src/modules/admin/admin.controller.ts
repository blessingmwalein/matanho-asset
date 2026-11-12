import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { P, createUserSchema, listQuerySchema, updateRoleSchema, updateUserSchema } from '@nexus/shared';
import { Perms } from '../../common/auth/decorators';
import { Ctx, RequestContext } from '../../common/auth/request-context';
import { ApiListQuery, ApiZodBody, ZodPipe } from '../../common/zod/zod.pipe';
import { AdminService } from './admin.service';

const usersQuery = listQuerySchema.extend({ orgType: z.string().optional(), status: z.string().optional() });
const auditQuery = listQuerySchema.extend({
  entityType: z.string().optional(),
  action: z.string().optional(),
  actorId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

@ApiTags('Administration')
@Controller('admin')
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  @Get('users')
  @Perms(P.ADMIN_USERS)
  @ApiListQuery()
  users(@Query(new ZodPipe(usersQuery)) q: z.infer<typeof usersQuery>) {
    return this.svc.listUsers(q);
  }

  @Post('users')
  @Perms(P.ADMIN_USERS)
  @ApiZodBody(createUserSchema)
  createUser(@Ctx() ctx: RequestContext, @Body(new ZodPipe(createUserSchema)) body: z.infer<typeof createUserSchema>) {
    return this.svc.createUser(ctx, body);
  }

  @Patch('users/:id')
  @Perms(P.ADMIN_USERS)
  @ApiZodBody(updateUserSchema)
  updateUser(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(updateUserSchema)) body: z.infer<typeof updateUserSchema>) {
    return this.svc.updateUser(ctx, id, body);
  }

  @Get('organisations')
  @Perms(P.ADMIN_USERS)
  organisations() {
    return this.svc.organisations();
  }

  @Get('roles')
  @Perms(P.ADMIN_ROLES)
  roles() {
    return this.svc.listRoles();
  }

  @Get('permissions')
  @Perms(P.ADMIN_ROLES)
  permissions() {
    return this.svc.permissionCatalogue();
  }

  @Patch('roles/:id')
  @Perms(P.ADMIN_ROLES)
  @ApiZodBody(updateRoleSchema)
  updateRole(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(updateRoleSchema)) body: z.infer<typeof updateRoleSchema>) {
    return this.svc.updateRole(ctx, id, body);
  }

  @Get('audit')
  @Perms(P.AUDIT_READ)
  @ApiListQuery()
  audit(@Query(new ZodPipe(auditQuery)) q: z.infer<typeof auditQuery>) {
    return this.svc.listAudit(q);
  }

  @Get('audit/entity-types')
  @Perms(P.AUDIT_READ)
  auditEntityTypes() {
    return this.svc.auditEntityTypes();
  }

  @Get('settings')
  @Perms(P.ADMIN_SETTINGS)
  settings() {
    return this.svc.settings();
  }
}
