'use client';

import * as React from 'react';
import type { Crumb } from '@/components/nx/layout';

interface CrumbCtx {
  trail: Crumb[];
  setTrail: (t: Crumb[]) => void;
}
const Ctx = React.createContext<CrumbCtx>({ trail: [], setTrail: () => undefined });

export function CrumbProvider({ children }: { children: React.ReactNode }) {
  const [trail, setTrail] = React.useState<Crumb[]>([]);
  const value = React.useMemo(() => ({ trail, setTrail }), [trail]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCrumbTrail = () => React.useContext(Ctx).trail;

/**
 * Pages call this to append trailing breadcrumbs (e.g. the open investor's name) after the
 * section / page crumbs the shell derives from the route. Pass `null` while loading.
 *   useCrumbs(investor ? [{ label: investor.legalName }] : null)
 */
export function useCrumbs(items: Crumb[] | null) {
  const { setTrail } = React.useContext(Ctx);
  const key = items ? JSON.stringify(items) : '';
  React.useEffect(() => {
    setTrail(items ?? []);
    return () => setTrail([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setTrail]);
}
