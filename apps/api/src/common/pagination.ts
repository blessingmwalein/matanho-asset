import type { ListQuery } from '@nexus/shared';

export interface Paged<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export function pageArgs(q: Pick<ListQuery, 'page' | 'pageSize'>) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function paged<T>(data: T[], total: number, q: Pick<ListQuery, 'page' | 'pageSize'>): Paged<T> {
  return { data, meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) } };
}

/**
 * Safe `orderBy` builder: only fields in `allowed` can be sorted on.
 * `allowed` maps the public sort key → a function producing the Prisma orderBy.
 */
export function buildOrderBy<T>(
  q: Pick<ListQuery, 'sort' | 'order'>,
  allowed: Record<string, (dir: 'asc' | 'desc') => T>,
  fallback: T,
): T {
  const fn = q.sort ? allowed[q.sort] : undefined;
  return fn ? fn(q.order) : fallback;
}
