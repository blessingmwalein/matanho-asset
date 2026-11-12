import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import { env } from '../common/config/env';
import { PrismaService } from '../common/prisma/prisma.service';
import { ReferenceService } from '../common/references/reference.service';
import { DocumentsService } from '../modules/documents/documents.service';
import { makeContext } from './seed-context';
import { seedIdentity } from './identity';
import { seedInvestors } from './investors';
import { seedPortfolios } from './portfolios';
import { seedCapital } from './capital';
import { seedApplications } from './applications';
import { seedCustodian } from './custodian';
import { seedCompanies } from './companies';
import { seedDocuments } from './documents';
import { seedSupport } from './support';

/**
 * Demo seed: `npm run seed -w @nexus/api` (after `npm run build`).
 *   (default)  if the database is already seeded, does nothing (safe to re-run)
 *   --reset    wipes ALL demo data (everything except the immutable AuditEvent table) and re-seeds
 * Synthetic data only. Dates are relative to the day the seed runs so "upcoming" items stay upcoming.
 */
async function main() {
  const reset = process.argv.includes('--reset');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);

  try {
    const already = await prisma.organisation.count();
    if (already > 0 && !reset) {
      // eslint-disable-next-line no-console
      console.log('Database already seeded. Use `--reset` to wipe demo data and re-seed.');
      return;
    }

    if (reset) {
      // eslint-disable-next-line no-console
      console.log('Resetting demo data (AuditEvent is append-only and is kept)…');
      await prisma.$executeRawUnsafe(`
        DO $$
        DECLARE r record;
        BEGIN
          FOR r IN SELECT tablename FROM pg_tables
                   WHERE schemaname = 'public' AND tablename NOT IN ('AuditEvent', '_prisma_migrations')
          LOOP
            EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" CASCADE';
          END LOOP;
        END $$;
      `);
    }

    if (!env.SEED_DEMO_USERS) {
      // eslint-disable-next-line no-console
      console.log('SEED_DEMO_USERS is not "true": refusing to create demo users. Set SEED_DEMO_USERS=true to seed the demo.');
      return;
    }

    const demoPassword = env.DEMO_PASSWORD || 'Matanho#Demo2026';
    const ctx = makeContext({
      prisma,
      app,
      docs: app.get(DocumentsService),
      refs: app.get(ReferenceService),
      demoPassword,
      passwordHash: await bcrypt.hash(demoPassword, 10),
    });

    // eslint-disable-next-line no-console
    console.log(`Seeding demo data (storage driver: ${env.STORAGE_DRIVER}) …`);
    // Order matters: later seeds look up ids created by earlier ones (see SeedContext).
    await seedIdentity(ctx);
    await seedInvestors(ctx);
    await seedPortfolios(ctx);
    await seedCapital(ctx);
    await seedApplications(ctx);
    await seedCustodian(ctx);
    await seedCompanies(ctx);
    await seedDocuments(ctx);
    await seedSupport(ctx);
    // eslint-disable-next-line no-console
    console.log(`\nDone. Demo users share the password: ${demoPassword}  (see DEMO_CREDENTIALS.md)`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
