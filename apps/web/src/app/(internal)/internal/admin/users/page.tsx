'use client';

import * as React from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Pencil, Plus, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { createUserSchema, formatDateTime, ROLE_LABELS, type RoleKey } from '@nexus/shared';
import { api, applyFieldErrors, type Paged } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useListState } from '@/lib/use-list-state';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { DataTable } from '@/components/nx/data-table';
import { FilterBar, FilterSelect, SearchInput } from '@/components/nx/filters';
import { PageHeader, Panel } from '@/components/nx/layout';
import { SimpleStatus } from '@/components/nx/status';
import { SelectField, TextField } from '@/components/form/fields';

interface UserRow {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'DISABLED' | 'INVITED';
  lastLoginAt: string | null;
  organisation: { id: string; name: string; type: string } | null;
  role: { id: string; key: string; name: string } | null;
}
interface Org { id: string; name: string; type: string }
interface RoleRow { id: string; key: string; name: string; orgType: string }

type CreateForm = z.infer<typeof createUserSchema>;

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const orgs = useQuery({ queryKey: ['admin-orgs'], queryFn: () => api<Org[]>('/admin/organisations'), enabled: open });
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => api<RoleRow[]>('/admin/roles'), enabled: open });
  const form = useForm<CreateForm>({ resolver: zodResolver(createUserSchema), defaultValues: { email: '', name: '', organisationId: '', roleKey: undefined, password: '' } });
  const orgId = form.watch('organisationId');
  const orgType = orgs.data?.find((o) => o.id === orgId)?.type;
  const roleOptions = (roles.data ?? []).filter((r) => !orgType || r.orgType === orgType).map((r) => ({ value: r.key, label: r.name }));

  const create = useMutation({
    mutationFn: (v: CreateForm) => api('/admin/users', { method: 'POST', body: v }),
    onSuccess: () => { toast.success('User created'); void qc.invalidateQueries({ queryKey: ['admin-users'] }); form.reset(); onOpenChange(false); },
    onError: (e) => { if (!applyFieldErrors(e, form.setError)) toast.error((e as Error).message); },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Create user" description="Choose the organisation first; the available roles follow its type." size="md">
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="grid gap-3.5">
            <TextField<CreateForm> name="name" label="Full name" required />
            <TextField<CreateForm> name="email" label="Email" type="email" required />
            <SelectField<CreateForm> name="organisationId" label="Organisation" required options={(orgs.data ?? []).map((o) => ({ value: o.id, label: o.name }))} />
            <SelectField<CreateForm> name="roleKey" label="Role" required options={roleOptions} placeholder={orgId ? 'Select role' : 'Choose an organisation first'} />
            <TextField<CreateForm> name="password" label="Temporary password" type="password" required help="At least 10 characters. Share it securely; the user can be reset at any time." />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={create.isPending}>Create user</Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

const editSchema = z.object({ name: z.string().trim().min(2, 'Name is required'), roleKey: z.string().min(1) });
type EditForm = z.infer<typeof editSchema>;

function EditUserDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => api<RoleRow[]>('/admin/roles'), enabled: !!user });
  const form = useForm<EditForm>({ resolver: zodResolver(editSchema), values: user ? { name: user.name, roleKey: user.role?.key ?? '' } : undefined });
  const save = useMutation({
    mutationFn: (v: EditForm) => api(`/admin/users/${user!.id}`, { method: 'PATCH', body: v }),
    onSuccess: () => { toast.success('User updated'); void qc.invalidateQueries({ queryKey: ['admin-users'] }); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Edit user" description={user?.email} size="sm">
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="grid gap-3.5">
            <TextField<EditForm> name="name" label="Full name" required />
            <SelectField<EditForm> name="roleKey" label="Role" options={(roles.data ?? []).filter((r) => r.orgType === user?.organisation?.type).map((r) => ({ value: r.key, label: r.name }))} />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="primary" loading={save.isPending}>Save changes</Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

const pwSchema = z.object({ password: z.string().min(10, 'Use at least 10 characters') });
function ResetPasswordDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const form = useForm<{ password: string }>({ resolver: zodResolver(pwSchema), defaultValues: { password: '' } });
  const reset = useMutation({
    mutationFn: (v: { password: string }) => api(`/admin/users/${user!.id}`, { method: 'PATCH', body: v }),
    onSuccess: () => { toast.success('Password reset', { description: 'The change is recorded in the audit trail.' }); form.reset(); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Reset password" description={user ? `Set a new password for ${user.name}.` : ''} size="sm">
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit((v) => reset.mutate(v))} className="grid gap-3.5">
            <TextField<{ password: string }> name="password" label="New password" type="password" required />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="primary" loading={reset.isPending}>Reset password</Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const qc = useQueryClient();
  const { data: me } = useSession();
  const list = useListState({ sort: 'name', order: 'asc' });
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [resetting, setResetting] = React.useState<UserRow | null>(null);

  const q = useQuery({ queryKey: ['admin-users', list.params], queryFn: () => api<Paged<UserRow>>('/admin/users', { query: list.params }), placeholderData: keepPreviousData });
  const toggle = useMutation({
    mutationFn: (u: UserRow) => api(`/admin/users/${u.id}`, { method: 'PATCH', body: { status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' } }),
    onSuccess: () => { toast.success('User status updated'); void qc.invalidateQueries({ queryKey: ['admin-users'] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const columns = React.useMemo<ColumnDef<UserRow>[]>(
    () => [
      { id: 'name', header: 'User', meta: { sortKey: 'name' }, cell: ({ row: { original: u } }) => (
        <div className="min-w-0"><div className="truncate font-semibold">{u.name}{u.id === me?.id && <span className="ml-1.5 text-[10px] font-bold uppercase text-primary">You</span>}</div><div className="truncate text-[11px] text-muted-foreground">{u.email}</div></div>
      ) },
      { id: 'org', header: 'Organisation', cell: ({ row }) => row.original.organisation?.name ?? '—' },
      { id: 'role', header: 'Role', cell: ({ row }) => (row.original.role ? (ROLE_LABELS[row.original.role.key as RoleKey] ?? row.original.role.name) : '—') },
      { id: 'status', header: 'Status', meta: { sortKey: 'status' }, cell: ({ row }) => <SimpleStatus value={row.original.status} /> },
      { id: 'last', header: 'Last sign-in', meta: { sortKey: 'lastLoginAt' }, cell: ({ row }) => <span className="num text-muted-foreground">{row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt) : 'Never'}</span> },
    ],
    [me?.id],
  );

  return (
    <>
      <PageHeader eyebrow="Administration" title="Users" description="Create and manage user accounts across Matanho staff, investors, custodians and portfolio companies. Every change is audited." actions={<Button variant="primary" onClick={() => setCreateOpen(true)}><Plus /> Create user</Button>} />
      <Panel>
        <FilterBar>
          <SearchInput value={list.state.q} onChange={list.setQ} placeholder="Search name, email, organisation…" />
          <FilterSelect label="Portal" value={list.state.filters.orgType} onChange={(v) => list.setFilter('orgType', v)} options={[{ value: 'ASSET_MANAGER', label: 'Matanho staff' }, { value: 'INVESTOR', label: 'Investor' }, { value: 'CUSTODIAN', label: 'Custodian' }, { value: 'PORTFOLIO_COMPANY', label: 'Portfolio company' }]} />
          <FilterSelect label="Status" value={list.state.filters.status} onChange={(v) => list.setFilter('status', v)} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'DISABLED', label: 'Disabled' }]} />
        </FilterBar>
        <DataTable
          columns={columns}
          data={q.data?.data}
          loading={q.isFetching}
          error={q.error ? (q.error as Error).message : null}
          meta={q.data?.meta}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
          sort={list.state.sort}
          order={list.state.order}
          onSort={list.onSort}
          rowActions={[
            { label: 'Edit', icon: <Pencil />, onSelect: setEditing },
            { label: 'Reset password', icon: <KeyRound />, onSelect: setResetting },
            { label: 'Disable user', icon: <UserX />, tone: 'danger', separatorBefore: true, hidden: (u) => u.status !== 'ACTIVE' || u.id === me?.id, onSelect: (u) => toggle.mutate(u) },
            { label: 'Re-enable user', icon: <UserCheck />, separatorBefore: true, hidden: (u) => u.status === 'ACTIVE', onSelect: (u) => toggle.mutate(u) },
          ]}
          emptyTitle="No users match"
        />
      </Panel>
      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditUserDialog user={editing} onClose={() => setEditing(null)} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
    </>
  );
}
