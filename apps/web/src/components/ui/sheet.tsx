'use client';

import * as React from 'react';
import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from './button';

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;

/**
 * Right-hand detail drawer. Slides in over the workspace; used for record details
 * (investor, application, reconciliation item, document preview).
 */
export function SheetContent({
  className,
  children,
  eyebrow,
  title,
  description,
  actions,
  width = 'md',
  ...props
}: React.ComponentProps<typeof D.Content> & {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
}) {
  const w = { md: 'sm:w-[560px]', lg: 'sm:w-[720px]', xl: 'sm:w-[920px]' }[width];
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-[#0b1420]/35 data-[state=open]:animate-fade-in" />
      <D.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-full flex-col border-l border-border bg-surface shadow-[var(--shadow-drawer)] outline-none',
          'data-[state=open]:animate-[nx-drawer-in_0.24s_cubic-bezier(0.2,0.7,0.2,1)] data-[state=closed]:animate-[nx-drawer-out_0.18s_ease-in]',
          w,
          className,
        )}
        {...props}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
            <D.Title className="truncate text-[17px] font-semibold tracking-tight">{title}</D.Title>
            {description ? (
              <D.Description asChild>
                <div className="mt-1 text-[12px] text-muted-foreground">{description}</div>
              </D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <D.Close asChild>
              <IconButton label="Close panel" variant="secondary">
                <X />
              </IconButton>
            </D.Close>
          </div>
        </header>
        <div className="nx-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
