import { Controller, Get, Global, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Authenticated } from '../../common/auth/decorators';
import { Ctx, RequestContext } from '../../common/auth/request-context';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface NotifyInput {
  userId?: string;
  organisationId?: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a notification for a user and/or every member of an organisation. */
  async notify(input: NotifyInput, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    return db.notification.create({ data: input });
  }

  /** Notify all internal staff (org-level notification on the asset-manager org). */
  async notifyStaff(input: Omit<NotifyInput, 'organisationId' | 'userId'>, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const am = await db.organisation.findFirst({ where: { type: 'ASSET_MANAGER' }, select: { id: true } });
    if (!am) return null;
    return db.notification.create({ data: { ...input, organisationId: am.id } });
  }

  list(ctx: RequestContext, onlyUnread = false) {
    return this.prisma.notification.findMany({
      where: {
        OR: [{ userId: ctx.userId }, { organisationId: ctx.orgId, userId: null }],
        ...(onlyUnread ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  async markRead(ctx: RequestContext, id: string) {
    const n = await this.prisma.notification.findFirst({
      where: { id, OR: [{ userId: ctx.userId }, { organisationId: ctx.orgId, userId: null }] },
    });
    if (!n) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({ where: { id }, data: { readAt: n.readAt ?? new Date() } });
  }

  async markAllRead(ctx: RequestContext) {
    const r = await this.prisma.notification.updateMany({
      where: { readAt: null, OR: [{ userId: ctx.userId }, { organisationId: ctx.orgId, userId: null }] },
      data: { readAt: new Date() },
    });
    return { updated: r.count };
  }
}

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  @Authenticated()
  async list(@Ctx() ctx: RequestContext, @Query('unread') unread?: string) {
    const data = await this.svc.list(ctx, unread === 'true');
    return { data, unreadCount: data.filter((n) => !n.readAt).length };
  }

  @Post('read-all')
  @Authenticated()
  readAll(@Ctx() ctx: RequestContext) {
    return this.svc.markAllRead(ctx);
  }

  @Post(':id/read')
  @Authenticated()
  read(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.markRead(ctx, id);
  }
}

@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
