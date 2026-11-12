'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ROLE_LABELS, titleCase } from '@nexus/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { DetailSection } from '@/components/nx/blocks';
import { PageHeader, Panel, PanelSkeleton } from '@/components/nx/layout';
import { Tag } from '@/components/nx/status';

interface RoleRow { id: string; key: string; name: string; description: string | null; orgType: string; permissions: string[]; userCount: number }

const AREA_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', investors: 'Investors', onboarding: 'Onboarding & KYC', portfolios: 'Portfolios', holdings: 'Holdings', transactions: 'Investment activity',
  custodian: 'Custodian submissions', reconciliation: 'Reconciliation', companies: 'Portfolio companies', documents: 'Documents', reports: 'Reports', admin: 'Administration', audit: 'Audit', portal: 'External portals',
};
const ORG_LABELS: Record<string, string> = { ASSET_MANAGER: 'Matanho staff', INVESTOR: 'Investor portal', CUSTODIAN: 'Custodian portal', PORTFOLIO_COMPANY: 'Company portal' };

function RoleEditor({ role, catalogue, onClose }: { role: RoleRow | null; catalogue: Array<{ area: string; permissions: string[] }>; onClose: () => void }) {
  const qc = useQueryClient();
  const [selected, setSelected] = React.useState<string[]>([]);
  React.useEffect(() => setSelected(role?.permissions ?? []), [role]);
  const external = role && role.orgType !== 'ASSET_MANAGER';
  const dirty = !!role && JSON.stringify([...selected].sort()) !== JSON.stringify([...role.permissions].sort());
  const save = useMutation({
    mutationFn: () => api(`/admin/roles/${role!.id}`, { method: 'PATCH', body: { permissions: selected } }),
    onSuccess: () => { toast.success('Permissions updated', { description: 'Takes effect on the user\'s next request and is recorded in the audit trail.' }); void qc.invalidateQueries({ queryKey: ['admin-roles'] }); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const toggle = (p: string) => setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  return (
    <Sheet open={!!role} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        eyebrow="Role"
        title={role ? (ROLE_LABELS[role.key as keyof typeof ROLE_LABELS] ?? role.name) : ''}
        description={role?.description}
        actions={!external && <Button variant="primary" size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button>}
      >
        {role && (
          <>
            {external && <div className="border-b border-border-soft bg-surface-2 px-5 py-3 text-[12px] text-muted-foreground">External roles are fixed to their portal permission. Data access is further limited to the user's own organisation on the server.</div>}
            {catalogue
              .filter((g) => (external ? g.area === 'portal' : g.area !== 'portal'))
              .map((g) => (
                <DetailSection key={g.area} title={AREA_LABELS[g.area] ?? titleCase(g.area)}>
                  <div className="grid gap-2">
                    {g.permissions.map((p) => (
                      <label key={p} className="flex items-center gap-2.5 text-[12.5px]">
                        <Checkbox checked={selected.includes(p)} disabled={!!external} onCheckedChange={() => toggle(p)} />
                        <span className="font-mono text-[11.5px]">{p}</span>
                      </label>
                    ))}
                  </div>
                </DetailSection>
              ))}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function RolesPage() {
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => api<RoleRow[]>('/admin/roles') });
  const catalogue = useQuery({ queryKey: ['admin-permissions'], queryFn: () => api<Array<{ area: string; permissions: string[] }>>('/admin/permissions') });
  const [editing, setEditing] = React.useState<RoleRow | null>(null);

  const groups = ['ASSET_MANAGER', 'INVESTOR', 'CUSTODIAN', 'PORTFOLIO_COMPANY'];
  return (
    <>
      <PageHeader eyebrow="Administration" title="Roles & permissions" description="Permissions are enforced by the API on every request, so a change here takes effect immediately and is audited. The Administrator role cannot lose its own administration permissions." />
      {roles.isLoading ? (
        <PanelSkeleton rows={6} />
      ) : (
        <div className="grid gap-4">
          {groups.map((g) => {
            const rows = (roles.data ?? []).filter((r) => r.orgType === g);
            if (!rows.length) return null;
            return (
              <Panel key={g}>
                <div className="border-b border-border-soft px-4 py-2.5"><span className="eyebrow">{ORG_LABELS[g]}</span></div>
                <ul>
                  {rows.map((r) => (
                    <li key={r.id}>
                      <button onClick={() => setEditing(r)} className="flex w-full items-center gap-4 border-b border-border-soft px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-2">
                        <ShieldCheck className="size-4 shrink-0 text-ink-3" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold">{ROLE_LABELS[r.key as keyof typeof ROLE_LABELS] ?? r.name}</span>
                          <span className="block truncate text-[11.5px] text-muted-foreground">{r.description}</span>
                        </span>
                        <Tag>{r.permissions.length} permissions</Tag>
                        <span className="num w-20 text-right text-[12px] text-muted-foreground">{r.userCount} user{r.userCount === 1 ? '' : 's'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            );
          })}
        </div>
      )}
      <RoleEditor role={editing} catalogue={catalogue.data ?? []} onClose={() => setEditing(null)} />
    </>
  );
}
