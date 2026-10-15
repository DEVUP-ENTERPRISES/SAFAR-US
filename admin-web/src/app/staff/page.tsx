'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { adminApi } from '@/features/admin/api';
import { adminPath } from '@/lib/admin-path';
import { cn } from '@/lib/utils/cn';

const ROLES = [
  { value: 'admin', title: 'Admin', blurb: 'Everything except staff accounts and the audit log' },
  { value: 'ops', title: 'Operations', blurb: 'Vehicles, hosts, KYC, fleet, claims' },
  { value: 'finance', title: 'Finance', blurb: 'Refunds, payouts, reports, corporate' },
  { value: 'support', title: 'Support', blurb: 'Tickets, claims, help articles' },
  { value: 'moderator', title: 'Moderator', blurb: 'Users and reviews' },
];

interface Credentials { username: string; password: string; name?: string }

export default function AdminStaffPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [name, setName] = useState('');
  const [role, setRole] = useState('support');
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [copied, setCopied] = useState(false);

  const staff = useQuery({ queryKey: ['admin-staff'], queryFn: () => adminApi.staff() });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-staff'] });
  const fail = (e: unknown) => toast({ tone: 'error', title: 'That did not work', description: e instanceof Error ? e.message : undefined });

  const create = useMutation({
    mutationFn: () => adminApi.createStaff({ name, role }),
    onSuccess: (r) => { setCreds({ username: r.username, password: r.password, name }); setCopied(false); setName(''); refresh(); },
    onError: fail,
  });
  const reset = useMutation({
    mutationFn: (u: any) => adminApi.resetStaffPassword(u._id).then((r) => ({ ...r, name: [u.firstName, u.lastName].filter(Boolean).join(' ') })),
    onSuccess: (r) => { setCreds(r); setCopied(false); },
    onError: fail,
  });
  const active = useMutation({ mutationFn: (v: { id: string; active: boolean }) => adminApi.setStaffActive(v.id, v.active), onSuccess: refresh, onError: fail });
  const changeRole = useMutation({ mutationFn: (v: { id: string; role: string }) => adminApi.setStaffRole(v.id, v.role), onSuccess: refresh, onError: fail });

  const copyBoth = () => {
    if (!creds) return;
    void navigator.clipboard?.writeText(`Username: ${creds.username}\nPassword: ${creds.password}`);
    setCopied(true);
  };

  const picked = ROLES.find((r) => r.value === role);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="display text-display-sm">Staff accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add people to your team. Their username and password are generated for you. Only you, the main admin, can see this page.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex items-center gap-2 font-semibold"><UserPlus className="h-4 w-4 text-primary" /> New team member</div>

          <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />

          <div>
            <p className="mb-2 text-sm font-medium">Role</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  aria-pressed={role === r.value}
                  className={cn(
                    'rounded-2xl border p-3 text-start transition-colors',
                    role === r.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                  )}
                >
                  <span className="flex items-center justify-between gap-2 font-semibold">
                    {r.title}
                    {role === r.value && <Check className="h-4 w-4 text-primary" />}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{r.blurb}</span>
                </button>
              ))}
            </div>
          </div>

          <Button className="w-full sm:w-auto" loading={create.isPending} disabled={name.trim().length < 2} onClick={() => create.mutate()}>
            <KeyRound className="h-4 w-4" /> Generate login for {picked?.title}
          </Button>
        </CardContent>
      </Card>

      {creds && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div>
              <p className="font-semibold">{creds.name ? `Login for ${creds.name}` : 'New login'}</p>
              <p className="text-sm text-muted-foreground">Share this now. The password is shown only once and cannot be looked up later.</p>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              {(['username', 'password'] as const).map((k) => (
                <div key={k} className="min-w-0 rounded-xl bg-background p-3">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                  <dd className="mt-1 break-all font-mono text-sm font-semibold">{creds[k]}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={copyBoth}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy both'}</Button>
              <Button size="sm" variant="outline" onClick={() => setCreds(null)}>I have saved them</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Your team</h2>
        {staff.isLoading && <Skeleton className="h-24 w-full rounded-2xl" />}
        {staff.data?.map((u) => {
          const main = u.roles.includes('super_admin');
          const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
          return (
            <Card key={u._id}>
              <CardContent className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary">{(fullName ?? '?').charAt(0).toUpperCase()}</span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {fullName}
                      {main ? <Badge tone="success"><ShieldCheck className="mr-1 h-3 w-3" />Main admin</Badge> : <Badge tone={u.status === 'active' ? 'success' : 'warning'}>{u.status}</Badge>}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>

                {!main && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select size="sm" wrapperClassName="w-40" value={u.roles[0]} onChange={(e) => changeRole.mutate({ id: u._id, role: e.target.value })}>
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.title}</option>)}
                    </Select>
                    <Button size="sm" variant="outline" onClick={async () => { const { ok } = await confirm({ title: 'Generate a new password?', description: 'Their old password stops working and they are signed out everywhere.', confirmLabel: 'Generate' }); if (ok) reset.mutate(u); }}>
                      <KeyRound className="h-3.5 w-3.5" /> New password
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => active.mutate({ id: u._id, active: u.status !== 'active' })}>{u.status === 'active' ? 'Suspend' : 'Reactivate'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => window.location.assign(`${adminPath('audit')}?actor=${u._id}`)}>Activity</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
