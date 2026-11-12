'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/** Read-only link with a copy button (used for the draft resume link). */
export function CopyLink({ value, compact, className }: { value: string; compact?: boolean; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Resume link copied', { description: 'Anyone with this link can edit the draft. Keep it private.' });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy automatically. Select the link and copy it manually.');
    }
  };
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <input
        readOnly
        value={value}
        aria-label="Resume link"
        onFocus={(e) => e.currentTarget.select()}
        className={cn('num min-w-0 flex-1 truncate rounded-md border border-input bg-surface-2 px-2 text-ink-2 outline-none focus-visible:border-primary', compact ? 'h-7 text-[10.5px]' : 'h-8 text-[11.5px]')}
      />
      <button
        type="button"
        onClick={copy}
        aria-label="Copy resume link"
        className={cn('inline-flex shrink-0 items-center gap-1 rounded-md border border-input bg-surface font-semibold hover:bg-surface-2', compact ? 'h-7 px-2 text-[10.5px]' : 'h-8 px-2.5 text-[11.5px]')}
      >
        {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
