import type { INestApplicationContext } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { DocumentsService } from '../modules/documents/documents.service';
import type { ReferenceService } from '../common/references/reference.service';

/**
 * Shared seed context. Every domain seed receives this and assumes an EMPTY database
 * (index.ts truncates everything except the immutable AuditEvent table first).
 *
 * Registry: seeds publish created ids with `ctx.set('portfolio.bgf', id)` and look up others with
 * `ctx.get('investor.horizon')`. Key conventions (create these exactly):
 *   org.am  org.horizon  org.cedar  org.custodianA  org.custodianB  org.africapay  org.lakeside
 *   user.admin user.am user.ops user.compliance user.readonly
 *   user.horizon1 user.horizon2 user.horizon3 user.cedar1 user.custodianA user.custodianB user.africapay user.lakeside
 *   role.<KEY>   investor.horizon  investor.cedar   application.horizon application.cedar
 *   security.<TICKER>  portfolio.bgf portfolio.arf portfolio.inc portfolio.cedar1
 *   account.horizon-<x> ...  fund.mgfi fund.pcfi  commitment.horizon-mgfi commitment.horizon-pcfi
 *   custacct.bgf custacct.arf custacct.inc custacct.cedar1   company.africapay company.lakeside
 */
export interface SeedContext {
  prisma: PrismaClient;
  app: INestApplicationContext;
  docs: DocumentsService;
  refs: ReferenceService;
  /** UTC midnight of the day the seed runs. All demo dates are relative to this. */
  today: Date;
  /** Deterministic PRNG (mulberry32): same sequence every run. */
  rng: () => number;
  /** Password hash shared by every demo user */
  passwordHash: string;
  demoPassword: string;
  set(key: string, id: string): void;
  get(key: string): string;
  has(key: string): boolean;
  /** Date helpers (UTC midnight) */
  daysAgo(n: number): Date;
  daysFromNow(n: number): Date;
  /** Business-day helpers: nth previous weekday (skips Sat/Sun) */
  businessDaysAgo(n: number): Date;
  log(msg: string): void;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function makeContext(base: Pick<SeedContext, 'prisma' | 'app' | 'docs' | 'refs' | 'passwordHash' | 'demoPassword'>): SeedContext {
  const registry = new Map<string, string>();
  const today = utcMidnight(new Date());
  const add = (n: number) => new Date(today.getTime() + n * 86400000);
  return {
    ...base,
    today,
    rng: mulberry32(20260901),
    set: (k, v) => {
      registry.set(k, v);
    },
    get: (k) => {
      const v = registry.get(k);
      if (!v) throw new Error(`Seed registry: "${k}" has not been created yet (check seed order)`);
      return v;
    },
    has: (k) => registry.has(k),
    daysAgo: (n) => add(-n),
    daysFromNow: (n) => add(n),
    businessDaysAgo: (n) => {
      let d = today;
      let left = n;
      while (left > 0) {
        d = new Date(d.getTime() - 86400000);
        const dow = d.getUTCDay();
        if (dow !== 0 && dow !== 6) left--;
      }
      return d;
    },
    log: (m) => {
      // eslint-disable-next-line no-console
      console.log(`  • ${m}`);
    },
  };
}
