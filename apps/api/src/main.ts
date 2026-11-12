import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './common/config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind Render's load balancer + the Next.js proxy: trust X-Forwarded-For for req.ip / throttling.
  app.set('trust proxy', true);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useBodyParser('json', { limit: '2mb' });
  app.enableCors({
    origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: false, // bearer tokens only; browser traffic goes through the Next.js proxy
    exposedHeaders: ['Content-Disposition', 'X-Document-Sha256', 'Idempotent-Replay'],
  });
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Matanho Nexus API')
    .setDescription(
      'REST API for the Matanho Nexus asset management MVP. Authenticate via POST /auth/login and use the returned token as a Bearer token. ' +
        'Mutating requests accept an `Idempotency-Key` header for safe retries.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config), { swaggerOptions: { persistAuthorization: true } });

  await app.listen(env.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`Matanho Nexus API listening on :${env.PORT} (docs at /docs, health at /health)`);
}

void bootstrap();
