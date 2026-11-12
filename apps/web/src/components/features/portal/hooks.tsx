'use client';

import * as React from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatCompactMoney, formatMoney } from '@nexus/shared';
import { api } from '@/lib/api';
import { useIdempotencyKey } from '@/lib/idempotency';
import { usePortal } from '@/components/shell/portal-shell';
import type { CapitalView, Money, Overview, InvestmentItem, PortalDocument, ProfileView } from './types';

/** Account filter ('all' → consolidated) as an API query value. */
function useAccountQuery() {
  const { accountId } = usePortal();
  return { accountId, query: accountId === 'all' ? undefined : accountId };
}

export function useOverview() {
  const { accountId, query } = useAccountQuery();
  return useQuery({ queryKey: ['portal', 'overview', accountId], queryFn: () => api<Overview>('/investor-portal/overview', { query: { accountId: query } }), placeholderData: keepPreviousData });
}

export function useInvestments() {
  const { accountId, query } = useAccountQuery();
  return useQuery({ queryKey: ['portal', 'investments', accountId], queryFn: () => api<{ items: InvestmentItem[] }>('/investor-portal/investments', { query: { accountId: query } }), placeholderData: keepPreviousData });
}

export function useCapital() {
  const { accountId, query } = useAccountQuery();
  return useQuery({ queryKey: ['portal', 'capital', accountId], queryFn: () => api<CapitalView>('/investor-portal/capital', { query: { accountId: query } }), placeholderData: keepPreviousData });
}

export function usePortalDocuments(q: string, type: string | undefined) {
  const { accountId, query } = useAccountQuery();
  return useQuery({
    queryKey: ['portal', 'documents', accountId, q, type ?? 'all'],
    queryFn: () => api<PortalDocument[]>('/investor-portal/documents', { query: { accountId: query, q: q || undefined, type } }),
    placeholderData: keepPreviousData,
  });
}

export function useProfile() {
  return useQuery({ queryKey: ['portal', 'profile'], queryFn: () => api<ProfileView>('/investor-portal/profile') });
}

/** Presentation formatting honouring the topbar currency (indicative FX; NOT a valuation input). */
export function useMoney() {
  const { currency, fxRate } = usePortal();
  return React.useMemo(
    () => ({
      currency,
      fxRate,
      full: (v: Money | null | undefined, decimals = 0) => formatMoney(v as string, currency, { decimals, fxRate }),
      compact: (v: Money | null | undefined, digits = 2) => formatCompactMoney(v as string, currency, { fxRate, digits }),
    }),
    [currency, fxRate],
  );
}

/** Acknowledge a capital call. Receipt only: never changes called capital. Idempotent per call + user. */
export function useAcknowledge() {
  const qc = useQueryClient();
  const key = useIdempotencyKey();
  return useMutation({
    mutationFn: (callId: string) => api<{ ok: boolean; acknowledgedAt: string; alreadyAcknowledged: boolean }>(`/investor-portal/capital-calls/${callId}/acknowledge`, { method: 'POST', body: {}, idempotencyKey: key.get() }),
    onSuccess: (res) => {
      key.reset();
      toast.success(res.alreadyAcknowledged ? 'Already acknowledged' : 'Capital call acknowledged', { description: 'Your acknowledgement is recorded in the audit trail. It confirms receipt of the notice and is not a payment.' });
      void qc.invalidateQueries({ queryKey: ['portal'] });
    },
    onError: (e) => {
      key.reset();
      toast.error((e as Error).message);
    },
  });
}
