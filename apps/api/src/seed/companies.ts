import { Prisma, type CompanySubmissionStatus } from '@prisma/client';
import { REPORTING_PACK, formatMoney, type PackValues } from '@nexus/shared';
import { toISODate } from '../common/decimal';
import { analysePack, encodeValue } from '../modules/companies/pack.util';
import { buildPdf } from './pdf';
import type { SeedContext } from './seed-context';

/**
 * Portfolio companies, reporting periods, requirements, packs, values, evidence files and questions.
 * Reporting statuses are deliberately varied so every review state can be shown:
 *   Africa Payments Holdings: ACCEPTED (k=3), SUBMITTED full pack awaiting review (k=2), DRAFT ~76% (k=1, live Flow-4 demo)
 *   Lakeside Agri Holdings:   ACCEPTED (k=3), QUESTIONS_OPEN with an OPEN question (k=2), DRAFT ~30% (k=1)
 * k = months before the current month (k=1 is the last completed month: the "current" reporting period).
 */

const monthStart = (today: Date, k: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - k, 1));
const monthEnd = (today: Date, k: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - k + 1, 0));
const label = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const at = (d: Date, h: number, m: number) => new Date(d.getTime() + (h * 60 + m) * 60000);
const usd = (n: number) => formatMoney(n, 'USD', { decimals: 0 });

interface Profile {
  key: 'africapay' | 'lakeside';
  revenue: number;
  assets: number;
  cash: number;
  customers: number;
  churn: number;
  volume: number;
  commentary: string;
  board: string;
  banks: Array<{ bank: string; currency: string; share: number }>;
  facilities: Array<{ lender: string; facility_type: string; limit: number; drawn: number; days: number }>;
  certificates: Array<{ certificate_type: string; reference: string; days: number }>;
}

const PROFILES: Record<Profile['key'], Profile> = {
  africapay: {
    key: 'africapay',
    revenue: 1_850_000,
    assets: 18_400_000,
    cash: 3_200_000,
    customers: 412_300,
    churn: 1.9,
    volume: 96_400_000,
    commentary: 'Transaction volume grew on the back of new merchant onboarding. Churn improved after the wallet re-launch. Settlement delays with one partner bank cleared in the second week.',
    board: 'Board noted strong merchant growth and approved the Q4 capital expenditure plan for the settlement platform upgrade. The audit committee reviewed the interim control findings.',
    banks: [
      { bank: 'CBZ Bank', currency: 'USD', share: 0.46 },
      { bank: 'Stanbic Bank', currency: 'USD', share: 0.35 },
      { bank: 'FBC Bank', currency: 'ZWG', share: 0.19 },
    ],
    facilities: [
      { lender: 'Afreximbank', facility_type: 'Term loan', limit: 5_000_000, drawn: 3_800_000, days: 420 },
      { lender: 'Standard Chartered', facility_type: 'Working capital line', limit: 1_500_000, drawn: 600_000, days: 190 },
    ],
    certificates: [
      { certificate_type: 'Tax clearance', reference: 'ZIMRA-TCC-2026-0412', days: 210 },
      { certificate_type: 'Insurance', reference: 'POL-88231-AP', days: 300 },
      { certificate_type: 'Operating licence', reference: 'RBZ-PSP-0173', days: 35 }, // expiring soon: flagged in the portal
      { certificate_type: 'Regulatory licence', reference: 'POTRAZ-VAS-0558', days: 420 },
    ],
  },
  lakeside: {
    key: 'lakeside',
    revenue: 3_240_000,
    assets: 27_800_000,
    cash: 1_450_000,
    customers: 1_240,
    churn: 3.1,
    volume: 8_900_000,
    commentary: 'Outgrower contracts rose with the new season. Input costs increased after fertiliser prices moved. Export shipments were on schedule.',
    board: 'Board reviewed the season plan, approved irrigation capex phase two and noted the working-capital facility renewal timetable.',
    banks: [
      { bank: 'Zambia National Commercial Bank', currency: 'USD', share: 0.62 },
      { bank: 'Stanbic Bank Zambia', currency: 'USD', share: 0.38 },
    ],
    facilities: [{ lender: 'Development Finance Partners', facility_type: 'Seasonal crop finance', limit: 6_000_000, drawn: 4_100_000, days: 240 }],
    certificates: [
      { certificate_type: 'Tax clearance', reference: 'ZRA-TCC-2026-7745', days: 150 },
      { certificate_type: 'Insurance', reference: 'CROP-22918-LA', days: 260 },
      { certificate_type: 'Operating licence', reference: 'ZEMA-ECL-0912', days: 330 },
    ],
  },
};

