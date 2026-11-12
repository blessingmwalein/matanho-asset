import {
  ArrowLeftRight,
  Building2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  FolderOpen,
  GitCompareArrows,
  Landmark,
  LayoutDashboard,
  Layers,
  Briefcase,
  PieChart,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { P, type Permission } from '@nexus/shared';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** hide when the user lacks this permission (UI hint only; the API enforces it) */
  perm?: Permission;
  /** key into the sidebar badge counts returned by GET /dashboard/nav-counts */
  badgeKey?: 'applications' | 'submissions' | 'exceptions' | 'reporting';
}
export interface NavSection {
  label: string;
  items: NavItem[];
}

/** Internal asset-manager navigation (limited to the MVP modules; no empty routes). */
export const INTERNAL_NAV: NavSection[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', href: '/internal/dashboard', icon: LayoutDashboard, perm: P.DASHBOARD_VIEW }] },
  {
    label: 'Investors',
    items: [
      { label: 'Investor Register', href: '/internal/investors', icon: Users, perm: P.INVESTORS_READ },
      { label: 'Onboarding & KYC', href: '/internal/onboarding', icon: ClipboardCheck, perm: P.ONBOARDING_READ, badgeKey: 'applications' },
    ],
  },
  {
    label: 'Investments',
    items: [
      { label: 'Portfolios', href: '/internal/portfolios', icon: Briefcase, perm: P.PORTFOLIOS_READ },
      { label: 'Holdings', href: '/internal/holdings', icon: Layers, perm: P.PORTFOLIOS_READ },
      { label: 'Investment Activity', href: '/internal/activity', icon: ArrowLeftRight, perm: P.TRANSACTIONS_READ },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Custodian Submissions', href: '/internal/operations/custodian', icon: Landmark, perm: P.CUSTODIAN_READ, badgeKey: 'submissions' },
      { label: 'Reconciliation', href: '/internal/operations/reconciliation', icon: GitCompareArrows, perm: P.RECON_READ, badgeKey: 'exceptions' },
    ],
  },
  {
    label: 'Portfolio Companies',
    items: [
      { label: 'Company Register', href: '/internal/companies', icon: Building2, perm: P.COMPANIES_READ },
      { label: 'Reporting Submissions', href: '/internal/companies/submissions', icon: FileCheck2, perm: P.COMPANIES_READ, badgeKey: 'reporting' },
    ],
  },
  { label: 'Documents', items: [{ label: 'Document Register', href: '/internal/documents', icon: FolderOpen, perm: P.DOCUMENTS_READ }] },
  {
    label: 'Reports',
    items: [
      { label: 'Investor Reports', href: '/internal/reports/investor', icon: FileText, perm: P.REPORTS_READ },
      { label: 'Portfolio Reports', href: '/internal/reports/portfolio', icon: PieChart, perm: P.REPORTS_READ },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Users', href: '/internal/admin/users', icon: UserCog, perm: P.ADMIN_USERS },
      { label: 'Roles', href: '/internal/admin/roles', icon: ShieldCheck, perm: P.ADMIN_ROLES },
      { label: 'Settings', href: '/internal/admin/settings', icon: Settings, perm: P.ADMIN_SETTINGS },
    ],
  },
];

/** Resolve the nav section + item for a pathname (longest matching href wins). */
export function matchNav(pathname: string): { section?: NavSection; item?: NavItem } {
  let best: { section: NavSection; item: NavItem } | undefined;
  for (const section of INTERNAL_NAV) {
    for (const item of section.items) {
      if ((pathname === item.href || pathname.startsWith(`${item.href}/`)) && (!best || item.href.length > best.item.href.length)) {
        best = { section, item };
      }
    }
  }
  return best ?? {};
}

/** Investor portal navigation (mirrors client-portal.html). */
export const PORTAL_NAV = [
  { label: 'Overview', href: '/portal/overview', icon: 'home' },
  { label: 'Investments', href: '/portal/investments', icon: 'fund' },
  { label: 'Capital', href: '/portal/capital', icon: 'cash' },
  { label: 'Documents', href: '/portal/documents', icon: 'doc' },
  { label: 'Profile', href: '/portal/profile', icon: 'user' },
] as const;
