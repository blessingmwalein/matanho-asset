import type { OrgType, RoleKey } from './enums';

/**
 * Permission strings. Stored in Role.permissions (DB) and checked by the API
 * PermissionsGuard on every request, so a role edit takes effect immediately.
 * The web app only uses these to hide navigation, never as the sole control.
 */
export const P = {
  DASHBOARD_VIEW: 'dashboard.view',

  INVESTORS_READ: 'investors.read',
  INVESTORS_MANAGE: 'investors.manage',

  ONBOARDING_READ: 'onboarding.read',
  ONBOARDING_REVIEW: 'onboarding.review', // notes + request information
  ONBOARDING_APPROVE: 'onboarding.approve', // approve / reject / reopen

  PORTFOLIOS_READ: 'portfolios.read',
  PORTFOLIOS_MANAGE: 'portfolios.manage',
  HOLDINGS_MANAGE: 'holdings.manage',
  TRANSACTIONS_READ: 'transactions.read',
  TRANSACTIONS_RECORD: 'transactions.record',

  CUSTODIAN_READ: 'custodian.read',
  RECON_READ: 'reconciliation.read',
  RECON_RUN: 'reconciliation.run',
  RECON_RESOLVE: 'reconciliation.resolve',

  COMPANIES_READ: 'companies.read',
  COMPANIES_REVIEW: 'companies.review',

  DOCUMENTS_READ: 'documents.read',
  DOCUMENTS_MANAGE: 'documents.manage',

  REPORTS_READ: 'reports.read',
  REPORTS_GENERATE: 'reports.generate',
  REPORTS_APPROVE: 'reports.approve', // maker–checker: approver must differ from generator
  REPORTS_PUBLISH: 'reports.publish',

  ADMIN_USERS: 'admin.users',
  ADMIN_ROLES: 'admin.roles',
  ADMIN_SETTINGS: 'admin.settings',
  AUDIT_READ: 'audit.read',

  PORTAL_INVESTOR: 'portal.investor',
  PORTAL_CUSTODIAN: 'portal.custodian',
  PORTAL_COMPANY: 'portal.company',
} as const;

export type Permission = (typeof P)[keyof typeof P];
export const ALL_PERMISSIONS = Object.values(P) as Permission[];

const STAFF_READ: Permission[] = [
  P.DASHBOARD_VIEW,
  P.INVESTORS_READ,
  P.ONBOARDING_READ,
  P.PORTFOLIOS_READ,
  P.TRANSACTIONS_READ,
  P.CUSTODIAN_READ,
  P.RECON_READ,
  P.COMPANIES_READ,
  P.DOCUMENTS_READ,
  P.REPORTS_READ,
];

export interface RoleDefinition {
  key: RoleKey;
  name: string;
  description: string;
  orgType: OrgType;
  permissions: Permission[];
}

/** System roles seeded into the Role table. */
export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: 'ADMIN',
    name: 'Administrator',
    description: 'Full access including users, roles and settings.',
    orgType: 'ASSET_MANAGER',
    permissions: [...ALL_PERMISSIONS.filter((p) => !p.startsWith('portal.'))],
  },
  {
    key: 'ASSET_MANAGER',
    name: 'Asset Manager',
    description: 'Manages investor portfolios, holdings, investment activity and investor reports.',
    orgType: 'ASSET_MANAGER',
    permissions: [
      ...STAFF_READ,
      P.PORTFOLIOS_MANAGE,
      P.HOLDINGS_MANAGE,
      P.TRANSACTIONS_RECORD,
      P.DOCUMENTS_MANAGE,
      P.REPORTS_GENERATE,
      P.REPORTS_PUBLISH,
    ],
  },
  {
    key: 'OPERATIONS',
    name: 'Operations Officer',
    description: 'Handles custodian submissions, reconciliation and portfolio-company reporting review.',
    orgType: 'ASSET_MANAGER',
    permissions: [
      ...STAFF_READ,
      P.RECON_RUN,
      P.RECON_RESOLVE,
      P.COMPANIES_REVIEW,
      P.DOCUMENTS_MANAGE,
      P.REPORTS_GENERATE,
    ],
  },
  {
    key: 'COMPLIANCE',
    name: 'Compliance Reviewer',
    description: 'Reviews and approves investor onboarding / KYC and approves investor reports.',
    orgType: 'ASSET_MANAGER',
    permissions: [
      ...STAFF_READ,
      P.INVESTORS_MANAGE,
      P.ONBOARDING_REVIEW,
      P.ONBOARDING_APPROVE,
      P.REPORTS_APPROVE,
      P.REPORTS_PUBLISH,
      P.AUDIT_READ,
    ],
  },
  {
    key: 'READ_ONLY',
    name: 'Read-only Staff',
    description: 'View-only access to internal registers and reports.',
    orgType: 'ASSET_MANAGER',
    permissions: [...STAFF_READ],
  },
  {
    key: 'INVESTOR_USER',
    name: 'Investor User',
    description: 'Access to own investor organisation records only.',
    orgType: 'INVESTOR',
    permissions: [P.PORTAL_INVESTOR],
  },
  {
    key: 'CUSTODIAN_USER',
    name: 'Custodian User',
    description: 'Submit and view own custodian submissions only.',
    orgType: 'CUSTODIAN',
    permissions: [P.PORTAL_CUSTODIAN],
  },
  {
    key: 'COMPANY_USER',
    name: 'Portfolio Company User',
    description: 'Submit and view own company reporting only.',
    orgType: 'PORTFOLIO_COMPANY',
    permissions: [P.PORTAL_COMPANY],
  },
];

/** Where each org type lands after login. */
export function homePathFor(orgType: OrgType): string {
  switch (orgType) {
    case 'ASSET_MANAGER':
      return '/internal/dashboard';
    case 'INVESTOR':
      return '/portal/overview';
    case 'CUSTODIAN':
      return '/custodian';
    case 'PORTFOLIO_COMPANY':
      return '/company';
  }
}

export function hasPermission(granted: readonly string[] | undefined, needed: Permission | Permission[]): boolean {
  if (!granted) return false;
  const list = Array.isArray(needed) ? needed : [needed];
  return list.every((p) => granted.includes(p));
}
