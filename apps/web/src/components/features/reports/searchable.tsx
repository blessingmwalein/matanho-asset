'use client';

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inputBase } from '@/components/ui/input';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menus';

/** Standalone (non-RHF) searchable select with an "all" reset, for filter bars and report parameters. */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: Array<{ value: string; label: string; hint?: string }>;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn(inputBase, 'h-9 min-w-[220px] items-center justify-between gap-2 text-left', !selected && 'text-ink-3', className)}>
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-ink-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__all__ all" onSelect={() => { onChange(undefined); setOpen(false); }}>
                <Check className={cn('size-3.5 text-primary', value ? 'opacity-0' : 'opacity-100')} /> {placeholder}
              </CommandItem>
              {options.map((o) => (
                <CommandItem key={o.value} value={`${o.label} ${o.hint ?? ''}`} onSelect={() => { onChange(o.value); setOpen(false); }}>
                  <Check className={cn('size-3.5 text-primary', value === o.value ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="num text-[11px] text-muted-foreground">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
