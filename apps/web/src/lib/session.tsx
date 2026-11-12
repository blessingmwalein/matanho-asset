'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hasPermission, type OrgType, type Permission } from '@nexus/shared';
import { api } from './api';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  organisation: { id: string; name: string; type: OrgType };
  role: { key: string; name: string };
  permissions: string[];
  homePath: string;
  investorId?: string;
  companyId?: string;
}

export const SESSION_KEY = ['session'] as const;

export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => api<SessionUser>('/auth/me'),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** UI hint only; the API enforces every permission. */
export function useCan() {
  const { data } = useSession();
  return (needed: Permission | Permission[]) => hasPermission(data?.permissions, needed);
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      qc.clear();
      window.location.assign('/login');
    }
  };
}
