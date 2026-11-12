import { Prisma } from '@prisma/client';

export const D = (v: Prisma.Decimal.Value | null | undefined): Prisma.Decimal => new Prisma.Decimal(v === null || v === undefined ? 0 : v);

/** Round half-up to money precision (2dp). */
export const money = (v: Prisma.Decimal.Value): Prisma.Decimal => D(v).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/** quantity × price rounded to money (MVP market-value model). */
export const marketValue = (qty: Prisma.Decimal.Value, price: Prisma.Decimal.Value): Prisma.Decimal => money(D(qty).mul(D(price)));

export const sum = (values: Array<Prisma.Decimal.Value | null | undefined>): Prisma.Decimal =>
  values.reduce<Prisma.Decimal>((a, v) => a.add(D(v)), new Prisma.Decimal(0));

/** Parse YYYY-MM-DD as a UTC date (matches @db.Date columns). */
export const dateOnly = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

export const todayUtc = (): Date => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};

export const toISODate = (d: Date): string => d.toISOString().slice(0, 10);
