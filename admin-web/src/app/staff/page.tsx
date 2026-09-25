'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { adminApi } from '@/features/admin/api';
import { adminPath } from '@/lib/admin-path';

const ROLES = [
  { value: 'support', label: 'Support — tickets, claims, help articles' },
  { value: 'moderator', label: 'Moderator — users and reviews' },
  { value: 'finance', label: 'Finance — refunds, payouts, reports' },
  { value: 'ops', label: 'Operations — vehicles, hosts, KYC, fleet' },
];

interface Credentials { username: string; password: string }

export default function AdminStaffPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [name, setName] = useState('');
  const [role, setRole] = useState('support');
  const [email, setEmail] = useState('');
  const [creds, setCreds] = useState<Credentials | null>(null);

  const staff = useQuery({ queryKey: ['admin-staff'], queryFn: () => adminApi.staff() });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-staff'] });
  const fail = (e: unknown) => toast({ tone: 'error', title: 'That did not work', description: e instanceof Error ? e.message : undefined });

  const create = useMutation({
    mutationFn: () => adminApi.createStaff({ name, role, email: email.trim() || undefined }),
    onSuccess: (r) => { setCreds({ username: r.username, password: r.password }); setName(''); setEmail(''); refresh(); },
    onError: fail,
  });
  const reset = useMutation({ mutationFn: (id: string) => adminApi.resetStaffPassword(id), onSuccess: (r) => setCreds(r), onError: fail });
  const active = useMutation({ mutationFn: (v: { id: string; active: boolean }) => adminApi.setStaffActive(v.id, v.active), onSuccess: refresh, onError: fail });
  const changeRole = useMutation({ mutationFn: (v: { id: string; role: string }) => adminApi.setStaffRole(v.id, v.role), onSuccess: refresh, onError: fail });

  const copy = (text: string) => { void navigator.clipboard?.writeText(text); toast({ tone: 'success', title: 'Copied' }); };

  const columns: Column<any>[] = [
    { header: 'Name', cell: (u) => <span className="font-medium">{[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</span> },
    { header: 'Username', cell: (u) => <span className="font-mono text-xs">{u.email}</span> },
    {
      header: 'Role',
      cell: (u) => u.roles.includes('super_admin')
        ? <Badge tone="success">Main admin</Badge>
        : <Select size="sm" value={u.roles[0]} onChange={(e) => changeRole.mutate({ id: u._id, role: e.target.value })}>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.value}</option>)}</Select>,
    },
    { header: 'Status', cell: (u) => <Badge tone={u.status === 'active' ? 'success' : 'warning'}>{u.status}</Badge> },
    {
      header: '',
      cell: (u) => u.roles.includes('super_admin') ? null : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={async () => { const { ok } = await confirm({ title: 'Generate a new password?', description: 'Their old password stops working and they are signed out everywhere.', confirmLabel: 'Generate' }); if (ok) reset.mutate(u._id); }}><KeyRound className="h-3.5 w-3.5" /> New password</Button>
          <Button size="sm" variant="outline" onClick={() => active.mutate({ id: u._id, active: u.status !== 'active' })}>{u.status === 'active' ? 'Suspend' : 'Reactivate'}</Button>
          <Button size="sm" variant="ghost" onClick={() => window.location.assign(`${adminPath('audit')}?actor=${u._id}`)}>Activity</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-display-sm">Staff accounts</h1>
        <p className="text-sm text-muted-foreground">Create logins for your team. Only you, the main admin, can see this page.</p>
      </div>

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <Select value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select>
            <Input placeholder="Email (optional — a username is generated if blank)" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button loading={create.isPending} disabled={name.trim().length < 2} onClick={() => create.mutate()}><UserPlus className="h-4 w-4" /> Generate login</Button>
        </CardContent>
      </Card>

      {creds && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="space-y-3 py-5">
            <p className="font-semibold">Share these now — the password is shown only once.</p>
            {(['username', 'password'] as const).map((k) => (
              <div key={k} className="flex items-center gap-3">
                <span className="w-24 text-sm capitalize text-muted-foreground">{k}</span>
                <code className="rounded bg-muted px-2 py-1 text-sm">{creds[k]}</code>
                <Button size="sm" variant="ghost" onClick={() => copy(creds[k])}><Copy className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setCreds(null)}>I have saved them</Button>
          </CardContent>
        </Card>
      )}

      <DataTable columns={columns} rows={staff.data} isLoading={staff.isLoading} emptyTitle="No staff yet" />
    </div>
  );
}
