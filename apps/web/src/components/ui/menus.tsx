'use client';

import * as React from 'react';
import { DropdownMenu as DM, Popover as PO, Tooltip as TT } from 'radix-ui';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Dropdown menu ──────────────────────────────────────────────────────────── */
export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;

export function DropdownMenuContent({ className, sideOffset = 6, align = 'end', ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 min-w-[190px] overflow-hidden rounded-lg border border-border bg-popover p-1 text-[12.5px] shadow-[var(--shadow-pop)] data-[state=open]:animate-[nx-pop-in_0.14s_ease-out]',
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}

export function DropdownMenuItem({ className, tone, ...props }: React.ComponentProps<typeof DM.Item> & { tone?: 'danger' }) {
  return (
    <DM.Item
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-surface-sunken [&_svg]:size-[15px] [&_svg]:text-ink-3',
        tone === 'danger' && 'text-danger [&_svg]:text-danger',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn('eyebrow px-2.5 py-1.5', className)} {...props} />;
}
export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn('-mx-1 my-1 h-px bg-border-soft', className)} {...props} />;
}

export function DropdownMenuCheckItem({ className, children, ...props }: React.ComponentProps<typeof DM.CheckboxItem>) {
  return (
    <DM.CheckboxItem
      className={cn('relative flex cursor-pointer select-none items-center gap-2 rounded-md py-2 pl-7 pr-2.5 outline-none data-[highlighted]:bg-surface-sunken', className)}
      {...props}
    >
      <DM.ItemIndicator className="absolute left-2">
        <Check className="size-3.5 text-primary" />
      </DM.ItemIndicator>
      {children}
    </DM.CheckboxItem>
  );
}

/* ── Popover ────────────────────────────────────────────────────────────────── */
export const Popover = PO.Root;
export const PopoverTrigger = PO.Trigger;
export const PopoverAnchor = PO.Anchor;

export function PopoverContent({ className, align = 'start', sideOffset = 6, ...props }: React.ComponentProps<typeof PO.Content>) {
  return (
    <PO.Portal>
      <PO.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 rounded-lg border border-border bg-popover p-3 text-[12.5px] shadow-[var(--shadow-pop)] outline-none data-[state=open]:animate-[nx-pop-in_0.14s_ease-out]',
          className,
        )}
        {...props}
      />
    </PO.Portal>
  );
}

/* ── Tooltip ────────────────────────────────────────────────────────────────── */
export const TooltipProvider = TT.Provider;
export function Tooltip({ content, children, side = 'right' }: { content: React.ReactNode; children: React.ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <TT.Root delayDuration={150}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content
          side={side}
          sideOffset={8}
          className="z-[60] rounded-md bg-foreground px-2.5 py-1.5 text-[11px] font-medium text-white shadow-[var(--shadow-pop)] data-[state=delayed-open]:animate-[nx-pop-in_0.12s_ease-out]"
        >
          {content}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}
