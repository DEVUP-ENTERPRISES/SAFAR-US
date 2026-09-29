'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Umbrella, AlertTriangle } from 'lucide-react';
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
import { adminApi, type WheelbaseCarLink } from '@/features/admin/api';

const ago = (iso?: string) => {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

function StatusBadge({ wb }: { wb: WheelbaseCarLink | null }) {
  if (!wb) return <Badge tone="muted">Not linked</Badge>;
  if (wb.found === false) return <Badge tone="destructive">Missing in Wheelbase</Badge>;
  return wb.insuranceState === 'approved'
    ? <Badge tone="success">Approved</Badge>
    : <Badge tone="warning">{wb.insuranceState ? `Not approved (${wb.insuranceState})` : 'Unknown'}</Badge>;
}

/** Every car's insurance as Wheelbase reports it, the link between the two, and the rules applied at booking. */
export default function InsurancePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const cfg = useQuery({ queryKey: ['platform-config'], queryFn: () => adminApi.config() });
  const overview = useQuery({ queryKey: ['wheelbase-overview'], queryFn: () => adminApi.wheelbaseOverview() });

  const [dealerId, setDealerId] = useState('');
  const [requireApproved, setRequireApproved] = useState(false);
  const [enforceMinAge, setEnforceMinAge] = useState(true);
  useEffect(() => {
    const i = cfg.data?.insurance;
    if (!i) return;
    setDealerId(i.wheelbaseDealerId ?? '');
    setRequireApproved(!!i.requireApproved);
    setEnforceMinAge(i.enforceMinAge !== false);
  }, [cfg.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['wheelbase-overview'] });
    qc.invalidateQueries({ queryKey: ['platform-config'] });
  };

  const saveSettings = useMutation({
    mutationFn: () => adminApi.saveConfig({ insurance: { wheelbaseDealerId: dealerId.trim(), requireApproved, enforceMinAge }, reason: 'Insurance settings' }),
    onSuccess: () => { toast({ tone: 'success', title: 'Insurance settings saved', description: 'Wheelbase is being read now.' }); setTimeout(refresh, 3000); },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not save' }),
  });

  const sync = useMutation({
    mutationFn: () => adminApi.wheelbaseSync(),
    onSuccess: (r) => {
      toast('skipped' in r
        ? { tone: 'error', title: 'Set the Wheelbase dealer ID first' }
        : { tone: 'success', title: 'Wheelbase checked', description: `${r.listings} listings · ${r.updated} cars updated · ${r.autoLinked} newly linked · ${r.unmatched} not linked` });
      refresh();
    },
    onError: () => toast({ tone: 'error', title: 'Wheelbase could not be reached', description: 'Cars keep their last known insurance. Try again shortly.' }),
  });

  const link = useMutation({
    mutationFn: ({ vehicleId, rentalId }: { vehicleId: string; rentalId: number | null }) => adminApi.wheelbaseLink(vehicleId, rentalId),
    onSuccess: () => { toast({ tone: 'success', title: 'Link saved' }); refresh(); },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not link' }),
  });

  const o = overview.data;
  const cars = o?.cars ?? [];
  const approved = cars.filter((c) => c.wheelbase?.insuranceState === 'approved' && c.wheelbase.found !== false).length;
  const unlinked = cars.filter((c) => !c.wheelbase).length;
  const listingName = (id: number) => o?.listings.find((l) => l.id === id)?.name ?? `Listing ${id}`;
  const linkedElsewhere = (id: number, vehicleId: string) => cars.some((c) => c._id !== vehicleId && c.wheelbase?.rentalId === id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Supply"
        title="Insurance"
        description="Each car’s insurance as Wheelbase reports it. Checked every 6 hours; if Wheelbase can’t be reached, cars keep their last known status."
      />

      <Card className="rounded-2xl shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Umbrella className="h-5 w-5 text-primary" /> Wheelbase connection &amp; rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Wheelbase dealer ID" hint="From your Wheelbase dashboard. Saving reads your listings straight away.">
            <Input value={dealerId} inputMode="numeric" placeholder="e.g. 4879882" onChange={(e) => setDealerId(e.target.value.replace(/\D/g, ''))} className="max-w-xs" />
          </Field>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" checked={enforceMinAge} onChange={(e) => setEnforceMinAge(e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" />
            <span>
              Enforce each car’s minimum driver age
              <span className="block text-xs text-muted-foreground">A driver younger than the car’s Wheelbase minimum (21 or 25) can’t book it or start the trip. Age comes from the verified ID, or the profile before verification.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" checked={requireApproved} onChange={(e) => setRequireApproved(e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" />
            <span>
              Only insurance-approved cars can be booked
              <span className="block text-xs text-muted-foreground">Cars not linked to Wheelbase, or not approved there, can’t be booked. Turn on once every car below shows Approved.</span>
            </span>
          </label>
          <Button loading={saveSettings.isPending} disabled={!cfg.data} onClick={() => saveSettings.mutate()}>Save settings</Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-soft">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Cars</CardTitle>
            {o && (
              <p className="mt-1 text-sm text-muted-foreground">
                {approved} of {cars.length} approved · {unlinked} not linked · {o.listings.length} Wheelbase listings
              </p>
            )}
          </div>
          <Button variant="outline" loading={sync.isPending} onClick={() => sync.mutate()}>
            <RefreshCw className="h-4 w-4" /> Check Wheelbase now
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {o?.error && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> {o.error}
            </p>
          )}
          {o && !o.dealerId && <p className="text-sm text-muted-foreground">Enter the Wheelbase dealer ID above to connect.</p>}
          {overview.isLoading && <Skeleton className="h-40 w-full rounded-xl" />}

          {cars.map((c) => {
            const wb = c.wheelbase;
            const options = o?.listings ?? [];
            return (
              <div key={c._id} className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-3">
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.photoUrl && <img src={c.photoUrl} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-[10rem] flex-1">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.plate ?? 'No plate'} · {c.status}</p>
                </div>
                <div className="min-w-[12rem] space-y-1">
                  <StatusBadge wb={wb} />
                  {wb && (
                    <p className="text-xs text-muted-foreground">
                      {wb.planLabel ?? wb.coverage ?? 'Plan unknown'}{wb.coverage ? ` (${wb.coverage})` : ''}{wb.minRenterAge ? ` · drivers ${wb.minRenterAge}+` : ''} · checked {ago(wb.syncedAt)}
                    </p>
                  )}
                </div>
                <div className="flex min-w-[16rem] items-center gap-2">
                  <Select
                    value={wb?.rentalId ? String(wb.rentalId) : ''}
                    disabled={!o?.dealerId || link.isPending || options.length === 0}
                    onChange={(e) => link.mutate({ vehicleId: c._id, rentalId: e.target.value ? Number(e.target.value) : null })}
                    aria-label={`Wheelbase listing for ${c.name}`}
                  >
                    <option value="">{wb ? 'Unlink' : c.suggestions.length > 1 ? 'Choose the matching listing…' : 'Not linked'}</option>
                    {wb && !options.some((l) => l.id === wb.rentalId) && <option value={wb.rentalId}>{listingName(wb.rentalId)} (missing)</option>}
                    {options.map((l) => (
                      <option key={l.id} value={l.id} disabled={linkedElsewhere(l.id, c._id)}>
                        {c.suggestions.includes(l.id) ? '★ ' : ''}{l.name} · #{l.id}{linkedElsewhere(l.id, c._id) ? ' (linked)' : ''}
                      </option>
                    ))}
                  </Select>
                </div>
                {wb?.linkedBy === 'auto' && <span className="text-[11px] text-muted-foreground">matched automatically</span>}
              </div>
            );
          })}
          {o && o.dealerId && cars.some((c) => !c.wheelbase && c.suggestions.length > 1) && (
            <p className="text-xs text-muted-foreground">★ marks listings with the same year, make and model. Where there are several (e.g. two 2023 Traverses), pick the right one once.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
