'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { adminApi } from '@/features/admin/api';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'destructive' | 'muted'> = {
  active: 'success', suspended: 'warning', banned: 'destructive',
};

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', q, status],
    queryFn: () => adminApi.users({ q: q || undefined, status: status || undefined }),
  });

  const setUserStatus = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) => adminApi.setUserStatus(id, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const label = (u: any) => u.email ?? u.phone ?? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() ?? u._id;

  const suspend = async (u: any) => {
    const { ok } = await confirm({
      title: 'Suspend this user?',
      description: (
        <>
          <strong>{label(u)}</strong> will be signed out and blocked from booking until reactivated.
          This is reversible.
        </>
      ),
      confirmLabel: 'Suspend',
      tone: 'destructive',
    });
    if (ok) setUserStatus.mutate({ id: u._id, s: 'suspended' });
  };

  const ban = async (u: any) => {
    const { ok } = await confirm({
      title: 'Permanently ban this user?',
      description: (
        <>
          <strong>{label(u)}</strong> will be permanently banned from the platform. Use suspension
          instead if this may be temporary.
        </>
      ),
      confirmLabel: 'Ban user',
      tone: 'destructive',
      requireText: 'BAN',
    });
    if (ok) setUserStatus.mutate({ id: u._id, s: 'banned' });
  };

  const activate = async (u: any) => {
    const { ok } = await confirm({
      title: 'Reactivate this user?',
      description: <>Restores full access for <strong>{label(u)}</strong>.</>,
      confirmLabel: 'Activate',
    });
    if (ok) setUserStatus.mutate({ id: u._id, s: 'active' });
  };

  const columns: Column<any>[] = [
    { header: 'User', cell: (u) => (
      <div>
        <p className="font-medium">{u.firstName ?? '—'} {u.lastName ?? ''}</p>
        <p className="text-xs text-muted-foreground">{u.email ?? u.phone ?? u._id.slice(0, 8)}</p>
      </div>
    ) },
    { header: 'Roles', cell: (u) => <span className="text-xs capitalize">{u.roles.join(', ')}</span> },
    { header: 'Verified', cell: (u) => (
      <span className="text-xs text-muted-foreground">{u.emailVerified ? 'email ' : ''}{u.phoneVerified ? 'phone' : ''}{!u.emailVerified && !u.phoneVerified ? '—' : ''}</span>
    ) },
    { header: 'Status', cell: (u) => <Badge tone={STATUS_TONE[u.status] ?? 'muted'}>{u.status}</Badge> },
    { header: 'Actions', className: 'text-right', cell: (u) => (
      <div className="flex justify-end gap-2">
        {u.status !== 'active' && (
          <Button size="sm" loading={setUserStatus.isPending} onClick={() => activate(u)}>Activate</Button>
        )}
        {u.status !== 'suspended' && u.status !== 'banned' && (
          <Button size="sm" variant="outline" loading={setUserStatus.isPending} onClick={() => suspend(u)}>Suspend</Button>
        )}
        {u.status !== 'banned' && (
          <Button size="sm" variant="ghost" className="text-destructive" loading={setUserStatus.isPending} onClick={() => ban(u)}>Ban</Button>
        )}
      </div>
    ) },
  ];

  return (
    <div className="space-y-5">
      <h1 className="display text-display-sm">User management</h1>
      <div className="flex flex-wrap items-center gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / email / phone…" className="max-w-xs" />
        <div className="flex gap-2">
          {['', 'active', 'suspended', 'banned'].map((s) => (
            <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)} className="capitalize">{s || 'All'}</Chip>
          ))}
        </div>
      </div>
      <DataTable columns={columns} rows={data} isLoading={isLoading} emptyTitle="No users found" />
    </div>
  );
}
