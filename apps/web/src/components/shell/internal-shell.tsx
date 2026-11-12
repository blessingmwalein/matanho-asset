'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronsLeft, ChevronsRight, Menu, X } from 'lucide-react';
import { hasPermission } from '@nexus/shared';
import { api } from '@/lib/api';
import { INTERNAL_NAV, matchNav, type NavItem } from '@/lib/nav';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/menus';
import { Monogram, Wordmark } from '@/components/nx/brand';
import { Breadcrumbs } from '@/components/nx/layout';
import { CrumbProvider, useCrumbTrail } from './crumbs';
import { GlobalSearch, NotificationsBell, UserMenu } from './shared';

const COLLAPSE_KEY = 'nx.sidebar.collapsed';

type Counts = Partial<Record<NonNullable<NavItem['badgeKey']>, number>>;

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: user } = useSession();
  const counts = useQuery({ queryKey: ['nav-counts'], queryFn: () => api<Counts>('/dashboard/nav-counts'), refetchInterval: 60_000, retry: false });

  return (
    <div className="flex h-full min-h-0 flex-col bg-nav text-nav-ink">
      <div className={cn('flex h-14 shrink-0 items-center border-b border-nav-line', collapsed ? 'justify-center' : 'px-4')}>
        {collapsed ? <Monogram className="size-8" /> : <Wordmark inverted subtitle="Nexus · Asset Manager" />}
      </div>
      <nav className="nx-scroll min-h-0 flex-1 overflow-y-auto px-2.5 py-3" aria-label="Main">
        {INTERNAL_NAV.map((section) => {
          const items = section.items.filter((i) => !i.perm || hasPermission(user?.permissions, i.perm));
          if (!items.length) return null;
          return (
            <div key={section.label} className="mb-4">
              {!collapsed ? <div className="px-2.5 pb-1.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-[#5d697a]">{section.label}</div> : <div className="mx-2 mb-1.5 h-px bg-nav-line" />}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  // when a more specific sibling is active (e.g. /companies vs /companies/submissions) only highlight the longest match
                  const moreSpecific = INTERNAL_NAV.flatMap((s) => s.items).some((o) => o.href !== item.href && o.href.startsWith(item.href) && (pathname === o.href || pathname.startsWith(`${o.href}/`)));
                  const isActive = active && !moreSpecific;
                  const count = item.badgeKey ? counts.data?.[item.badgeKey] : undefined;
                  const link = (
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'group relative flex items-center rounded-md text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-nav-accent/60',
                        collapsed ? 'size-10 justify-center' : 'h-9 gap-3 px-2.5',
                        isActive ? 'bg-nav-3 text-white' : 'text-[#aab4c3] hover:bg-nav-2 hover:text-white',
                      )}
                    >
                      {isActive && <span className="absolute -left-2.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-nav-accent" />}
                      <item.icon className={cn('size-[17px] shrink-0', isActive ? 'text-white' : 'text-[#7f8b9c] group-hover:text-white')} strokeWidth={1.8} />
                      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                      {count ? (
                        collapsed ? (
                          <span className="absolute right-1 top-1 size-2 rounded-full bg-nav-accent" />
                        ) : (
                          <span className="num rounded bg-[#2a3447] px-1.5 py-px text-[10.5px] font-bold text-[#cfd8e6]">{count}</span>
                        )
                      ) : null}
                    </Link>
                  );
                  return <li key={item.href}>{collapsed ? <Tooltip content={item.label}>{link}</Tooltip> : link}</li>;
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="shrink-0 border-t border-nav-line p-2.5">
        {!collapsed && user && <div className="mb-1.5 truncate px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5d697a]">{user.organisation.name}</div>}
        <UserMenu tone="dark" showName={!collapsed} align="start" />
      </div>
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const trail = useCrumbTrail();
  const { section, item } = matchNav(pathname);
  const crumbs = [
    ...(section ? [{ label: section.label }] : []),
    ...(item ? [{ label: item.label, href: trail.length ? item.href : undefined }] : []),
    ...trail,
  ];
  const pages = INTERNAL_NAV.flatMap((s) => s.items).map((i) => ({ label: i.label, href: i.href }));
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur-sm lg:px-6">
      <IconButton label="Open navigation" variant="secondary" className="lg:hidden" onClick={onMenu}>
        <Menu />
      </IconButton>
      <Breadcrumbs items={crumbs} className="min-w-0 flex-1 lg:flex-none lg:basis-[38%]" />
      <div className="ml-auto flex items-center gap-2">
        <GlobalSearch pages={pages} />
        <NotificationsBell />
        <div className="hidden lg:block"><UserMenu /></div>
      </div>
    </header>
  );
}

/** Internal asset-manager workspace shell: collapsible dark sidebar, sticky top bar, breadcrumbs. */
export function InternalShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* per-viewer convenience only */
    }
  }, []);
  React.useEffect(() => setMobileOpen(false), [pathname]);

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });

  return (
    <CrumbProvider>
      <div className="min-h-screen">
        {/* desktop sidebar */}
        <aside className={cn('fixed inset-y-0 left-0 z-40 hidden border-r border-nav-line transition-[width] duration-200 lg:block', collapsed ? 'w-[64px]' : 'w-[240px]')}>
          <SidebarContent collapsed={collapsed} />
          <button
            onClick={toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="absolute -right-3 top-[68px] grid size-6 place-items-center rounded-full border border-border bg-surface text-ink-2 shadow-sm hover:text-foreground"
          >
            {collapsed ? <ChevronsRight className="size-3.5" /> : <ChevronsLeft className="size-3.5" />}
          </button>
        </aside>

        {/* mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-[#0b1420]/50 animate-fade-in" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-[264px] max-w-[85vw] animate-[nx-drawer-in_0.2s_ease-out] [animation-direction:normal]" style={{ animationName: 'nx-fade-in' }}>
              <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
              <button onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="absolute right-2 top-3 grid size-8 place-items-center rounded-md text-nav-muted hover:text-white">
                <X className="size-4" />
              </button>
            </aside>
          </div>
        )}

        <div className={cn('transition-[margin] duration-200', collapsed ? 'lg:ml-[64px]' : 'lg:ml-[240px]')}>
          <Topbar onMenu={() => setMobileOpen(true)} />
          <main className="mx-auto w-full max-w-[1560px] animate-fade-in px-4 pb-16 pt-6 lg:px-8">{children}</main>
        </div>
      </div>
    </CrumbProvider>
  );
}
