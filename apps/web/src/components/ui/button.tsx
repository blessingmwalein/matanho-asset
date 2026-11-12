import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Matanho button hierarchy:
 *   primary     → the one important action on a page / dialog
 *   secondary   → supporting action (white, hairline border)
 *   tertiary    → low-emphasis (text only)
 *   destructive → irreversible or sensitive (quiet outline, fills on hover)
 */
export const buttonVariants = cva(
  'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[12.5px] font-semibold leading-none transition-[background-color,border-color,color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-[15px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-[#173c97]',
        secondary: 'border border-input bg-surface text-foreground hover:bg-surface-2 hover:border-[#c9c5bb] active:bg-surface-sunken',
        tertiary: 'text-ink-2 hover:bg-surface-sunken hover:text-foreground active:bg-[#e8e6e0]',
        destructive: 'border border-[#e6c3c9] bg-surface text-danger hover:bg-danger hover:text-white hover:border-danger',
        dark: 'bg-foreground text-white hover:bg-[#1c2b44]',
        link: 'h-auto p-0 text-primary hover:underline underline-offset-2',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-9 px-3.5',
        lg: 'h-10 px-4 text-[13px]',
        icon: 'size-8 p-0',
        'icon-sm': 'size-7 p-0',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}

/** Icon-only button; `label` is required for accessibility and shown as tooltip title. */
export function IconButton({ label, className, size = 'icon', variant = 'tertiary', ...props }: ButtonProps & { label: string }) {
  return <Button aria-label={label} title={label} size={size} variant={variant} className={className} {...props} />;
}
