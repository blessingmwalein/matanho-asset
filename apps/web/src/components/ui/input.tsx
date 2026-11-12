import * as React from 'react';
import { cn } from '@/lib/utils';

export const inputBase =
  'flex w-full rounded-md border border-input bg-surface px-3 text-[13px] text-foreground placeholder:text-ink-3 transition-[border-color,box-shadow] duration-150 outline-none hover:border-[#c9c5bb] focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/12 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-3 aria-invalid:border-danger aria-invalid:ring-danger/10';

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(inputBase, 'h-9', className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(inputBase, 'min-h-[76px] resize-y py-2 leading-relaxed', className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label data-slot="label" className={cn('text-[11.5px] font-semibold text-ink-2', className)} {...props} />;
}
