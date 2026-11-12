import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccessGuard } from './common/auth/access.guard';
import { AuditModule } from './common/audit/audit.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { PrismaModule } from './common/prisma/prisma.service';
import { ReferenceModule } from './common/references/reference.service';
import { StorageModule } from './common/storage/storage.service';
import { AdminModule } from './modules/admin/admin.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { CustodianModule } from './modules/custodian/custodian.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { HealthController } from './modules/health/health.controller';
import { InvestorPortalModule } from './modules/investor-portal/investor-portal.module';
import { InvestorsModule } from './modules/investors/investors.module';
import { NotificationsModule } from './modules/notifications/notifications.service';
import { PortfoliosModule } from './modules/portfolios/portfolios.module';
import { PublicOnboardingModule } from './modules/public-onboarding/public-onboarding.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1200 }]),
    // core (global)
    PrismaModule,
    AuditModule,
    ReferenceModule,
    StorageModule,
    NotificationsModule,
    DocumentsModule,
    AuthModule,
    // feature modules
    PublicOnboardingModule,
    ApplicationsModule,
    InvestorsModule,
    PortfoliosModule,
    DashboardModule,
    InvestorPortalModule,
    CustodianModule,
    ReconciliationModule,
    CompaniesModule,
    ReportsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
