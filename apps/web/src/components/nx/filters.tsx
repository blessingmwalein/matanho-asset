'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/controls';

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative min-w-[200px] flex-1 sm:max-w-[320px]', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-md border border-input bg-surface pl-8 pr-8 text-[12.5px] outline-none placeholder:text-ink-3 hover:border-[#c9c5bb] focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/12"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-ink-3 hover:bg-surface-sunken hover:text-foreground">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

const ALL = '__all__';

/** Compact single-select filter with an "All" option. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger aria-label={label} className={cn('h-9 w-auto min-w-[140px] gap-2 text-[12.5px]', className)}>
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Search + filters row shown above registers. */
export function FilterBar({ children, className, right }: { children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 border-b border-border-soft px-3 py-2.5', className)}>
      {children}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

/** Segmented control: used for period selectors (1M / 3M / YTD …) and view toggles. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }> | readonly T[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  const opts = (options as ReadonlyArray<T | { value: T; label: string }>).map((o) => (typeof o === 'string' ? { value: o as T, label: o as string } : o));
  return (
    <div role="tablist" className={cn('inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5', className)}>
      {opts.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[5px] px-2.5 font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30',
            size === 'sm' ? 'h-6 text-[10.5px]' : 'h-7 text-[11px]',
            value === o.value ? 'bg-surface text-foreground shadow-[0_1px_2px_rgba(15,27,45,0.1)]' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
