'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Upload, Milestone, Car } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
import { adminApi, type TollAccount, type TollStatus, type TollTransaction } from '@/features/admin/api';

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const at = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const err = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

type Car = { _id: string; year: number; make: string; model: string; registrationNumber?: string; tollTagId?: string };
const carName = (c?: Car) => (c ? `${c.make} ${c.model} ${c.year}` : 'Unknown car');

const STATUS: Record<TollAccount['status'], { label: string; tone: 'success' | 'muted' | 'destructive' }> = {
  connected: { label: 'Connected', tone: 'success' },
  manual: { label: 'Statement import', tone: 'muted' },
  disconnected: { label: 'Disconnected', tone: 'destructive' },
};

const TABS: { id: TollStatus; label: string }[] = [
  { id: 'matched', label: 'Matched to a trip' },
  { id: 'unknown_car', label: 'Unknown car' },
  { id: 'no_trip', label: 'No trip (fleet’s own)' },
  { id: 'billed', label: 'Billed' },
  { id: 'covered', label: 'Covered by toll pass' },
  { id: 'waived', label: 'Waived' },
  { id: 'too_late', label: 'Too late to bill' },
];

function AccountCard({ account, cars, loginStorage }: { account: TollAccount; cars: Car[]; loginStorage: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<'view' | 'login' | 'cars'>('view');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [picked, setPicked] = useState<string[]>(account.vehicleIds);
  const refresh = () => qc.invalidateQueries({ queryKey: ['toll-accounts'] });

  const saveLogin = useMutation({
    mutationFn: () => adminApi.tollSaveLogin(account._id, username, password),
    onSuccess: () => { toast({ tone: 'success', title: 'Login saved securely' }); setUsername(''); setPassword(''); setMode('view'); refresh(); },
    onError: (e) => toast({ tone: 'error', title: err(e, 'Could not save the login') }),
  });
  const saveCars = useMutation({
    mutationFn: () => adminApi.tollUpdateAccount(account._id, { vehicleIds: picked }),
    onSuccess: () => { toast({ tone: 'success', title: 'Linked cars saved' }); setMode('view'); refresh(); },
    onError: (e) => toast({ tone: 'error', title: err(e, 'Could not save') }),
  });

  const s = STATUS[account.status];
  return (
    <div className="space-y-3 rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Badge tone={s.tone}>{s.label}</Badge>
          <p className="text-lg font-bold">NTTA (Texas)</p>
          <p className="text-sm text-muted-foreground">{account.nickname}</p>
        </div>
        <div className="text-end text-xs text-muted-foreground">
          <p>{account.hasLogin ? `Login saved ${at(account.loginSavedAt)}` : 'No login saved'}</p>
          <p>Last statement {at(account.lastImportAt)}</p>
          {account.lastError && <p className="text-destructive">{account.lastError}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setMode(mode === 'cars' ? 'view' : 'cars')}>Linked cars ({account.vehicleIds.length})</Button>
        <Button size="sm" variant="outline" disabled={!loginStorage} onClick={() => setMode(mode === 'login' ? 'view' : 'login')}>
          {account.hasLogin ? 'Update login' : 'Add login'}
        </Button>
      </div>

      {mode === 'login' && (
        <div className="space-y-3 rounded-xl bg-muted/40 p-3">
          <Field label="Account number or username"><Input value={username} autoComplete="off" onChange={(e) => setUsername(e.target.value)} /></Field>
          <Field label="Password"><Input type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} /></Field>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Stored encrypted and never shown again. It lets CatoDrive read toll charges for the cars on this account.
          </p>
          <Button size="sm" disabled={!username.trim() || !password} loading={saveLogin.isPending} onClick={() => saveLogin.mutate()}>Save login</Button>
        </div>
      )}

      {mode === 'cars' && (
        <div className="space-y-2 rounded-xl bg-muted/40 p-3">
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {cars.map((c) => (
              <label key={c._id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="accent-[hsl(var(--primary))]" checked={picked.includes(c._id)}
                  onChange={() => setPicked((p) => (p.includes(c._id) ? p.filter((x) => x !== c._id) : [...p, c._id]))} />
                <span className="flex-1">{carName(c)}</span>
                <span className="font-mono text-xs text-muted-foreground">{c.registrationNumber ?? 'no plate'}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPicked(picked.length === cars.length ? [] : cars.map((c) => c._id))}>
              {picked.length === cars.length ? 'Clear' : 'Select all'}
            </Button>
            <Button size="sm" loading={saveCars.isPending} onClick={() => saveCars.mutate()}>Save linked cars</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TollRow({ t, cars }: { t: TollTransaction; cars: Map<string, Car> }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [carId, setCarId] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['tolls'] });
  const assign = useMutation({
    mutationFn: () => adminApi.tollAssign(t._id, carId),
    onSuccess: (r) => { toast({ tone: 'success', title: r.status === 'matched' ? 'Matched to a trip' : 'Car set; no trip at that time' }); refresh(); },
    onError: (e) => toast({ tone: 'error', title: err(e, 'Could not assign') }),
  });
  const waive = useMutation({
    mutationFn: () => adminApi.tollWaive(t._id, 'Waived by staff'),
    onSuccess: () => { toast({ tone: 'success', title: 'Toll waived' }); refresh(); },
    onError: (e) => toast({ tone: 'error', title: err(e, 'Could not waive') }),
  });
  const bill = useMutation({
    mutationFn: () => adminApi.tollBill(t.bookingId!),
    onSuccess: (r) => { toast({ tone: r.billed ? 'success' : 'error', title: r.billed ? `Charged ${usd(r.totalCents)} for ${r.billed} tolls` : 'Nothing billed: the trip is not finished yet' }); refresh(); },
    onError: (e) => toast({ tone: 'error', title: err(e, 'Could not bill') }),
  });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-sm">
      <div className="min-w-[9rem]">
        <p className="font-semibold">{usd(t.amountCents)}</p>
        <p className="text-xs text-muted-foreground">{at(t.occurredAt)}</p>
      </div>
      <div className="min-w-[14rem] flex-1">
        <p>{t.location}</p>
        <p className="text-xs text-muted-foreground">
          {t.plateState ? `${t.plateState} · ` : ''}{t.plate ?? 'no plate'}{t.tagId ? ` · Tag ${t.tagId}` : ''} · #{t.externalId}
        </p>
      </div>
      <div className="min-w-[10rem] text-xs text-muted-foreground">
        <p>{t.vehicleId ? carName(cars.get(t.vehicleId)) : 'Car not recognised'}</p>
        {t.bookingId && <p>Booking {t.bookingId.slice(0, 8)}</p>}
        {t.note && <p>{t.note}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(t.status === 'unknown_car' || t.status === 'no_trip') && (
          <>
            <Select value={carId} onChange={(e) => setCarId(e.target.value)} aria-label="Car for this toll">
              <option value="">Pick the car…</option>
              {[...cars.values()].map((c) => <option key={c._id} value={c._id}>{carName(c)} · {c.registrationNumber ?? ''}</option>)}
            </Select>
            <Button size="sm" disabled={!carId} loading={assign.isPending} onClick={() => assign.mutate()}>Match</Button>
          </>
        )}
        {t.status === 'matched' && t.bookingId && (
          <Button size="sm" loading={bill.isPending} onClick={() => bill.mutate()}>Bill trip now</Button>
        )}
        {['matched', 'unknown_car', 'no_trip', 'too_late'].includes(t.status) && (
          <Button size="sm" variant="ghost" loading={waive.isPending} onClick={() => waive.mutate()}>Waive</Button>
        )}
      </div>
    </div>
  );
}

function CarTag({ car }: { car: Car }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [tag, setTag] = useState(car.tollTagId ?? '');
  const save = useMutation({
    mutationFn: () => adminApi.tollSetTag(car._id, tag.trim() || null),
    onSuccess: () => { toast({ tone: 'success', title: 'TollTag saved' }); qc.invalidateQueries({ queryKey: ['toll-cars'] }); },
    onError: (e) => toast({ tone: 'error', title: err(e, 'Could not save') }),
  });
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border py-2 text-sm last:border-0">
      <Car className="h-4 w-4 text-muted-foreground" />
      <span className="min-w-[12rem] flex-1">{carName(car)}</span>
      <span className="w-24 font-mono text-xs">{car.registrationNumber ?? 'no plate'}</span>
      <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="TollTag ID (optional)" className="max-w-[13rem]" />
      <Button size="sm" variant="outline" disabled={(car.tollTagId ?? '') === tag.trim()} loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
      <span className="text-xs text-muted-foreground">{car.tollTagId ? 'Tracked by tag and plate' : 'Tracked by licence plate'}</span>
    </div>
  );
}

export default function TollsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const accounts = useQuery({ queryKey: ['toll-accounts'], queryFn: () => adminApi.tollAccounts() });
  const carsQ = useQuery({ queryKey: ['toll-cars'], queryFn: () => adminApi.vehicles({ limit: 500 }) as Promise<Car[]> });
  const cfg = useQuery({ queryKey: ['platform-config'], queryFn: () => adminApi.config() });
  const [tab, setTab] = useState<TollStatus>('matched');
  const tolls = useQuery({ queryKey: ['tolls', tab], queryFn: () => adminApi.tollTransactions(tab) });

  const cars = useMemo(() => carsQ.data ?? [], [carsQ.data]);
  const carMap = useMemo(() => new Map(cars.map((c) => [c._id, c])), [cars]);
  const list = accounts.data?.accounts ?? [];

  const [nickname, setNickname] = useState('');
  const create = useMutation({
    mutationFn: () => adminApi.tollCreateAccount(nickname.trim()),
    onSuccess: () => { setNickname(''); qc.invalidateQueries({ queryKey: ['toll-accounts'] }); },
    onError: (e) => toast({ tone: 'error', title: err(e, 'Could not add the account') }),
  });

  const [accountId, setAccountId] = useState('');
  const [text, setText] = useState('');
  const importIt = useMutation({
    mutationFn: () => adminApi.tollImport(text, accountId || undefined),
    onSuccess: (r) => {
      toast({
        tone: r.errors.length ? 'error' : 'success',
        title: `${r.added} new tolls · ${r.matched} matched to trips`,
        description: `${r.duplicates} already imported · ${r.unknownCar} unknown car · ${r.noTrip} outside trips · ${r.skipped} non-toll rows${r.errors.length ? ` · ${r.errors.length} rows unreadable (${r.errors[0].reason})` : ''}`,
      });
      setText('');
      qc.invalidateQueries({ queryKey: ['tolls'] });
      qc.invalidateQueries({ queryKey: ['toll-accounts'] });
    },
    onError: (e) => toast({ tone: 'error', title: err(e, 'Could not import the statement') }),
  });
  const onFile = async (f?: File) => { if (f) setText(await f.text()); };

  const [settings, setSettings] = useState<null | NonNullable<typeof cfg.data>['tolls']>(null);
  useEffect(() => { if (cfg.data?.tolls && !settings) setSettings(cfg.data.tolls); }, [cfg.data, settings]);
  const saveSettings = useMutation({
    mutationFn: () => adminApi.saveConfig({ tolls: settings!, reason: 'Toll settings' }),
    onSuccess: () => { toast({ tone: 'success', title: 'Toll settings saved' }); qc.invalidateQueries({ queryKey: ['platform-config'] }); },
    onError: (e) => toast({ tone: 'error', title: err(e, 'Could not save') }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Supply"
        title="Tolls"
        description="Toll charges from your NTTA accounts are matched to the trip they happened on and charged to that guest once the trip has finished."
      />

      <Card className="rounded-2xl shadow-soft">
        <CardHeader><CardTitle className="flex items-center gap-2"><Milestone className="h-5 w-5 text-primary" /> Toll accounts</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {accounts.isLoading && <Skeleton className="h-28 w-full rounded-xl" />}
          {accounts.data && !accounts.data.loginStorage && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
              Saving logins needs a TOLL_CREDENTIALS_KEY on the server. Statements can still be imported below.
            </p>
          )}
          {list.map((a) => <AccountCard key={a._id} account={a} cars={cars} loginStorage={!!accounts.data?.loginStorage} />)}
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <Field label="Link another toll account (NTTA)"><Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={`NTTA-${list.length + 1}`} /></Field>
            <Button disabled={!nickname.trim()} loading={create.isPending} onClick={() => create.mutate()}>Add account</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-primary" /> Import an NTTA statement</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Download the transaction history from the NTTA account (CSV, or copy the table) and add it here. A toll already imported is never added twice.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Account">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Not tied to an account</option>
                {list.map((a) => <option key={a._id} value={a._id}>{a.nickname}</option>)}
              </Select>
            </Field>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/50">
              <Upload className="h-4 w-4" /> Choose file
              <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="…or paste the statement here, header row included"
            className="w-full rounded-xl border border-input bg-background p-3 font-mono text-xs"
          />
          <Button disabled={!text.trim()} loading={importIt.isPending} onClick={() => importIt.mutate()}>Import tolls</Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-soft">
        <CardHeader className="space-y-3">
          <CardTitle>Tolls</CardTitle>
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Button key={t.id} size="sm" variant={tab === t.id ? 'primary' : 'outline'} onClick={() => setTab(t.id)}>{t.label}</Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {tolls.isLoading && <Skeleton className="h-24 w-full rounded-xl" />}
          {!tolls.isLoading && !(tolls.data ?? []).length && <p className="text-sm text-muted-foreground">No tolls here.</p>}
          {(tolls.data ?? []).map((t) => <TollRow key={t._id} t={t} cars={carMap} />)}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-soft">
        <CardHeader>
          <CardTitle>Cars and TollTags</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Tolls are matched by licence plate. Add a car’s TollTag ID to match by tag as well.</p>
        </CardHeader>
        <CardContent>
          {carsQ.isLoading && <Skeleton className="h-24 w-full rounded-xl" />}
          {cars.map((c) => <CarTag key={c._id} car={c} />)}
        </CardContent>
      </Card>

      {settings && (
        <Card className="rounded-2xl shadow-soft">
          <CardHeader><CardTitle>Toll settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Processing fee per trip ($)" hint="Added once to a trip that has tolls. 0 = none.">
                <Input type="number" min={0} step="0.01" value={(settings.feeCents / 100).toString()}
                  onChange={(e) => setSettings({ ...settings, feeCents: Math.round(Number(e.target.value) * 100) || 0 })} />
              </Field>
              <Field label="Wait before charging (hours)" hint="For trips with no deposit held (or tolls after it was released).">
                <Input type="number" min={0} value={settings.reviewHours} onChange={(e) => setSettings({ ...settings, reviewHours: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Trip buffer (minutes)" hint="Either side of the trip, for delivery drives.">
                <Input type="number" min={0} value={settings.matchBufferMinutes} onChange={(e) => setSettings({ ...settings, matchBufferMinutes: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Bill within (days)" hint="After the trip ends; later tolls wait for staff.">
                <Input type="number" min={1} value={settings.billingWindowDays} onChange={(e) => setSettings({ ...settings, billingWindowDays: Number(e.target.value) || 1 })} />
              </Field>
            </div>
            <div className="space-y-3 rounded-xl border border-border p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="accent-[hsl(var(--primary))]" checked={settings.passEnabled} onChange={(e) => setSettings({ ...settings, passEnabled: e.target.checked })} />
                Offer a toll pass at checkout
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Toll pass price per trip ($)" hint="Flat, whatever the trip length.">
                  <Input type="number" min={0} step="0.01" value={(settings.passPriceCents / 100).toString()}
                    onChange={(e) => setSettings({ ...settings, passPriceCents: Math.round(Number(e.target.value) * 100) || 0 })} />
                </Field>
                <Field label="Tolls covered per day ($)" hint="Each calendar day; tolls above this are billed to the guest.">
                  <Input type="number" min={0} step="0.01" value={(settings.passDailyCapCents / 100).toString()}
                    onChange={(e) => setSettings({ ...settings, passDailyCapCents: Math.round(Number(e.target.value) * 100) || 0 })} />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                Guests without the pass pay their actual tolls, taken from their security deposit just before it is released (5 days after the trip). Tolls posted later go to their card.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="accent-[hsl(var(--primary))]" checked={settings.autoCharge} onChange={(e) => setSettings({ ...settings, autoCharge: e.target.checked })} />
              Charge guests automatically once the wait is over (off: staff use “Bill trip now”)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="accent-[hsl(var(--primary))]" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
              Toll billing on
            </label>
            <Button loading={saveSettings.isPending} onClick={() => saveSettings.mutate()}>Save settings</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
