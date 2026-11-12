'use client';

import * as React from 'react';
import { Checkbox as CB, RadioGroup as RG, Select as SL, Switch as SW, Tabs as TB } from 'radix-ui';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Toaster as Sonner } from 'sonner';
import { cn } from '@/lib/utils';
import { inputBase } from './input';

/* ── Checkbox ───────────────────────────────────────────────────────────────── */
export function Checkbox({ className, ...props }: React.ComponentProps<typeof CB.Root>) {
  return (
    <CB.Root
      className={cn(
        'peer grid size-4 shrink-0 place-items-center rounded-[4px] border border-input bg-surface outline-none transition-colors hover:border-[#b9b4a8] focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary aria-invalid:border-danger',
        className,
      )}
      {...props}
    >
      <CB.Indicator>
        <Check className="size-3 text-white" strokeWidth={3} />
      </CB.Indicator>
    </CB.Root>
  );
}

/* ── Radio group ────────────────────────────────────────────────────────────── */
export const RadioGroup = RG.Root;
export function RadioItem({ className, ...props }: React.ComponentProps<typeof RG.Item>) {
  return (
    <RG.Item
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-full border border-input bg-surface outline-none transition-colors hover:border-[#b9b4a8] focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:opacity-50 data-[state=checked]:border-primary',
        className,
      )}
      {...props}
    >
      <RG.Indicator>
        <span className="block size-2 rounded-full bg-primary" />
      </RG.Indicator>
    </RG.Item>
  );
}

/* ── Switch ─────────────────────────────────────────────────────────────────── */
export function Switch({ className, ...props }: React.ComponentProps<typeof SW.Root>) {
  return (
    <SW.Root
      className={cn(
        'peer inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border border-transparent bg-[#cfccc3] outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-primary/20 disabled:opacity-50 data-[state=checked]:bg-primary',
        className,
      )}
      {...props}
    >
      <SW.Thumb className="block size-[14px] translate-x-[2px] rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[16px]" />
    </SW.Root>
  );
}

/* ── Select (native-feeling, custom styled) ─────────────────────────────────── */
export const Select = SL.Root;
export const SelectValue = SL.Value;

export function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SL.Trigger>) {
  return (
    <SL.Trigger
      className={cn(inputBase, 'h-9 items-center justify-between gap-2 text-left data-[placeholder]:text-ink-3 [&>span]:truncate', className)}
      {...props}
    >
      {children}
      <SL.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-ink-3" />
      </SL.Icon>
    </SL.Trigger>
  );
}

export function SelectContent({ className, children, position = 'popper', ...props }: React.ComponentProps<typeof SL.Content>) {
  return (
    <SL.Portal>
      <SL.Content
        position={position}
        sideOffset={4}
        className={cn(
          'z-[70] max-h-[300px] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-popover text-[13px] shadow-[var(--shadow-pop)] data-[state=open]:animate-[nx-pop-in_0.14s_ease-out]',
          className,
        )}
        {...props}
      >
        <SL.ScrollUpButton className="grid h-6 place-items-center text-ink-3">
          <ChevronUp className="size-4" />
        </SL.ScrollUpButton>
        <SL.Viewport className="p-1">{children}</SL.Viewport>
        <SL.ScrollDownButton className="grid h-6 place-items-center text-ink-3">
          <ChevronDown className="size-4" />
        </SL.ScrollDownButton>
      </SL.Content>
    </SL.Portal>
  );
}

export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SL.Item>) {
  return (
    <SL.Item
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-md py-2 pl-7 pr-3 outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-surface-sunken',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 grid size-4 place-items-center">
        <SL.ItemIndicator>
          <Check className="size-3.5 text-primary" />
        </SL.ItemIndicator>
      </span>
      <SL.ItemText>{children}</SL.ItemText>
    </SL.Item>
  );
}

/* ── Tabs (underline style; the segmented variant lives in nx/segmented) ───── */
export const Tabs = TB.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof TB.List>) {
  return <TB.List className={cn('nx-scroll flex items-end gap-1 overflow-x-auto border-b border-border', className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TB.Trigger>) {
  return (
    <TB.Trigger
      className={cn(
        '-mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 border-transparent px-3.5 text-[12.5px] font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}
export function TabsContent({ className, ...props }: React.ComponentProps<typeof TB.Content>) {
  return <TB.Content className={cn('outline-none data-[state=active]:animate-fade-in', className)} {...props} />;
}

/* ── Skeleton ───────────────────────────────────────────────────────────────── */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-md bg-[#e9e7e1]', className)} {...props} />;
}

/* ── Toaster (sonner, restyled) ─────────────────────────────────────────────── */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: '!rounded-lg !border !border-border !bg-surface !text-foreground !shadow-[var(--shadow-pop)] !text-[12.5px]',
          title: '!font-semibold',
          description: '!text-muted-foreground',
        },
      }}
    />
  );
}
