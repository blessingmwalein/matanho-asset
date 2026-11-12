import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { loginSchema } from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import { Authenticated, Public } from '../../common/auth/decorators';
import { Ctx, RequestContext } from '../../common/auth/request-context';
import { ApiZodBody, ZodPipe } from '../../common/zod/zod.pipe';
import { AuthService, toSessionUser } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  /** Credentials login → JWT. The web app stores the token in an httpOnly cookie (never in localStorage). */
  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiZodBody(loginSchema)
  login(@Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>, @Req() req: Request) {
    return this.auth.login(body.email, body.password, req.ip);
  }

  @Get('me')
  @Authenticated()
  me(@Ctx() ctx: RequestContext) {
    return toSessionUser(ctx);
  }

  /** Tokens are stateless; logout is recorded for the audit trail and the client discards the cookie. */
  @Post('logout')
  @Authenticated()
  @HttpCode(200)
  async logout(@Ctx() ctx: RequestContext) {
    await this.audit.record({ ctx, entityType: 'User', entityId: ctx.userId, action: 'LOGOUT' });
    return { ok: true };
  }
}