function packValues(ctx: SeedContext, p: Profile, k: number): PackValues {
  const g = 1 + (3 - k) * 0.035 + (ctx.rng() - 0.5) * 0.02;
  const r = (n: number) => Math.round((n * g) / 1000) * 1000;
  const revenue = r(p.revenue);
  const cos = Math.round(revenue * 0.5);
  const opex = Math.round(revenue * 0.33);
  const net = revenue - cos - opex - Math.round(revenue * 0.05);
  const assets = r(p.assets);
  const liabilities = Math.round(assets * 0.495);
  const cash = r(p.cash);
  const today = ctx.today;
  const days = (n: number) => toISODate(new Date(today.getTime() + n * 86400000));
  return {
    is_revenue: revenue,
    is_cost_of_sales: cos,
    is_operating_expenses: opex,
    is_net_income: net,
    bs_total_assets: assets,
    bs_total_liabilities: liabilities,
    bs_total_equity: assets - liabilities,
    bs_cash: cash,
    cf_operating: Math.round(net * 1.9),
    cf_investing: -Math.round(revenue * 0.1),
    cf_financing: -Math.round(revenue * 0.03),
    cf_closing_cash: cash,
    kpi_revenue: revenue,
    kpi_active_customers: Math.round(p.customers * g),
    kpi_churn_pct: Math.round((p.churn + (ctx.rng() - 0.5) * 0.4) * 10) / 10,
    kpi_transaction_volume: r(p.volume),
    kpi_commentary: p.commentary,
    bank_balances: p.banks.map((b) => ({ bank: b.bank, currency: b.currency, balance: Math.round(cash * b.share) })),
    facilities: p.facilities.map((f) => ({ lender: f.lender, facility_type: f.facility_type, limit: f.limit, drawn: f.drawn, maturity_date: days(f.days) })),
    maturity_schedule: [
      { due_date: days(45), amount: Math.round(p.facilities[0]!.drawn * 0.06), description: `${p.facilities[0]!.facility_type}: quarterly instalment` },
      { due_date: days(135), amount: Math.round(p.facilities[0]!.drawn * 0.06), description: `${p.facilities[0]!.facility_type}: quarterly instalment` },
    ],
    board_commentary: p.board,
    certificates: p.certificates.map((c) => ({ certificate_type: c.certificate_type, reference: c.reference, expiry_date: days(c.days) })),
  };
}

const pick = (values: PackValues, keys: string[]): PackValues => Object.fromEntries(Object.entries(values).filter(([k]) => keys.includes(k)));

