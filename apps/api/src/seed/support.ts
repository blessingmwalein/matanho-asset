import type { SeedContext } from './seed-context';

/** Notifications + a baseline of audit events. Runs last so it can reference everything else. */
export async function seedSupport(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;
  const orgAm = ctx.get('org.am');

  await prisma.notification.createMany({
    data: [
      { organisationId: orgAm, type: 'APPLICATION_SUBMITTED', title: 'New investor application submitted', body: 'A new application is waiting for review in Onboarding & KYC.', link: '/internal/onboarding', createdAt: ctx.daysAgo(1) },
      { organisationId: orgAm, type: 'CUSTODIAN_SUBMISSION', title: 'Custodian submission received', body: 'Zambezi Custody Services submitted an execution awaiting reconciliation.', link: '/internal/operations/reconciliation', createdAt: ctx.daysAgo(0) },
      { organisationId: orgAm, type: 'COMPANY_SUBMISSION', title: 'Company reporting pack submitted', body: 'Africa Payments Holdings submitted its monthly pack for review.', link: '/internal/companies/submissions', createdAt: ctx.daysAgo(1) },
      { organisationId: ctx.get('org.horizon'), type: 'CAPITAL_CALL', title: 'Capital call issued', body: 'Matanho Growth Fund I has issued a capital call. Review and acknowledge it in Capital.', link: '/portal/capital', createdAt: ctx.daysAgo(3) },
    ],
  });

  // Baseline audit history so the audit viewer is not empty before the first demo action.
  await prisma.auditEvent.createMany({
    data: [
      { actorId: ctx.get('user.admin'), actorEmail: 'admin@matanho.example', actorRole: 'ADMIN', orgId: orgAm, entityType: 'System', action: 'DEMO_DATA_SEEDED', metadata: { note: 'Synthetic demonstration data loaded' }, createdAt: new Date() },
    ],
  });
  ctx.log('notifications and baseline audit events');
}
