'use client';

import * as React from 'react';
import { Dialog as D, AlertDialog as AD } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, IconButton } from './button';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

const overlayCls = 'fixed inset-0 z-50 bg-[#0b1420]/40 data-[state=open]:animate-fade-in';

export function DialogContent({
  className,
  children,
  title,
  description,
  size = 'md',
  hideClose,
  ...props
}: React.ComponentProps<typeof D.Content> & { title: string; description?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; hideClose?: boolean }) {
  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <D.Portal>
      <D.Overlay className={overlayCls} />
      <D.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-surface shadow-[var(--shadow-pop)] outline-none data-[state=open]:animate-rise',
          w,
          className,
        )}
        {...props}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border-soft px-5 py-4">
          <div className="min-w-0">
            <D.Title className="text-[15px] font-semibold tracking-tight">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          {!hideClose && (
            <D.Close asChild>
              <IconButton label="Close" size="icon-sm">
                <X />
              </IconButton>
            </D.Close>
          )}
        </header>
        <div className="nx-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('-mx-5 -mb-4 mt-5 flex items-center justify-end gap-2 border-t border-border-soft bg-surface-2 px-5 py-3', className)} {...props} />;
}

/** Confirmation dialog for irreversible or sensitive actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  loading,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'destructive';
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  children?: React.ReactNode;
}) {
  return (
    <AD.Root open={open} onOpenChange={onOpenChange}>
      <AD.Portal>
        <AD.Overlay className={overlayCls} />
        <AD.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-24px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-5 shadow-[var(--shadow-pop)] outline-none data-[state=open]:animate-rise">
          <AD.Title className="text-[15px] font-semibold">{title}</AD.Title>
          <AD.Description asChild>
            <div className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{description}</div>
          </AD.Description>
          {children ? <div className="mt-3">{children}</div> : null}
          <div className="mt-5 flex justify-end gap-2">
            <AD.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AD.Cancel>
            <Button
              variant={tone === 'destructive' ? 'destructive' : 'primary'}
              loading={loading}
              onClick={(e) => {
                e.preventDefault();
                void onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}
