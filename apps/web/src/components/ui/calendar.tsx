'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** react-day-picker v9 styled with Nexus tokens (no external stylesheet needed). */
export function Calendar({ className, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays
      className={cn('p-1', className)}
      classNames={{
        months: 'flex flex-col',
        month: 'space-y-2',
        month_caption: 'flex h-8 items-center justify-center text-[12.5px] font-semibold',
        caption_label: 'text-[12.5px] font-semibold',
        nav: 'absolute inset-x-1 top-1 flex items-center justify-between',
        button_previous: 'grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface-sunken',
        button_next: 'grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface-sunken',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-8 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-3',
        week: 'mt-1 flex w-full',
        day: 'size-8 p-0 text-center text-[12px]',
        day_button: 'size-8 rounded-md font-medium outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-primary/30',
        selected: '[&>button]:bg-primary [&>button]:text-white [&>button:hover]:bg-primary-hover',
        today: '[&>button]:font-bold [&>button]:text-primary',
        outside: 'opacity-40',
        disabled: 'opacity-30',
        hidden: 'invisible',
        dropdowns: 'flex items-center gap-1',
        dropdown: 'rounded-md border border-input bg-surface px-1 py-0.5 text-[12px]',
      }}
      components={{
        Chevron: ({ orientation }) => (orientation === 'left' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />),
      }}
      {...props}
    />
  );
}
