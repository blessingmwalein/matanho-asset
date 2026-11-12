import { cn } from '@/lib/utils';

/** Original Matanho monogram: two arches of a lowercase "m" cut from a solid tile. */
export function Monogram({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="7" fill={tone === 'light' ? '#2457d6' : '#0e131a'} />
      <path
        d="M7.5 22.5v-8.2c0-1.5 1.1-2.6 2.6-2.6s2.6 1.1 2.6 2.6v8.2m0-5.6c0-2.9 1.4-5.2 3.8-5.2s3.8 1.9 3.8 4.4v6.4m0-5.6c0-2.9 1.4-5.2 3.8-5.2 2.2 0 3.6 1.7 3.6 4.5v6.3"
        fill="none"
        stroke="#fff"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(-0.5 0.5)"
      />
    </svg>
  );
}

export function Wordmark({ className, inverted, subtitle }: { className?: string; inverted?: boolean; subtitle?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Monogram className="size-7" />
      <span className="leading-none">
        <span className={cn('block text-[19px] font-extrabold tracking-[-0.055em]', inverted ? 'text-white' : 'text-foreground')}>matanho</span>
        {subtitle && (
          <span className={cn('mt-1 block text-[9px] font-bold uppercase tracking-[0.14em]', inverted ? 'text-nav-muted' : 'text-ink-3')}>{subtitle}</span>
        )}
      </span>
    </span>
  );
}
