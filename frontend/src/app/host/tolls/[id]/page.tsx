'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, User, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ApiError } from '@/lib/api/types';
import { useHostMe } from '@/features/host/hooks';
import { useMyVehicles } from '@/features/vehicles/hooks';
import { hostTollsApi, agencyLabel } from '@/features/host/tolls-api';
import { TollStatusPill } from '@/features/host/components/toll-status';

const STATUS_LABEL: Record<string, string> = { listed: 'Listed', draft: 'Draft', paused: 'Snoozed', pending_verification: 'In review' };

/** One linked toll account: who it belongs to, its login, and the cars tracked on it. */
export default function TollAccountPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const host = useHostMe();
  const account = useQuery({ queryKey: ['host-toll-account', id], queryFn: () => hostTollsApi.account(id) });
  const cars = useMyVehicles(true);

  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [loginOpen, setLoginOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (account.data) setPicked(account.data.vehicleIds);
    // Arriving straight from linking: open the car picker.
    if (account.data && new URLSearchParams(window.location.search).get('edit') === '1') setEditing(true);
  }, [account.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['host-toll-account', id] });
    qc.invalidateQueries({ queryKey: ['host-toll-accounts'] });
  };

  const saveCars = useMutation({
    mutationFn: () => hostTollsApi.setVehicles(id, picked),
    onSuccess: () => { toast({ tone: 'success', title: 'Linked vehicles saved' }); setEditing(false); refresh(); },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not save' }),
  });
  const saveLogin = useMutation({
    mutationFn: () => hostTollsApi.updateLogin(id, username, password),
    onSuccess: () => { toast({ tone: 'success', title: 'Credentials updated' }); setLoginOpen(false); setUsername(''); setPassword(''); refresh(); },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not update' }),
  });
  const unlink = useMutation({
    mutationFn: () => hostTollsApi.unlink(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['host-toll-accounts'] }); router.replace('/host/tolls'); },
    onError: () => toast({ tone: 'error', title: 'Could not unlink the account' }),
  });

  const all = cars.data ?? [];
  const linked = useMemo(() => all.filter((c) => (editing ? true : account.data?.vehicleIds.includes(c._id))), [all, editing, account.data]);

  if (account.isLoading) return <Skeleton className="mx-auto h-64 max-w-2xl rounded-2xl" />;
  const a = account.data;
  if (!a) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-28">
      <button type="button" onClick={() => router.push('/host/tolls')} className="flex items-center gap-3 text-start">
        <ArrowLeft className="h-5 w-5 shrink-0" />
        <span>
          <span className="block text-lg font-bold">{agencyLabel(a.agency)}</span>
          <span className="block text-sm text-muted-foreground">{a.nickname}</span>
        </span>
      </button>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Linked to this toll account</p>
          <TollStatusPill status={a.status} />
        </div>
        <p className="flex items-center gap-3 text-lg"><User className="h-5 w-5" /> {host.data?.displayName ?? 'CatoDrive'}</p>
        {!loginOpen ? (
          <div className="flex justify-end">
            <button type="button" onClick={() => setLoginOpen(true)} className="font-semibold text-primary hover:underline">Update credentials</button>
          </div>
        ) : (
          <div className="space-y-3 border-t border-border pt-3">
            <Field label="Account number or username"><Input value={username} autoComplete="off" onChange={(e) => setUsername(e.target.value)} /></Field>
            <Field label="Password">
              <div className="relative">
                <Input type={show ? 'text' : 'password'} value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} className="pe-11" />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 end-0 px-3 text-muted-foreground" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </Field>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLoginOpen(false)}>Cancel</Button>
              <Button disabled={!username.trim() || !password} loading={saveLogin.isPending} onClick={() => saveLogin.mutate()}>Save</Button>
            </div>
          </div>
        )}
        {a.status === 'manual' && (
          <p className="text-xs text-muted-foreground">Tolls are added from NTTA statements for now; automatic sync turns on once NTTA opens access.</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{editing ? 'Choose linked vehicles' : `Linked vehicles (${a.vehicleIds.length})`}</h2>
        {!editing ? (
          <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-2 font-semibold text-primary"><Pencil className="h-4 w-4" /> Edit</button>
        ) : (
          <button type="button" onClick={() => setPicked(picked.length === all.length ? [] : all.map((c) => c._id))} className="text-sm font-semibold text-primary">
            {picked.length === all.length ? 'Clear all' : 'Select all'}
          </button>
        )}
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {cars.isLoading && <Skeleton className="h-24 w-full" />}
        {!cars.isLoading && !linked.length && <p className="p-4 text-sm text-muted-foreground">No cars linked yet. Tap Edit to choose them.</p>}
        {linked.map((c) => {
          const cover = c.photos?.find((p) => p.isCover)?.url ?? c.photos?.[0]?.url;
          return (
            <label key={c._id} className={editing ? 'block cursor-pointer' : 'block'}>
              <div className="flex items-center gap-4 p-4">
                {editing && (
                  <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={picked.includes(c._id)}
                    onChange={() => setPicked((p) => (p.includes(c._id) ? p.filter((x) => x !== c._id) : [...p, c._id]))} />
                )}
                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="text-lg">{c.make} {c.model} {c.year}</p>
                  <p className="font-mono text-sm font-semibold text-muted-foreground">{c.registrationNumber ?? 'No plate'}</p>
                  <span className="mt-1 inline-flex rounded-md border border-success/40 px-2 py-0.5 text-sm text-success">{STATUS_LABEL[c.status] ?? c.status}</span>
                </div>
              </div>
              {!editing && <p className="border-t border-border px-4 py-3 text-sm">Track via ‘license plate registered’</p>}
            </label>
          );
        })}
      </div>

      {editing ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
          <div className="mx-auto flex max-w-2xl gap-2">
            <Button size="lg" variant="outline" onClick={() => { setPicked(a.vehicleIds); setEditing(false); }}>Cancel</Button>
            <Button size="lg" className="flex-1" loading={saveCars.isPending} onClick={() => saveCars.mutate()}>Save ({picked.length})</Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="text-sm font-semibold text-destructive hover:underline"
          onClick={async () => {
            const { ok } = await confirm({ title: 'Unlink this toll account?', description: 'Its saved login is deleted. Tolls already recorded stay on their trips.', confirmLabel: 'Unlink', tone: 'destructive' });
            if (ok) unlink.mutate();
          }}
        >
          Unlink toll account
        </button>
      )}
    </div>
  );
}
