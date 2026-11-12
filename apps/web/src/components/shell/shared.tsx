'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Building2, LogOut, Search, ShieldCheck } from 'lucide-react';
import { formatDateTime, initials } from '@nexus/shared';
import { api } from '@/lib/api';
import { useLogout, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menus';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationsBell({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ data: NotificationRow[]; unreadCount: number }>('/notifications'), refetchInterval: 60_000 });
  const readAll = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const readOne = useMutation({ mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const unread = q.data?.unreadCount ?? 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton label="Notifications" variant={tone === 'dark' ? 'tertiary' : 'secondary'} className="relative">
          <Bell />
          {unread > 0 && <span className="absolute right-1 top-1 grid size-[14px] place-items-center rounded-full bg-primary text-[9px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] max-w-[calc(100vw-24px)] p-0">
        <div className="flex items-center justify-between border-b border-border-soft px-3.5 py-2.5">
          <span className="text-[12.5px] font-semibold">Notifications</span>
          {unread > 0 && (
            <button onClick={() => readAll.mutate()} className="text-[11.5px] font-semibold text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="nx-scroll max-h-[360px] overflow-y-auto">
          {q.data?.data.length ? (
            q.data.data.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.readAt) readOne.mutate(n.id);
                  if (n.link) router.push(n.link);
                }}
                className={cn('block w-full border-b border-border-soft px-3.5 py-2.5 text-left last:border-b-0 hover:bg-surface-2', !n.readAt && 'bg-primary-soft/40')}
              >
                <div className="flex items-start gap-2">
                  {!n.readAt && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />}
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold leading-snug">{n.title}</div>
                    {n.body && <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{n.body}</div>}
                    <div className="num mt-1 text-[10.5px] text-ink-3">{formatDateTime(n.createdAt)}</div>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">{q.isLoading ? 'Loading…' : 'You are all caught up.'}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function UserMenu({ tone = 'light', showName = false, align = 'end' }: { tone?: 'light' | 'dark'; showName?: boolean; align?: 'start' | 'end' }) {
  const { data: user } = useSession();
  const logout = useLogout();
  if (!user) return <div className="size-8 animate-pulse rounded-full bg-[#e3e1db]" />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={cn('flex items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40', showName && 'w-full px-1.5 py-1.5 hover:bg-white/5')} aria-label="User menu">
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold', tone === 'dark' ? 'bg-[#2a3342] text-white' : 'bg-foreground text-white')}>{initials(user.name)}</span>
          {showName && (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[12.5px] font-semibold text-nav-ink">{user.name}</span>
              <span className="block truncate text-[10.5px] text-nav-muted">{user.role.name}</span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[240px]">
        <div className="px-2.5 pb-2 pt-1.5">
          <div className="text-[13px] font-semibold">{user.name}</div>
          <div className="text-[11.5px] text-muted-foreground">{user.email}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Organisation</DropdownMenuLabel>
        <div className="flex items-center gap-2 px-2.5 pb-2 text-[12.5px]">
          <Building2 className="size-4 text-ink-3" />
          <span className="min-w-0 flex-1 truncate font-medium">{user.organisation.name}</span>
        </div>
        <div className="flex items-center gap-2 px-2.5 pb-2 text-[12.5px] text-muted-foreground">
          <ShieldCheck className="size-4 text-ink-3" />
          {user.role.name}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Global search / command palette (Ctrl/⌘+K) ─────────────────────────────── */
interface SearchResults {
  investors?: Array<{ id: string; ref: string; name: string }>;
  portfolios?: Array<{ id: string; ref: string; name: string }>;
  applications?: Array<{ id: string; reference: string; name: string }>;
  companies?: Array<{ id: string; name: string }>;
  documents?: Array<{ id: string; ref: string; title: string }>;
}

export function GlobalSearch({ pages }: { pages: Array<{ label: string; href: string }> }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const router = useRouter();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const results = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => api<SearchResults>('/search', { query: { q: debounced } }),
    enabled: open && debounced.length >= 2,
    retry: false,
  });

  const go = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };
  const r = results.data;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden h-9 w-full max-w-[340px] items-center gap-2 rounded-md border border-border bg-surface-2 px-3 text-left text-[12.5px] text-ink-3 outline-none transition-colors hover:border-[#c9c5bb] focus-visible:ring-[3px] focus-visible:ring-primary/12 md:flex"
        aria-label="Open search"
      >
        <Search className="size-3.5" />
        <span className="flex-1">Search investors, portfolios, documents…</span>
        <kbd className="rounded border border-border bg-surface px-1.5 py-px text-[10px] font-semibold text-muted-foreground">Ctrl K</kbd>
      </button>
      <IconButton label="Search" variant="secondary" className="md:hidden" onClick={() => setOpen(true)}>
        <Search />
      </IconButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Search" size="md" hideClose className="top-[18%] translate-y-0 overflow-hidden [&>header]:sr-only [&>div]:p-0">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Search investors, portfolios, applications, documents…" autoFocus />
            <CommandList>
              {debounced.length >= 2 && !results.isFetching && !r?.investors?.length && !r?.portfolios?.length && !r?.applications?.length && !r?.companies?.length && !r?.documents?.length && <CommandEmpty>No results for “{debounced}”.</CommandEmpty>}
              {debounced.length < 2 && (
                <CommandGroup heading="Go to">
                  {pages.map((p) => (
                    <CommandItem key={p.href} value={p.label} onSelect={() => go(p.href)}>
                      {p.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {!!r?.investors?.length && (
                <CommandGroup heading="Investors">
                  {r.investors.map((x) => (
                    <CommandItem key={x.id} value={`i-${x.id}`} onSelect={() => go(`/internal/investors/${x.id}`)}>
                      <span className="flex-1 truncate">{x.name}</span>
                      <span className="num text-[11px] text-muted-foreground">{x.ref}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {!!r?.portfolios?.length && (
                <CommandGroup heading="Portfolios">
                  {r.portfolios.map((x) => (
                    <CommandItem key={x.id} value={`p-${x.id}`} onSelect={() => go(`/internal/portfolios/${x.id}`)}>
                      <span className="flex-1 truncate">{x.name}</span>
                      <span className="num text-[11px] text-muted-foreground">{x.ref}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {!!r?.applications?.length && (
                <CommandGroup heading="Applications">
                  {r.applications.map((x) => (
                    <CommandItem key={x.id} value={`a-${x.id}`} onSelect={() => go(`/internal/onboarding/${x.id}`)}>
                      <span className="flex-1 truncate">{x.name}</span>
                      <span className="num text-[11px] text-muted-foreground">{x.reference}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {!!r?.companies?.length && (
                <CommandGroup heading="Portfolio companies">
                  {r.companies.map((x) => (
                    <CommandItem key={x.id} value={`c-${x.id}`} onSelect={() => go(`/internal/companies`)}>
                      {x.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {!!r?.documents?.length && (
                <CommandGroup heading="Documents">
                  {r.documents.map((x) => (
                    <CommandItem key={x.id} value={`d-${x.id}`} onSelect={() => go(`/internal/documents?doc=${x.id}`)}>
                      <span className="flex-1 truncate">{x.title}</span>
                      <span className="num text-[11px] text-muted-foreground">{x.ref}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "Secure workspace" chip used in the simple portal headers. */
export function SecureChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-medium text-ink-2">
      <span className="size-[7px] rounded-full bg-success" />
      {children}
    </span>
  );
}

export { Link };
