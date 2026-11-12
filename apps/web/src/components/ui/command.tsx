'use client';

import * as React from 'react';
import { Command as C } from 'cmdk';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Command({ className, ...props }: React.ComponentProps<typeof C>) {
  return <C className={cn('flex w-full flex-col overflow-hidden rounded-lg bg-popover text-[13px]', className)} {...props} />;
}

export function CommandInput({ className, ...props }: React.ComponentProps<typeof C.Input>) {
  return (
    <div className="flex items-center gap-2 border-b border-border-soft px-3">
      <Search className="size-4 shrink-0 text-ink-3" />
      <C.Input
        className={cn('h-10 w-full bg-transparent text-[13px] outline-none placeholder:text-ink-3', className)}
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, ...props }: React.ComponentProps<typeof C.List>) {
  return <C.List className={cn('nx-scroll max-h-[280px] overflow-y-auto p-1', className)} {...props} />;
}

export function CommandEmpty({ className, ...props }: React.ComponentProps<typeof C.Empty>) {
  return <C.Empty className={cn('px-3 py-6 text-center text-[12px] text-muted-foreground', className)} {...props} />;
}

export function CommandGroup({ className, ...props }: React.ComponentProps<typeof C.Group>) {
  return (
    <C.Group
      className={cn('[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5', className)}
      {...props}
    />
  );
}

export function CommandItem({ className, ...props }: React.ComponentProps<typeof C.Item>) {
  return (
    <C.Item
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 outline-none data-[disabled=true]:opacity-45 data-[selected=true]:bg-surface-sunken',
        className,
      )}
      {...props}
    />
  );
}
