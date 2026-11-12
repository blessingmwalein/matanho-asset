import { OrgType } from '@prisma/client';
import { ROLE_DEFINITIONS } from '@nexus/shared';
import type { SeedContext } from './seed-context';

/**
 * Roles, organisations and users.
 * All demo users share one password (see DEMO_CREDENTIALS.md). Synthetic data only (.example domains).
 */
export async function seedIdentity(ctx: SeedContext) {
  const { prisma } = ctx;

  // ── roles ────────────────────────────────────────────────────────────────
  for (const r of ROLE_DEFINITIONS) {
    const role = await prisma.role.create({
      data: { key: r.key, name: r.name, description: r.description, orgType: r.orgType, permissions: r.permissions, isSystem: true },
    });
    ctx.set(`role.${r.key}`, role.id);
  }

  // ── organisations ────────────────────────────────────────────────────────
  const orgs: Array<{ key: string; type: OrgType; name: string; legalName?: string; country: string; email: string }> = [
    { key: 'am', type: 'ASSET_MANAGER', name: 'Matanho Asset Management', legalName: 'Matanho Asset Management (Private) Limited', country: 'Zimbabwe', email: 'info@matanho.example' },
    { key: 'horizon', type: 'INVESTOR', name: 'Horizon Pension Fund', legalName: 'Horizon Pension Fund', country: 'Zimbabwe', email: 'finance@horizon.example' },
    { key: 'cedar', type: 'INVESTOR', name: 'Cedar Assurance', legalName: 'Cedar Assurance Company Limited', country: 'Zimbabwe', email: 'treasury@cedar.example' },
    { key: 'custodianA', type: 'CUSTODIAN', name: 'Zambezi Custody Services', legalName: 'Zambezi Custody Services Limited', country: 'Zimbabwe', email: 'ops@zambezicustody.example' },
    { key: 'custodianB', type: 'CUSTODIAN', name: 'Limpopo Trust & Custody', legalName: 'Limpopo Trust & Custody Limited', country: 'Zimbabwe', email: 'ops@limpopocustody.example' },
    { key: 'africapay', type: 'PORTFOLIO_COMPANY', name: 'Africa Payments Holdings', legalName: 'Africa Payments Holdings Limited', country: 'Zimbabwe', email: 'finance@africapayments.example' },
    { key: 'lakeside', type: 'PORTFOLIO_COMPANY', name: 'Lakeside Agri Holdings', legalName: 'Lakeside Agri Holdings Limited', country: 'Zambia', email: 'finance@lakesideagri.example' },
  ];
  for (const o of orgs) {
    const org = await prisma.organisation.create({
      data: { type: o.type, name: o.name, slug: o.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), legalName: o.legalName, country: o.country, email: o.email },
    });
    ctx.set(`org.${o.key}`, org.id);
  }

  // ── users ────────────────────────────────────────────────────────────────
  const users: Array<{ key: string; name: string; email: string; org: string; role: string }> = [
    // Matanho staff
    { key: 'admin', name: 'Tendai Moyo', email: 'admin@matanho.example', org: 'am', role: 'ADMIN' },
    { key: 'am', name: 'Rudo Chirwa', email: 'am@matanho.example', org: 'am', role: 'ASSET_MANAGER' },
    { key: 'ops', name: 'Farai Ndlovu', email: 'ops@matanho.example', org: 'am', role: 'OPERATIONS' },
    { key: 'compliance', name: 'Nyasha Dube', email: 'compliance@matanho.example', org: 'am', role: 'COMPLIANCE' },
    { key: 'readonly', name: 'Tariro Banda', email: 'readonly@matanho.example', org: 'am', role: 'READ_ONLY' },
    // Horizon Pension Fund: 3 authorised portal users (matches client-portal.html "3 authorised users")
    { key: 'horizon1', name: 'Chipo Sibanda', email: 'finance@horizon.example', org: 'horizon', role: 'INVESTOR_USER' },
    { key: 'horizon2', name: 'Blessing Mutasa', email: 'trustee@horizon.example', org: 'horizon', role: 'INVESTOR_USER' },
    { key: 'horizon3', name: 'Kuda Zhou', email: 'investments@horizon.example', org: 'horizon', role: 'INVESTOR_USER' },
    // Cedar Assurance ("Investor B" for isolation tests)
    { key: 'cedar1', name: 'Anesu Phiri', email: 'treasury@cedar.example', org: 'cedar', role: 'INVESTOR_USER' },
    // Custodians A and B
    { key: 'custodianA', name: 'Simba Gumbo', email: 'ops@zambezicustody.example', org: 'custodianA', role: 'CUSTODIAN_USER' },
    { key: 'custodianB', name: 'Lindiwe Ncube', email: 'ops@limpopocustody.example', org: 'custodianB', role: 'CUSTODIAN_USER' },
    // Portfolio companies
    { key: 'africapay', name: 'Tapiwa Chinembiri', email: 'finance@africapayments.example', org: 'africapay', role: 'COMPANY_USER' },
    { key: 'lakeside', name: 'Rufaro Mlambo', email: 'finance@lakesideagri.example', org: 'lakeside', role: 'COMPANY_USER' },
  ];
  for (const u of users) {
    const user = await prisma.user.create({ data: { email: u.email, name: u.name, passwordHash: ctx.passwordHash, status: 'ACTIVE' } });
    ctx.set(`user.${u.key}`, user.id);
    await prisma.organisationMembership.create({
      data: { userId: user.id, organisationId: ctx.get(`org.${u.org}`), roleId: ctx.get(`role.${u.role}`), isPrimary: true },
    });
  }
  ctx.log(`${ROLE_DEFINITIONS.length} roles, ${orgs.length} organisations, ${users.length} users`);
}
