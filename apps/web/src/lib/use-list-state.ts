'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export interface ListState {
  page: number;
  pageSize: number;
  q: string;
  /** debounced search value to send to the API */
  qDebounced: string;
  sort?: string;
  order: 'asc' | 'desc';
  filters: Record<string, string | undefined>;
}

/**
 * Server-driven list state for registers: search (debounced), filters, sorting, pagination.
 * `params` is ready to spread into `useQuery(['key', params])` / `api(path, { query: params })`.
 * Changing search, filters, sort or page size resets to page 1.
 */
export function useListState(initial?: { pageSize?: number; sort?: string; order?: 'asc' | 'desc'; filters?: Record<string, string | undefined> }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initial?.pageSize ?? 20);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [sort, setSort] = useState<string | undefined>(initial?.sort);
  const [order, setOrder] = useState<'asc' | 'desc'>(initial?.order ?? 'desc');
  const [filters, setFilters] = useState<Record<string, string | undefined>>(initial?.filters ?? {});

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const setFilter = useCallback((key: string, value: string | undefined) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }, []);

  const onSort = useCallback(
    (key: string) => {
      setPage(1);
      setSort((cur) => {
        if (cur === key) {
          setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
          return cur;
        }
        setOrder('asc');
        return key;
      });
    },
    [],
  );

  const params = useMemo(
    () => ({ page, pageSize, q: qDebounced || undefined, sort, order, ...filters }),
    [page, pageSize, qDebounced, sort, order, filters],
  );

  const state: ListState = { page, pageSize, q, qDebounced, sort, order, filters };
  return {
    state,
    params,
    setPage,
    setPageSize: (n: number) => {
      setPageSize(n);
      setPage(1);
    },
    setQ,
    setFilter,
    onSort,
    reset: () => {
      setQ('');
      setFilters(initial?.filters ?? {});
      setPage(1);
    },
  };
}
