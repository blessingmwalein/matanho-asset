'use client';

import * as React from 'react';
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menus';
import { Skeleton, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/controls';
import { EmptyState, ErrorState } from './layout';

/** Column meta understood by DataTable. */
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** right-align (financial values) */
    align?: 'left' | 'right' | 'center';
    /** server sort key; column is sortable when set */
    sortKey?: string;
    /** extra classes for cells */
    className?: string;
    /** fixed width (css) */
    width?: string;
  }
}

export interface RowAction<T> {
  label: string;
  icon?: React.ReactNode;
  onSelect: (row: T) => void;
  tone?: 'danger';
  hidden?: (row: T) => boolean;
  disabled?: (row: T) => boolean;
  separatorBefore?: boolean;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[] | undefined;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** server-side pagination */
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** server-side sorting */
  sort?: string;
  order?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  rowActions?: RowAction<T>[];
  /** row selection (checkbox column) */
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  getRowId?: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  /** highlighted row id (e.g. open in drawer) */
  activeId?: string;
  className?: string;
  /** max body height; enables sticky header scroll */
  maxHeight?: string;
  dense?: boolean;
  footer?: React.ReactNode;
}

/**
 * Enterprise data table: TanStack Table core, server-driven sort and pagination,
 * sticky header, row click, contextual actions, selection, loading/empty/error states.
 */
export function DataTable<T>({
  columns,
  data,
  loading,
  error,
  onRetry,
  meta,
  onPageChange,
  onPageSizeChange,
  sort,
  order,
  onSort,
  onRowClick,
  rowActions,
  selectable,
  selectedIds = [],
  onSelectionChange,
  getRowId,
  emptyTitle = 'Nothing to show',
  emptyDescription = 'No records match the current search or filters.',
  emptyAction,
  activeId,
  className,
  maxHeight,
  dense,
  footer,
}: DataTableProps<T>) {
  const rows = data ?? [];
  const idOf = React.useCallback((r: T, i: number) => (getRowId ? getRowId(r) : String((r as { id?: string }).id ?? i)), [getRowId]);

  const allCols = React.useMemo<ColumnDef<T, any>[]>(() => {
    const cols: ColumnDef<T, any>[] = [];
    if (selectable) {
      cols.push({
        id: '__select',
        meta: { width: '36px' },
        header: () => (
          <Checkbox
            aria-label="Select all rows"
            checked={rows.length > 0 && rows.every((r, i) => selectedIds.includes(idOf(r, i))) ? true : rows.some((r, i) => selectedIds.includes(idOf(r, i))) ? 'indeterminate' : false}
            onCheckedChange={(v) => onSelectionChange?.(v ? rows.map(idOf) : [])}
          />
        ),
        cell: ({ row }) => {
          const id = idOf(row.original, row.index);
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                aria-label="Select row"
                checked={selectedIds.includes(id)}
                onCheckedChange={(v) => onSelectionChange?.(v ? [...selectedIds, id] : selectedIds.filter((x) => x !== id))}
              />
            </div>
          );
        },
      });
    }
    cols.push(...columns);
    if (rowActions?.length) {
      cols.push({
        id: '__actions',
        meta: { width: '44px', align: 'right' },
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const visible = rowActions.filter((a) => !a.hidden?.(row.original));
          if (!visible.length) return null;
          return (
            <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton label="Row actions" size="icon-sm">
                    <MoreHorizontal />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {visible.map((a) => (
                    <React.Fragment key={a.label}>
                      {a.separatorBefore && <DropdownMenuSeparator />}
                      <DropdownMenuItem tone={a.tone} disabled={a.disabled?.(row.original)} onSelect={() => a.onSelect(row.original)}>
                        {a.icon}
                        {a.label}
                      </DropdownMenuItem>
                    </React.Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, rowActions, selectable, selectedIds, rows]);

  const table = useReactTable({
    data: rows,
    columns: allCols,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    getRowId: (r, i) => idOf(r, i),
  });

  const py = dense ? 'py-2' : 'py-[11px]';
  const showSkeleton = loading && !data;

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <div className="nx-scroll min-w-0 overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
        <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-surface-2">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const m = h.column.columnDef.meta;
                  const sortKey = m?.sortKey;
                  const active = sortKey && sort === sortKey;
                  return (
                    <th
                      key={h.id}
                      style={m?.width ? { width: m.width } : undefined}
                      aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={cn(
                        'h-9 whitespace-nowrap border-b border-border px-3 text-left text-[10px] font-bold uppercase tracking-[0.07em] text-ink-3',
                        m?.align === 'right' && 'text-right',
                        m?.align === 'center' && 'text-center',
                      )}
                    >
                      {h.isPlaceholder ? null : sortKey && onSort ? (
                        <button
                          type="button"
                          onClick={() => onSort(sortKey)}
                          className={cn('inline-flex items-center gap-1 uppercase tracking-[0.07em] hover:text-foreground', m?.align === 'right' && 'flex-row-reverse', active && 'text-foreground')}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {active ? order === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {showSkeleton &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border-soft">
                  {allCols.map((_c, j) => (
                    <td key={j} className={cn('px-3', py)}>
                      <Skeleton className="h-3.5" style={{ width: `${55 + ((i * 13 + j * 17) % 40)}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
            {!showSkeleton &&
              table.getRowModel().rows.map((row) => {
                const id = row.id;
                return (
                  <tr
                    key={id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    onKeyDown={onRowClick ? (e) => (e.key === 'Enter' ? onRowClick(row.original) : undefined) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    data-active={activeId === id || undefined}
                    className={cn(
                      'group border-b border-border-soft outline-none transition-colors last:border-b-0',
                      onRowClick && 'cursor-pointer hover:bg-surface-2 focus-visible:bg-primary-soft',
                      'data-[active]:bg-primary-soft',
                      loading && 'opacity-60',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const m = cell.column.columnDef.meta;
                      return (
                        <td
                          key={cell.id}
                          className={cn('px-3 align-middle', py, m?.align === 'right' && 'num text-right', m?.align === 'center' && 'text-center', m?.className)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
        {error && !data && <ErrorState message={error} onRetry={onRetry} />}
        {!error && !loading && rows.length === 0 && <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />}
      </div>
      {footer}
      {meta && meta.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-soft px-3 py-2 text-[11.5px] text-muted-foreground">
          <span className="num">
            {(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total.toLocaleString('en-US')}
          </span>
          <div className="flex items-center gap-3">
            {onPageSizeChange && (
              <Select value={String(meta.pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                <SelectTrigger aria-label="Rows per page" className="h-7 w-[92px] text-[11.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="icon-sm" aria-label="Previous page" disabled={meta.page <= 1} onClick={() => onPageChange?.(meta.page - 1)}>
                <ChevronLeft />
              </Button>
              <span className="num px-1.5">
                {meta.page} / {meta.totalPages}
              </span>
              <Button variant="secondary" size="icon-sm" aria-label="Next page" disabled={meta.page >= meta.totalPages} onClick={() => onPageChange?.(meta.page + 1)}>
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