async function fileBuffer(slotKey: string, company: string, period: string, values: PackValues, reference: string): Promise<{ buffer: Buffer; name: string }> {
  const n = (k: string) => Number(values[k] ?? 0);
  if (slotKey === 'management_accounts_file') {
    const buffer = await buildPdf({
      title: 'Monthly management accounts',
      subtitle: `${company} · ${period}`,
      reference,
      meta: [
        ['Company', company],
        ['Period', period],
        ['Basis', 'Unaudited management accounts (synthetic demo data)'],
      ],
      pages: [
        {
          heading: 'Income statement, balance sheet and cashflow',
          blocks: [
            { type: 'h', text: 'Income statement' },
            { type: 'table', head: ['Line item', 'USD'], rows: [['Revenue', usd(n('is_revenue'))], ['Cost of sales', usd(n('is_cost_of_sales'))], ['Operating expenses', usd(n('is_operating_expenses'))], ['Net income', usd(n('is_net_income'))]] },
            { type: 'h', text: 'Balance sheet' },
            { type: 'table', head: ['Line item', 'USD'], rows: [['Total assets', usd(n('bs_total_assets'))], ['Total liabilities', usd(n('bs_total_liabilities'))], ['Total equity', usd(n('bs_total_equity'))], ['Cash and equivalents', usd(n('bs_cash'))]] },
            { type: 'h', text: 'Cashflow statement' },
            { type: 'table', head: ['Line item', 'USD'], rows: [['Operating cashflow', usd(n('cf_operating'))], ['Investing cashflow', usd(n('cf_investing'))], ['Financing cashflow', usd(n('cf_financing'))], ['Closing cash', usd(n('cf_closing_cash'))]] },
          ],
        },
      ],
    });
    return { buffer, name: `${company.split(' ')[0]}-management-accounts-${period.replace(' ', '-')}.pdf` };
  }
  if (slotKey === 'board_report' || slotKey === 'board_support') {
    const buffer = await buildPdf({
      title: slotKey === 'board_report' ? 'Board report' : 'Board supporting schedules',
      subtitle: `${company} · ${period}`,
      reference,
      meta: [['Company', company], ['Period', period], ['Status', 'Approved by the board (synthetic demo data)']],
      pages: [{ heading: 'Summary of matters considered', blocks: [{ type: 'p', text: String(values.board_commentary ?? 'The board considered the monthly performance and approved the proposals tabled.') }] }],
    });
    return { buffer, name: `${company.split(' ')[0]}-${slotKey === 'board_report' ? 'board-report' : 'board-support'}-${period.replace(' ', '-')}.pdf` };
  }
  if (slotKey === 'compliance_evidence') {
    const rows = ((values.certificates as Array<Record<string, string>>) ?? []).map((c) => [c.certificate_type ?? '', c.reference ?? '', c.expiry_date ?? '']);
    const buffer = await buildPdf({
      title: 'Compliance evidence pack',
      subtitle: `${company} · ${period}`,
      reference,
      meta: [['Company', company], ['Period', period], ['Contents', `${rows.length} certificates`]],
      pages: [{ heading: 'Certificates on file', blocks: [{ type: 'table', head: ['Certificate', 'Reference', 'Expiry date'], rows, widths: [2, 2, 1.4] }] }],
    });
    return { buffer, name: `${company.split(' ')[0]}-compliance-evidence-${period.replace(' ', '-')}.pdf` };
  }
  // bank_statements
  const banks = ((values.bank_balances as Array<Record<string, unknown>>) ?? []).map((b) => [String(b.bank ?? ''), String(b.currency ?? ''), String(b.balance ?? '')]);
  const buffer = await buildPdf({
    title: 'Bank statement summary',
    subtitle: `${company} · ${period}`,
    reference,
    meta: [['Company', company], ['Period', period]],
    pages: [{ heading: 'Closing balances', blocks: [{ type: 'table', head: ['Bank', 'Currency', 'Closing balance'], rows: banks }] }],
  });
  return { buffer, name: `${company.split(' ')[0]}-bank-statements-${period.replace(' ', '-')}.pdf` };
}

