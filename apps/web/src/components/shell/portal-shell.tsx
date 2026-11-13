'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Banknote, BarChart3, FileText, Home, Mail, User } from 'lucide-react';
import { PRESENTATION_FX, serviceRequestSchema } from '@nexus/shared';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PORTAL_NAV } from '@/lib/nav';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/controls';
import { Tooltip } from '@/components/ui/menus';
import { Monogram } from '@/components/nx/brand';
import { NotificationsBell, UserMenu } from './shared';
import { useIdempotencyKey } from '@/lib/idempotency';

/* ── Portal context: selected account + presentation currency ───────────────── */
interface PortalCtx {
  /** 'all' = consolidated relationship, otherwise an InvestmentAccount id */
  accountId: string;
  setAccountId: (id: string) => void;
  currency: string;
  setCurrency: (c: string) => void;
  /** presentation-only FX multiplier from USD (indicative, not a valuation input) */
  fxRate: number;
}
const PortalContext = React.createContext<PortalCtx>({ accountId: 'all', setAccountId: () => undefined, currency: 'USD', setCurrency: () => undefined, fxRate: 1 });
export const usePortal = () => React.useContext(PortalContext);

const ICONS = { home: Home, fund: BarChart3, cash: Banknote, doc: FileText, user: User } as const;

export interface PortalAccount {
  id: string;
  name: string;
  ref: string;
  type: string;
}

function ContactDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [subject, setSubject] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const key = useIdempotencyKey();
  const send = useMutation({
    mutationFn: () => api('/investor-portal/service-requests', { method: 'POST', body: { subject, message }, idempotencyKey: key.get() }),
    onSuccess: () => {
      key.reset();
      toast.success('Investor Relations notified', { description: 'Your message has been recorded and sent to the relationship team.' });
      setSubject('');
      setMessage('');
      onOpenChange(false);
    },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Contact Investor Relations" description="Send a message or service request to your Matanho relationship team." size="md">
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-[11.5px] font-semibold text-ink-2">
            Subject
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Update bank instructions" />
          </label>
          <label className="grid gap-1.5 text-[11.5px] font-semibold text-ink-2">
            Message
            <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="How can we help?" />
          </label>
          {error && <p className="text-[11.5px] font-medium text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={send.isPending}
            onClick={() => {
              const parsed = serviceRequestSchema.safeParse({ subject, message });
              if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check your message');
              setError(null);
              send.mutate();
            }}
          >
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Investor portal shell (client-portal.html): dark 78px icon rail with a blue active tick,
 * 72px top bar with account + currency selectors and Contact IR, bottom nav on mobile.
 */
export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: user } = useSession();
  const [accountId, setAccountId] = React.useState('all');
  const [currency, setCurrency] = React.useState('USD');
  const [contactOpen, setContactOpen] = React.useState(false);
  const accounts = useQuery({ queryKey: ['portal-accounts'], queryFn: () => api<PortalAccount[]>('/investor-portal/accounts'), retry: false });

  const ctx = React.useMemo<PortalCtx>(() => ({ accountId, setAccountId, currency, setCurrency, fxRate: PRESENTATION_FX[currency] ?? 1 }), [accountId, currency]);

  return (
    <PortalContext.Provider value={ctx}>
      <div className="min-h-screen">
        {/* icon rail */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[78px] flex-col items-center border-r border-border bg-surface md:flex">
          <div className="grid h-[72px] w-full place-items-center border-b border-border">
            <Monogram className="size-8" />
          </div>
          <nav className="flex flex-1 flex-col gap-2 py-4" aria-label="Portal">
            {PORTAL_NAV.map((n) => {
              const Icon = ICONS[n.icon];
              const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
              return (
                <Tooltip key={n.href} content={n.label}>
                  <Link
                    href={n.href}
                    aria-label={n.label}
                    aria-current={active ? 'page' : undefined}
                    className={cn('relative grid size-11 place-items-center rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40', active ? 'bg-primary-soft text-primary' : 'text-ink-3 hover:bg-surface-sunken hover:text-foreground')}
                  >
                    <Icon className="size-5" strokeWidth={1.7} />
                    {active && <span className="absolute -right-[17px] top-1/2 h-[22px] w-[3px] -translate-y-1/2 rounded-l bg-primary" />}
                  </Link>
                </Tooltip>
              );
            })}
          </nav>
          <div className="pb-4">
            <UserMenu align="start" />
          </div>
        </aside>

        <div className="md:ml-[78px]">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur-sm md:h-[72px] md:px-7">
            <div className="flex items-center gap-2.5 md:hidden">
              <Monogram className="size-7" />
            </div>
            <div className="min-w-0 md:min-w-[220px]">
              <div className="truncate text-[12.5px] font-semibold">{user?.organisation.name ?? '…'}</div>
              <div className="text-[11px] text-muted-foreground">Institutional LP Portal</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger aria-label="Investment account" className="hidden h-9 w-[210px] text-[12px] font-semibold sm:flex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Consolidated relationship</SelectItem>
                  {accounts.data?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger aria-label="Reporting currency" className="h-9 w-[84px] text-[12px] font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(PRESENTATION_FX).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="secondary" onClick={() => setContactOpen(true)}>
                <Mail /> <span className="hidden sm:inline">Contact IR</span>
              </Button>
              <NotificationsBell />
              <div className="md:hidden"><UserMenu /></div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1520px] animate-fade-in px-4 pb-24 pt-6 md:px-8 md:pb-16 md:pt-8">{children}</main>
        </div>

        {/* mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-5 border-t border-border bg-surface/95 backdrop-blur-sm md:hidden" aria-label="Portal">
          {PORTAL_NAV.map((n) => {
            const Icon = ICONS[n.icon];
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <Link key={n.href} href={n.href} className={cn('flex flex-col items-center justify-center gap-1 text-[10px] font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>
                <Icon className="size-[18px]" strokeWidth={active ? 2 : 1.7} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <ContactDialog open={contactOpen} onOpenChange={setContactOpen} />
      </div>
    </PortalContext.Provider>
  );
}
