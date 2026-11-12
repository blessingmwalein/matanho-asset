import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/auth/decorators';
import { env } from '../../common/config/env';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';

@ApiTags('Health')
@Controller()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Render health check: also verifies the database connection. */
  @Get('health')
  @Public()
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'degraded', database: 'down' });
    }
    return {
      status: 'ok',
      service: 'matanho-nexus-api',
      database: 'up',
      storage: this.storage.activeDriver,
      environment: env.NODE_ENV,
      time: new Date().toISOString(),
    };
  }

  @Get()
  @Public()
  root() {
    return { service: 'matanho-nexus-api', docs: '/docs', health: '/health' };
  }
}
