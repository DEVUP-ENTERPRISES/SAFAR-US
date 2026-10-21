'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Car, Plus, Undo2, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { partnerManageApi, type PortfolioCar } from '@/features/asset-partners/manage-api';
import { ApiError } from '@/lib/api/types';
import { formatDate, formatMoney } from '@/lib/utils/format';
import { PartnersNav } from '~/features/partners/partners-nav';
import { MonthSelect, monthOptions } from '~/features/partners/month-select';

const manage = partnerManageApi('/ioc');
const usd = (amount: number) => formatMoney({ amount, currency: 'USD' });
const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'muted' | 'destructive' }> = {
  listed: { label: 'Listed', tone: 'success' },
  paused: { label: 'Paused', tone: 'warning' },
  draft: { label: 'Draft', tone: 'muted' },
  pending_verification: { label: 'In review', tone: 'warning' },
  delisted: { label: 'Off the marketplace', tone: 'muted' },
};

function RecordOwner({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const cars = useQuery({ queryKey: ['ioc-unassigned-cars'], queryFn: () => manage.unassignedCars() });
  const partners = useQuery({ queryKey: ['ioc-partners-active'], queryFn: () => manage.partners({ limit: 50 }) as Promise<{ _id: string; displayName: string; status: string }[]> });
  const [vehicleId, setVehicleId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const assign = useMutation({
    meta: { silentError: true },
    mutationFn: () => manage.assignCar(vehicleId, partnerId),
    onSuccess: () => { toast({ tone: 'success', title: 'Owner recorded', description: 'The car shows on their statements and dashboard from this month.' }); onDone(); },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That didn’t work' }),
  });
  const eligible = (partners.data ?? []).filter((p) => p.status === 'active' || p.status === 'onboarding');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Record who owns a car</CardTitle>
        <p className="text-sm text-muted-foreground">For a car already on CatoDrive’s fleet that belongs to a partner. Their fee, insurance and detailing apply from this month.</p>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Car">
          <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={cars.isLoading}>
            <option value="">{cars.data?.length === 0 ? 'Every fleet car already has an owner' : 'Pick a car'}</option>
            {cars.data?.map((c) => <option key={c.vehicleId} value={c.vehicleId}>{c.label}{c.plate ? ` · ${c.plate}` : ''}</option>)}
          </Select>
        </Field>
        <Field label="Owner">
          <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} disabled={partners.isLoading}>
            <option value="">{eligible.length ? 'Pick a partner' : 'No active partners yet'}</option>
            {eligible.map((p) => <option key={p._id} value={p._id}>{p.displayName}</option>)}
          </Select>
        </Field>
        <Button disabled={!vehicleId || !partnerId} loading={assign.isPending} onClick={() => assign.mutate()}>Save</Button>
      </CardContent>
    </Card>
  );
}