export async function seedCompanies(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;

  const companyDefs = [
    { key: 'africapay' as const, ref: 'PC-001', name: 'Africa Payments Holdings', sector: 'Fintech / Payments', country: 'Zimbabwe', fundName: 'Matanho Growth Fund I', description: 'Mobile money, merchant acquiring and cross-border remittance platform serving Zimbabwe and the SADC region.' },
    { key: 'lakeside' as const, ref: 'PC-002', name: 'Lakeside Agri Holdings', sector: 'Agribusiness', country: 'Zambia', fundName: 'Matanho Growth Fund I', description: 'Integrated agribusiness: outgrower programmes, primary processing and export of soya, maize and horticulture.' },
  ];
  const companyIds: Record<string, string> = {};
  for (const c of companyDefs) {
    const row = await prisma.portfolioCompany.create({
      data: { ref: c.ref, organisationId: ctx.get(`org.${c.key}`), name: c.name, sector: c.sector, country: c.country, fundName: c.fundName, description: c.description, status: 'ACTIVE' },
    });
    ctx.set(`company.${c.key}`, row.id);
    companyIds[c.key] = row.id;
  }

  const opsUser = await prisma.user.findUniqueOrThrow({ where: { id: ctx.get('user.ops') } });

  const audit = (a: { by: 'ops' | 'company'; company: Profile['key']; entityId: string; action: string; at: Date; before?: unknown; after?: unknown; metadata?: Record<string, unknown> }) => {
    const promise = a.by === 'ops' ? Promise.resolve(opsUser) : prisma.user.findUniqueOrThrow({ where: { id: ctx.get(`user.${a.company}`) } });
    return promise.then((u) =>
      prisma.auditEvent.create({
        data: {
          actorId: u.id,
          actorEmail: u.email,
          actorRole: a.by === 'ops' ? 'OPERATIONS' : 'COMPANY_USER',
          orgId: a.by === 'ops' ? ctx.get('org.am') : ctx.get(`org.${a.company}`),
          entityType: 'CompanyReportingSubmission',
          entityId: a.entityId,
          action: a.action,
          before: a.before === undefined ? undefined : (JSON.parse(JSON.stringify(a.before)) as Prisma.InputJsonValue),
          after: a.after === undefined ? undefined : (JSON.parse(JSON.stringify(a.after)) as Prisma.InputJsonValue),
          metadata: { actorName: u.name, seeded: true, ...(a.metadata ?? {}) } as Prisma.InputJsonValue,
          createdAt: a.at,
        },
      }),
    );
  };

  interface PackSeed {
    company: Profile['key'];
    k: number;
    status: CompanySubmissionStatus;
    keys?: string[]; // value keys to include (default: all)
    files: string[]; // file slots to upload
    version?: number;
    dueInDays: number;
    submittedDaysAgo?: number;
    reviewedDaysAgo?: number;
    reviewNote?: string;
  }

  const seedPack = async (s: PackSeed) => {
    const profile = PROFILES[s.company];
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.get(`user.${s.company}`) } });
    const companyId = companyIds[s.company]!;
    const companyName = companyDefs.find((c) => c.key === s.company)!.name;
    const start = monthStart(ctx.today, s.k);
    const end = monthEnd(ctx.today, s.k);
    const lbl = label(start);

    const period = await prisma.reportingPeriod.create({
      data: { companyId, label: lbl, periodStart: start, periodEnd: end, dueDate: ctx.daysFromNow(s.dueInDays), status: s.status === 'ACCEPTED' ? 'CLOSED' : 'OPEN' },
    });

    const allValues = packValues(ctx, profile, s.k);
    const values = s.keys ? pick(allValues, s.keys) : allValues;
    const submittedAt = s.submittedDaysAgo !== undefined ? at(ctx.daysAgo(s.submittedDaysAgo), 10, 20) : null;
    const reviewedAt = s.reviewedDaysAgo !== undefined ? at(ctx.daysAgo(s.reviewedDaysAgo), 15, 5) : null;

    const sub = await prisma.companyReportingSubmission.create({
      data: {
        ref: await ctx.refs.companySubmission(),
        periodId: period.id,
        companyId,
        status: s.status,
        version: s.version ?? 1,
        completionPct: 0,
        submittedAt,
        submittedById: submittedAt ? user.id : null,
        submittedByName: submittedAt ? user.name : null,
        reviewedAt,
        reviewedById: reviewedAt ? opsUser.id : null,
        reviewedByName: reviewedAt ? opsUser.name : null,
        reviewNote: s.reviewNote ?? null,
      },
    });

    // values (numbers → valueNumber, strings → valueText, repeaters → valueJson)
    for (const [key, v] of Object.entries(values)) {
      const enc = encodeValue(key, v);
      if (enc.remove) continue;
      await prisma.companyReportingValue.create({
        data: { submissionId: sub.id, key, valueNumber: enc.valueNumber, valueText: enc.valueText, valueJson: enc.valueJson === Prisma.DbNull ? undefined : enc.valueJson, updatedById: user.id },
      });
    }

    // evidence files (real PDFs); board_report on the SUBMITTED pack carries a second version to show history
    const slotMeta = new Map(REPORTING_PACK.flatMap((sec) => sec.files).map((f) => [f.key, f]));
    for (const slotKey of s.files) {
      const slot = slotMeta.get(slotKey)!;
      const f = await fileBuffer(slotKey, companyName, lbl, allValues, `${sub.ref}-${slotKey}`);
      const doc = await ctx.docs.create(
        { buffer: f.buffer, originalname: f.name, mimetype: 'application/pdf', size: f.buffer.length },
        {
          title: `${slot.label} (${lbl})`,
          category: slot.category,
          audience: 'COMPANY',
          ownerOrgId: ctx.get(`org.${s.company}`),
          companyId,
          submissionId: sub.id,
          requirementKey: slotKey,
          reportDate: end,
        },
        { name: user.name },
      );
      if (s.status === 'SUBMITTED' && slotKey === 'board_report') {
        const v2 = await fileBuffer(slotKey, companyName, lbl, { ...allValues, board_commentary: `${String(allValues.board_commentary)} (Revised: includes the signed resolution schedule.)` }, `${sub.ref}-${slotKey}-v2`);
        await ctx.docs.addVersion(doc.id, { buffer: v2.buffer, originalname: v2.name.replace('.pdf', '-v2.pdf'), mimetype: 'application/pdf', size: v2.buffer.length }, { name: user.name }, 'Replaced with the signed version');
      }
    }

    // requirement rows + completion derived from the actual values and files (never a flag)
    const { completion, sections } = analysePack(values, s.files);
    await prisma.reportingRequirement.createMany({
      data: REPORTING_PACK.map((sec) => ({
        periodId: period.id,
        category: sec.category,
        key: sec.key,
        title: sec.title,
        description: sec.description,
        isRequired: true,
        status: sections.find((x) => x.key === sec.key)!.status,
      })),
    });
    await prisma.companyReportingSubmission.update({ where: { id: sub.id }, data: { completionPct: completion.percent } });

    // timeline
    if (submittedAt) {
      await audit({ by: 'company', company: s.company, entityId: sub.id, action: 'COMPANY_PACK_SUBMITTED', at: submittedAt, before: { status: 'DRAFT' }, after: { status: 'SUBMITTED', version: 1, completionPct: completion.percent }, metadata: { period: lbl, company: companyName } });
    }
    ctx.set(`period.${s.company}.k${s.k}`, period.id);
    ctx.set(`submission.${s.company}.k${s.k}`, sub.id);
    return { sub, period, submittedAt, completion };
  };

  // ── Africa Payments Holdings ────────────────────────────────────────────────────────────────────────
  const a3 = await seedPack({ company: 'africapay', k: 3, status: 'ACCEPTED', files: ['management_accounts_file', 'board_report', 'compliance_evidence'], dueInDays: -36, submittedDaysAgo: 39, reviewedDaysAgo: 35, reviewNote: 'Reviewed and accepted. Thank you.' });
  await prisma.companyReportingQuestion.create({
    data: {
      submissionId: a3.sub.id,
      requirementKey: 'debt_cash',
      question: 'Please confirm the drawn balance on the Afreximbank term loan agrees to the lender statement.',
      raisedById: opsUser.id,
      raisedByName: opsUser.name,
      answer: 'Confirmed: the drawn balance of US$3.8M agrees to the lender statement dated month-end.',
      answeredByName: 'Tapiwa Chinembiri',
      answeredAt: ctx.daysAgo(37),
      status: 'CLOSED',
      createdAt: ctx.daysAgo(38),
      closedAt: ctx.daysAgo(35),
    },
  });
  await audit({ by: 'ops', company: 'africapay', entityId: a3.sub.id, action: 'COMPANY_QUESTION_RAISED', at: ctx.daysAgo(38), metadata: { question: 'Please confirm the drawn balance on the Afreximbank term loan agrees to the lender statement.' } });
  await audit({ by: 'company', company: 'africapay', entityId: a3.sub.id, action: 'COMPANY_QUESTION_ANSWERED', at: ctx.daysAgo(37), metadata: { answer: 'Confirmed: the drawn balance of US$3.8M agrees to the lender statement dated month-end.' } });
  await audit({ by: 'ops', company: 'africapay', entityId: a3.sub.id, action: 'COMPANY_PACK_ACCEPTED', at: at(ctx.daysAgo(35), 15, 5), before: { status: 'SUBMITTED' }, after: { status: 'ACCEPTED' }, metadata: { note: 'Reviewed and accepted. Thank you.' } });

  const a2 = await seedPack({ company: 'africapay', k: 2, status: 'SUBMITTED', files: ['management_accounts_file', 'board_report', 'compliance_evidence', 'bank_statements'], dueInDays: -2, submittedDaysAgo: 3 });
  // current period: partially complete DRAFT (~76%): the live Flow-4 demo completes and submits it
  const draftKeys = [
    'is_revenue', 'is_cost_of_sales', 'is_operating_expenses', 'is_net_income',
    'bs_total_assets', 'bs_total_liabilities', 'bs_total_equity', 'bs_cash',
    'cf_operating', 'cf_investing', 'cf_financing', 'cf_closing_cash',
    'kpi_revenue', 'kpi_active_customers', 'kpi_churn_pct', 'kpi_commentary',
    'bank_balances', 'facilities',
  ];
  const a1 = await seedPack({ company: 'africapay', k: 1, status: 'DRAFT', keys: draftKeys, files: [], dueInDays: 7 });

  // ── Lakeside Agri Holdings ─────────────────────────────────────────────────────────────────────────
  const l3 = await seedPack({ company: 'lakeside', k: 3, status: 'ACCEPTED', files: ['management_accounts_file', 'board_report', 'compliance_evidence'], dueInDays: -34, submittedDaysAgo: 37, reviewedDaysAgo: 33, reviewNote: 'Accepted without queries.' });
  await audit({ by: 'ops', company: 'lakeside', entityId: l3.sub.id, action: 'COMPANY_PACK_ACCEPTED', at: at(ctx.daysAgo(33), 11, 30), before: { status: 'SUBMITTED' }, after: { status: 'ACCEPTED' }, metadata: { note: 'Accepted without queries.' } });

  const l2 = await seedPack({ company: 'lakeside', k: 2, status: 'QUESTIONS_OPEN', files: ['management_accounts_file', 'board_report', 'compliance_evidence'], dueInDays: -4, submittedDaysAgo: 5 });
  const q1 = 'Cost of sales rose sharply against the prior month. Please explain the drivers and confirm whether the new fertiliser supply contract is fully reflected in this pack.';
  const q2 = 'Please provide the updated crop insurance certificate; the reference on file expires within the quarter.';
  await prisma.companyReportingQuestion.create({
    data: { submissionId: l2.sub.id, requirementKey: 'management_accounts', question: q1, raisedById: opsUser.id, raisedByName: opsUser.name, status: 'OPEN', createdAt: ctx.daysAgo(2) },
  });
  await prisma.companyReportingQuestion.create({
    data: {
      submissionId: l2.sub.id,
      requirementKey: 'compliance',
      question: q2,
      raisedById: opsUser.id,
      raisedByName: opsUser.name,
      answer: 'The renewed crop insurance policy certificate was issued last week and is attached to the compliance evidence pack on resubmission.',
      answeredByName: 'Rufaro Mlambo',
      answeredAt: ctx.daysAgo(1),
      status: 'ANSWERED',
      createdAt: ctx.daysAgo(2),
    },
  });
  await audit({ by: 'ops', company: 'lakeside', entityId: l2.sub.id, action: 'COMPANY_QUESTION_RAISED', at: at(ctx.daysAgo(2), 9, 40), before: { status: 'SUBMITTED' }, after: { status: 'QUESTIONS_OPEN' }, metadata: { question: q1, requirementKey: 'management_accounts' } });
  await audit({ by: 'ops', company: 'lakeside', entityId: l2.sub.id, action: 'COMPANY_QUESTION_RAISED', at: at(ctx.daysAgo(2), 9, 42), metadata: { question: q2, requirementKey: 'compliance' } });
  await audit({ by: 'company', company: 'lakeside', entityId: l2.sub.id, action: 'COMPANY_QUESTION_ANSWERED', at: at(ctx.daysAgo(1), 14, 10), metadata: { answer: 'The renewed crop insurance policy certificate was issued last week and is attached to the compliance evidence pack on resubmission.' } });

  const l1 = await seedPack({ company: 'lakeside', k: 1, status: 'DRAFT', keys: ['is_revenue', 'is_cost_of_sales', 'is_operating_expenses', 'is_net_income', 'kpi_revenue', 'kpi_active_customers'], files: [], dueInDays: 7 });

  // ── notifications ─────────────────────────────────────────────────────────────────────────────────
  await prisma.notification.create({
    data: {
      organisationId: ctx.get('org.am'),
      type: 'COMPANY_SUBMISSION',
      title: 'Reporting pack submitted',
      body: `Africa Payments Holdings submitted the ${a2.period.label} reporting pack (version 1).`,
      link: `/internal/companies/submissions/${a2.sub.id}`,
      entityType: 'CompanyReportingSubmission',
      entityId: a2.sub.id,
      createdAt: a2.submittedAt ?? undefined,
    },
  });
  await prisma.notification.create({
    data: {
      organisationId: ctx.get('org.lakeside'),
      type: 'COMPANY_QUESTION',
      title: `New question on your ${l2.period.label} reporting pack`,
      body: q1,
      link: '/company',
      entityType: 'CompanyReportingSubmission',
      entityId: l2.sub.id,
    },
  });
  await prisma.notification.create({
    data: {
      organisationId: ctx.get('org.africapay'),
      type: 'COMPANY_REMINDER',
      title: `${a1.period.label} reporting pack is due in 7 days`,
      body: `${a1.completion.percent}% complete. Upload the management accounts, board report and compliance evidence to finish.`,
      link: '/company',
    },
  });

  ctx.log(
    `2 portfolio companies; Africa Payments: ${a3.period.label} ACCEPTED, ${a2.period.label} SUBMITTED (awaiting review), ${a1.period.label} DRAFT ${a1.completion.percent}%; Lakeside: ${l3.period.label} ACCEPTED, ${l2.period.label} QUESTIONS_OPEN (1 open), ${l1.period.label} DRAFT ${l1.completion.percent}%`,
  );
}
