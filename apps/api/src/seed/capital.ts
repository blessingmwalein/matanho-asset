import type { SeedContext } from './seed-context';

/** Last day of the previous calendar quarter (UTC midnight). */
export function lastQuarterEnd(today: Date): Date {
  const q = Math.floor(today.getUTCMonth() / 3);
  return new Date(Date.UTC(today.getUTCFullYear(), q * 3, 0));
}

/**
 * Private-market capital: funds MGFI / PCFI, Horizon's commitments and the capital-event history
 * from client-portal.html. Cedar has no private commitments.
 *
 * Contract (CONVENTIONS §5): MGFI commitment 2.5m / called 1.4m / NAV 1.76m / IRR 18.4 / TVPI 1.38 / DPI 0.24;
 * PCFI 1.85m / 1.1m / 1.08m / 13.2 / 1.21 / 0.31; open call CC-<year>-03 (250k, issued ~3 days ago, due in ~14 days).
 * Distributions total 680k (340k each) of which 340k fall in the current year, so "Distributions YTD" is 340k.
 * An acknowledgement never changes calledAmount; the open call is NOT included in the called figures.
 */
export async function seedCapital(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;
  const investorId = ctx.get('investor.horizon');
  const amUser = ctx.get('user.am');
  const year = ctx.today.getUTCFullYear();
  const asOf = lastQuarterEnd(ctx.today);

  /** keep current-year events inside the current year even when the seed runs early in January */
  const inYear = (n: number) => {
    const d = ctx.daysAgo(n);
    return d.getUTCFullYear() < year ? new Date(Date.UTC(year, 0, 2)) : d;
  };

  // ── funds ────────────────────────────────────────────────────────────────
  const mgfi = await prisma.fund.create({
    data: { ref: 'MGFI', name: 'Matanho Growth Fund I', type: 'PRIVATE_EQUITY', currency: 'USD', vintage: year - 3, description: 'Closed-ended private equity fund investing in growth-stage Southern African companies.' },
  });
  const pcfi = await prisma.fund.create({
    data: { ref: 'PCFI', name: 'Private Credit Fund I', type: 'PRIVATE_CREDIT', currency: 'USD', vintage: year - 2, description: 'Senior and mezzanine private credit to mid-market corporates.' },
  });
  ctx.set('fund.mgfi', mgfi.id);
  ctx.set('fund.pcfi', pcfi.id);

  // ── fund-interest accounts (selectable in the investor portal account switcher) ──
  const accountFor = async (key: string, fundId: string, name: string, ref: string, match: string) => {
    const existingId = ctx.has(`account.${key}`) ? ctx.get(`account.${key}`) : null;
    const found =
      (existingId ? await prisma.investmentAccount.findUnique({ where: { id: existingId } }) : null) ??
      (await prisma.investmentAccount.findFirst({ where: { investorId, name: { contains: match, mode: 'insensitive' } } }));
    if (found) {
      const updated = await prisma.investmentAccount.update({ where: { id: found.id }, data: { fundId, type: 'FUND_INTEREST' } });
      ctx.set(`account.${key}`, updated.id);
      return updated;
    }
    const created = await prisma.investmentAccount.create({
      data: { ref, investorId, name, type: 'FUND_INTEREST', baseCurrency: 'USD', fundId, createdById: amUser },
    });
    ctx.set(`account.${key}`, created.id);
    return created;
  };
  const mgfiAccount = await accountFor('horizon-mgfi', mgfi.id, 'Matanho Growth Fund I', 'HOR-MGFI', 'Growth Fund');
  const pcfiAccount = await accountFor('horizon-pcfi', pcfi.id, 'Private Credit Fund I', 'HOR-PCFI', 'Private Credit');

  // ── commitments ──────────────────────────────────────────────────────────
  const cMgfi = await prisma.commitment.create({
    data: { fundId: mgfi.id, investorId, accountId: mgfiAccount.id, amount: 2500000, calledAmount: 1400000, distributedAmount: 340000, nav: 1760000, irr: 18.4, tvpi: 1.38, dpi: 0.24, asOf },
  });
  const cPcfi = await prisma.commitment.create({
    data: { fundId: pcfi.id, investorId, accountId: pcfiAccount.id, amount: 1850000, calledAmount: 1100000, distributedAmount: 340000, nav: 1080000, irr: 13.2, tvpi: 1.21, dpi: 0.31, asOf },
  });
  ctx.set('commitment.horizon-mgfi', cMgfi.id);
  ctx.set('commitment.horizon-pcfi', cPcfi.id);

  // ── capital events ───────────────────────────────────────────────────────
  const funding = 'CBZ •••• 0482';
  const events: Array<{ key: string; ref: string; commitmentId: string; kind: 'CALL' | 'DISTRIBUTION'; amount: number; issue: Date; due: Date | null; status: 'ISSUED' | 'FUNDED' | 'PAID'; masked?: string }> = [
    // history (oldest first)
    { key: 'dist-prev-pcfi', ref: `DIST-${year - 1}-02`, commitmentId: cPcfi.id, kind: 'DISTRIBUTION', amount: 130000, issue: ctx.daysAgo(440), due: ctx.daysAgo(440), status: 'PAID' },
    { key: 'dist-prev-mgfi', ref: `DIST-${year - 1}-01`, commitmentId: cMgfi.id, kind: 'DISTRIBUTION', amount: 210000, issue: ctx.daysAgo(400), due: ctx.daysAgo(400), status: 'PAID' },
    { key: 'cc01', ref: `CC-${year}-01`, commitmentId: cMgfi.id, kind: 'CALL', amount: 300000, issue: inYear(153), due: inYear(139), status: 'FUNDED', masked: funding },
    { key: 'dist01', ref: `DIST-${year}-01`, commitmentId: cMgfi.id, kind: 'DISTRIBUTION', amount: 130000, issue: inYear(102), due: inYear(102), status: 'PAID' },
    { key: 'cc02', ref: `CC-${year}-02`, commitmentId: cPcfi.id, kind: 'CALL', amount: 180000, issue: inYear(70), due: inYear(62), status: 'FUNDED', masked: funding },
    { key: 'dist02', ref: `DIST-${year}-02`, commitmentId: cPcfi.id, kind: 'DISTRIBUTION', amount: 210000, issue: inYear(17), due: inYear(17), status: 'PAID' },
    // the open call for the demo: due in ~14 days, still ISSUED
    { key: 'cc03', ref: `CC-${year}-03`, commitmentId: cMgfi.id, kind: 'CALL', amount: 250000, issue: ctx.daysAgo(3), due: ctx.daysFromNow(14), status: 'ISSUED', masked: funding },
  ];
  for (const e of events) {
    const row = await prisma.capitalCall.create({
      data: {
        ref: e.ref,
        commitmentId: e.commitmentId,
        kind: e.kind,
        amount: e.amount,
        issueDate: e.issue,
        dueDate: e.due,
        status: e.status,
        fundingAccountMasked: e.masked ?? null,
        createdById: amUser,
      },
    });
    ctx.set(`capitalcall.${e.key}`, row.id);
  }
  ctx.log(`2 funds, 2 Horizon commitments, ${events.length} capital events (open call CC-${year}-03 due ${ctx.daysFromNow(14).toISOString().slice(0, 10)})`);
}
