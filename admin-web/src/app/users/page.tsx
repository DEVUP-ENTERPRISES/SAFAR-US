'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { useConfirm } from '@/components/ui/confirm-dialog';
import Link from 'next/link';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { adminApi } from '@/features/admin/api';
import { adminPath } from '@/lib/admin-path';
import { PageHeader } from '@/components/ui/page-header';
import { useAdminList } from '@/features/admin/hooks/use-admin-list';
import { useDebouncedValue } from '@/lib/utils/use-debounced-value';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'destructive' | 'muted'> = {
  active: 'success', suspended: 'warning', banned: 'destructive',
};

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const search = useDebouncedValue(q.trim());
  const list = useAdminList<any>('/admin/users', { q: search || undefined, status: status || undefined });

  const setUserStatus = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) => adminApi.setUserStatus(id, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-list', '/admin/users'] }),
  });

  const busy = (id: string) => setUserStatus.isPending && setUserStatus.variables?.id === id;
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
    { header: '', className: 'text-end', cell: (u) => (
      <div className="flex justify-end gap-2">
        <Link href={adminPath(`kyc?user=${u._id}`)}>
          <Button size="sm" variant="outline">KYC</Button>
        </Link>
        {u.status !== 'active' && (
          <Button size="sm" loading={busy(u._id)} onClick={() => activate(u)}>Activate</Button>
        )}
        {u.status !== 'suspended' && u.status !== 'banned' && (
          <Button size="sm" variant="outline" loading={busy(u._id)} onClick={() => suspend(u)}>Suspend</Button>
        )}
        {u.status !== 'banned' && (
          <Button size="sm" variant="ghost" className="text-destructive" loading={busy(u._id)} onClick={() => ban(u)}>Ban</Button>
        )}
      </div>
    ) },
  ];

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="People & cars" title="Users" description="Every account on CatoDrive. Search for someone, then suspend or ban them if needed." />
      <div className="flex flex-wrap items-center gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or phone" aria-label="Search users" className="max-w-xs" />
        <div className="flex flex-wrap gap-2">
          {['', 'active', 'suspended', 'banned'].map((s) => (
            <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)} className="capitalize">{s || 'All'}</Chip>
          ))}
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={list.rows}
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={() => void list.refetch()}
        errorMessage="We couldn’t load users."
        paging={list.paging}
        emptyTitle={search || status ? 'No users match' : 'No users yet'}
        emptyDescription={search || status ? 'Try another search or filter.' : undefined}
      />
    </div>
  );
}
