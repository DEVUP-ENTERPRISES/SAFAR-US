'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
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
  const toast = useToast();
  const [q, setQ] = useState(() => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('q') ?? ''));
  const [status, setStatus] = useState('');

  const search = useDebouncedValue(q.trim());
  const list = useAdminList<any>('/admin/users', { q: search || undefined, status: status || undefined });

  const setUserStatus = useMutation({
    meta: { silentError: true },
    mutationFn: ({ id, s, reason }: { id: string; s: string; reason: string }) => adminApi.setUserStatus(id, s, reason, s === 'banned'),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['admin-list', '/admin/users'] });
      const parts = [
        r.cancelledBookings.length ? `${r.cancelledBookings.length} upcoming booking(s) cancelled with a full refund` : '',
        r.flaggedBookings.length ? `${r.flaggedBookings.length} booking(s) sent to ops to check` : '',
        r.inProgress.length ? `${r.inProgress.length} trip(s) still in progress` : '',
        r.carsUnlisted ? `${r.carsUnlisted} car(s) unlisted` : '',
        r.identityBlocked.length ? `Blocked from returning: ${r.identityBlocked.join(', ')}` : '',
      ].filter(Boolean);
      toast({ tone: 'success', title: `Account set to ${r.status.replace('_', ' ')}`, description: parts.join('. ') || undefined });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That didn’t go through. Try again.' }),
  });

  const busy = (id: string) => setUserStatus.isPending && setUserStatus.variables?.id === id;
  const label = (u: any) => u.email ?? u.phone ?? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() ?? u._id;

  const suspend = async (u: any) => {
    const { ok, reason } = await confirm({
      title: 'Suspend this user?',
      description: (
        <>
          <strong>{label(u)}</strong> will be signed out and can’t book or collect a car until reactivated.
          Their upcoming bookings go to ops to check and any cars they list are unlisted. This is reversible.
        </>
      ),
      confirmLabel: 'Suspend',
      tone: 'destructive',
      reason: { label: 'Reason (recorded, the person is told it’s for safety or policy)', placeholder: 'e.g. Reported reckless driving on trip TURA-…', required: true },
    });
    if (ok) setUserStatus.mutate({ id: u._id, s: 'suspended', reason });
  };

  const ban = async (u: any) => {
    const { ok, reason } = await confirm({
      title: 'Permanently ban this user?',
      description: (
        <>
          <strong>{label(u)}</strong> will be permanently banned. Upcoming bookings are cancelled with a full refund,
          their cars are unlisted, and their email, phone, licence and devices are blocked so they can’t sign up again.
          Use suspension instead if this may be temporary.
        </>
      ),
      confirmLabel: 'Ban user',
      tone: 'destructive',
      requireText: 'BAN',
      reason: { label: 'Reason (recorded)', placeholder: 'e.g. Fraudulent identity; licence belongs to someone else', required: true },
    });
    if (ok) setUserStatus.mutate({ id: u._id, s: 'banned', reason });
  };

  const activate = async (u: any) => {
    const { ok, reason } = await confirm({
      title: 'Reactivate this user?',
      description: <>Restores full access for <strong>{label(u)}</strong>. Unlisted cars stay unlisted until relisted, and a ban’s identity block stays until removed from the deny list.</>,
      confirmLabel: 'Activate',
      reason: { label: 'Reason (recorded)', placeholder: 'e.g. Review finished, no issue found', required: true },
    });
    if (ok) setUserStatus.mutate({ id: u._id, s: 'active', reason });
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
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or phone" aria-label="Search users" className="max-w-xs" />
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