function CarRow({ c, onReturn, returning }: { c: PortfolioCar; onReturn: () => void; returning: boolean }) {
  const s = STATUS[c.status] ?? { label: c.status, tone: 'muted' as const };
  return (
    <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {c.photo ? <img src={c.photo} alt="" className="h-full w-full object-cover" /> : <Car className="m-auto mt-4 h-5 w-5 text-muted-foreground" />}
        </div>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <Link href={`/ops/listings/${c.vehicleId}`} className="hover:underline">{c.label}</Link>
            {c.endedAt ? <Badge tone="muted">Returned {formatDate(c.endedAt)}</Badge> : <Badge tone={s.tone}>{s.label}</Badge>}
            {c.pendingRepairs > 0 && <Link href="/ops/partners/repairs"><Badge tone="warning"><Wrench className="mr-1 inline h-3 w-3" />{c.pendingRepairs} repair{c.pendingRepairs === 1 ? '' : 's'} to approve</Badge></Link>}
          </p>
          <p className="text-xs text-muted-foreground">
            <Link href={`/ops/partners/members/${c.partnerId}`} className="font-medium text-foreground hover:underline">{c.partnerName}</Link>
            {c.plate ? ` · ${c.plate}` : ''} · {usd(c.dailyPrice)}/day · fee {(c.managementFeeBps / 100).toFixed(c.managementFeeBps % 100 ? 1 : 0)}%{c.since ? ` · since ${formatDate(c.since)}` : ''}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-4 gap-3 text-sm lg:w-[24rem] lg:shrink-0">
        {([['Trips', c.month ? String(c.month.trips) : '–'], ['Bookings', c.month ? usd(c.month.gross) : '–'], ['Our fee', c.month ? usd(c.month.managementFee) : '–'], ['Partner net', c.month ? usd(c.month.net) : '–']] as const).map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className={k === 'Partner net' && c.month && c.month.net < 0 ? 'truncate font-semibold text-destructive' : 'truncate font-semibold tabular-nums'}>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="lg:w-40 lg:shrink-0 lg:text-right">
        {!c.endedAt && <Button size="sm" variant="ghost" className="whitespace-nowrap" loading={returning} onClick={onReturn}><Undo2 className="h-4 w-4" /> Return to owner</Button>}
      </div>
    </div>
  );
}

export default function AssetCarsPage() {
  const months = useMemo(() => monthOptions(12, true), []);
  const [period, setPeriod] = useState(months[0].value);
  const [partner, setPartner] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const q = useQuery({ queryKey: ['ioc-asset-cars', period], queryFn: () => manage.cars(period) });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['ioc-asset-cars'] });
    void qc.invalidateQueries({ queryKey: ['ioc-asset-overview'] });
    void qc.invalidateQueries({ queryKey: ['ioc-unassigned-cars'] });
  };
  const giveBack = useMutation({
    meta: { silentError: true },
    mutationFn: (vehicleId: string) => manage.returnCar(vehicleId),
    onSuccess: () => { toast({ tone: 'success', title: 'Car returned', description: 'It’s off the marketplace and stops being charged after this month.' }); refresh(); },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That didn’t work' }),
  });

  const owners = useMemo(() => [...new Map((q.data ?? []).map((c) => [c.partnerId, c.partnerName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [q.data]);
  const needle = search.trim().toLowerCase();
  const rows = (q.data ?? []).filter((c) => (!partner || c.partnerId === partner) && (!needle || `${c.label} ${c.plate ?? ''} ${c.partnerName}`.toLowerCase().includes(needle)));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Asset management"
        title="Cars"
        description="Every partner car: who owns it, what it rents for, the partner’s fee and what it earned each side this month."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <MonthSelect months={months} value={period} onChange={setPeriod} />
            <Button size="sm" variant={adding ? 'outline' : 'primary'} onClick={() => setAdding(!adding)}>{adding ? 'Close' : <><Plus className="h-4 w-4" /> Record an owner</>}</Button>
          </div>
        }
      />
      <PartnersNav />

      {adding && <RecordOwner onDone={() => { setAdding(false); refresh(); }} />}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input className="sm:max-w-xs" placeholder="Search car, plate or owner" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search cars" />
        <Select wrapperClassName="sm:w-64" value={partner} onChange={(e) => setPartner(e.target.value)} aria-label="Owner">
          <option value="">All owners</option>
          {owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </Select>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-72 w-full rounded-2xl" />
      ) : q.isError ? (
        <ErrorState message="We couldn’t load the cars." retry={() => q.refetch()} />
      ) : !rows.length ? (
        <EmptyState title={q.data?.length ? 'No cars match' : 'No partner cars yet'} description={q.data?.length ? 'Try another owner or search.' : 'Cars appear here when an approved car is put on the fleet, or when you record who owns a fleet car.'} />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {rows.map((c) => (
              <CarRow
                key={c.vehicleId}
                c={c}
                returning={giveBack.isPending && giveBack.variables === c.vehicleId}
                onReturn={async () => {
                  const { ok } = await confirm({
                    title: `Return the ${c.label} to ${c.partnerName}?`,
                    description: 'It comes off the marketplace now. This month is still on their statement; after that it stops being charged. Not possible while it has active or upcoming trips.',
                    confirmLabel: 'Return car',
                    tone: 'destructive',
                  });
                  if (ok) giveBack.mutate(c.vehicleId);
                }}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
