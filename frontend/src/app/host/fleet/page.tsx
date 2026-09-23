'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';
import { formatMoney } from '@/lib/utils/format';
import { hostApi, type Fleet } from '@/features/host/api';
import { LocationSearch } from '@/features/maps/components/location-search';

export default function FleetPage() {
  const qc = useQueryClient();
  const fleets = useQuery({ queryKey: ['fleets'], queryFn: () => hostApi.fleets() });
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => hostApi.createFleet(name),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['fleets'] });
    },
  });

  const dashboard = useQuery({
    queryKey: ['fleet-dashboard', selected],
    queryFn: () => hostApi.fleetDashboard(selected!),
    enabled: !!selected,
  });

  const pnl = useQuery({
    queryKey: ['fleet-pnl', selected],
    queryFn: () => hostApi.fleetProfitability(selected!),
    enabled: !!selected,
  });

  return (
    <div className="space-y-6">
      <h1 className="display text-display-sm">Fleet management</h1>

      <Card>
        <CardHeader><CardTitle>Create a fleet</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Field label="Fleet name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Airport fleet" /></Field>
          <Button disabled={!name} loading={create.isPending} onClick={() => create.mutate()}>Create</Button>
        </CardContent>
      </Card>

      {fleets.isLoading && <Skeleton className="h-24 w-full" />}
      {fleets.data && fleets.data.length === 0 && (
        <EmptyState title="No fleets yet" description="Group your vehicles into fleets to track occupancy and revenue." />
      )}
      {fleets.data && fleets.data.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fleets.data.map((fl) => (
            <button key={fl._id} onClick={() => setSelected(fl._id)} className="text-start">
              <Card className={selected === fl._id ? 'border-primary' : ''}>
                <CardContent className="pt-6">
                  <p className="font-medium">{fl.name}</p>
                  <p className="text-sm text-muted-foreground">{fl.region ?? 'All regions'}</p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}

      {selected && fleets.data && (
        <FleetPolicyCard fleet={fleets.data.find((f) => f._id === selected)!} />
      )}

      {selected && dashboard.data && (
        <Card>
          <CardHeader><CardTitle>{dashboard.data.name} — analytics</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Metric label="Vehicles" value={String(dashboard.data.totalVehicles)} />
            <Metric label="Listed" value={String(dashboard.data.listedVehicles)} />
            <Metric label="Occupancy" value={`${dashboard.data.occupancyPct}%`} />
            <Metric label="Trips" value={String(dashboard.data.totalTrips)} />
            <Metric label="Revenue" value={formatMoney({ amount: dashboard.data.revenue, currency: 'USD' })} />
          </CardContent>
        </Card>
      )}

      {selected && pnl.data && (
        <Card>
          <CardHeader>
            <CardTitle>Profitability (P&amp;L)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <Metric label="Gross revenue" value={usd(pnl.data.totals.grossRevenue)} />
              <Metric label="Platform commission" value={`−${usd(pnl.data.totals.commission)}`} />
              <Metric label="Host earnings" value={usd(pnl.data.totals.hostEarnings)} />
              <Metric label="Maintenance cost" value={`−${usd(pnl.data.totals.maintenanceCost)}`} />
              <Metric
                label={`Net profit · ${(pnl.data.totals.marginBps / 100).toFixed(1)}% margin`}
                value={usd(pnl.data.totals.netProfit)}
                highlight={pnl.data.totals.netProfit >= 0 ? 'pos' : 'neg'}
              />
            </div>

            {pnl.data.vehicles.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-start text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Vehicle</th>
                      <th className="px-3 py-2 font-medium">Trips</th>
                      <th className="px-3 py-2 font-medium">Host earnings</th>
                      <th className="px-3 py-2 font-medium">Maintenance</th>
                      <th className="px-3 py-2 text-end font-medium">Net profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pnl.data.vehicles.map((v) => (
                      <tr key={v.vehicleId} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-medium">{v.label}</td>
                        <td className="px-3 py-2">{v.trips}</td>
                        <td className="px-3 py-2">{usd(v.hostEarnings)}</td>
                        <td className="px-3 py-2 text-muted-foreground">−{usd(v.maintenanceCost)}</td>
                        <td className={`px-3 py-2 text-end font-semibold ${v.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {usd(v.netProfit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Net profit = host earnings (after platform commission) − maintenance costs. Based on completed trips.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const DELIVERY_MODES = [
  ['home', 'Guest address'], ['airport', 'Airport'], ['hotel', 'Hotel'], ['business', 'Business'],
] as const;

/**
 * Fleet-wide defaults, set once and pushed to every vehicle on demand.
 * Saving the policy never touches a vehicle by itself — "Apply to all
 * vehicles" is a separate, explicit action, so a host tuning the policy
 * mid-edit never silently overwrites listings that already look right.
 */
function FleetPolicyCard({ fleet }: { fleet: Fleet }) {
  const qc = useQueryClient();
  const notify = useToast();
  const d = fleet.defaultDelivery;
  const [delivery, setDelivery] = useState({
    airport: !!d?.airport, home: !!d?.home, hotel: !!d?.hotel, business: !!d?.business,
    fee: String(((d?.fee ?? 0) / 100) || ''),
  });
  const [loc, setLoc] = useState<{ lat: number; lng: number; city: string; address: string } | null>(null);

  const savePolicy = useMutation({
    mutationFn: () =>
      hostApi.updateFleetPolicy(fleet._id, {
        delivery: { ...delivery, fee: Math.round(Number(delivery.fee || 0) * 100) },
        ...(loc ? { location: loc } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fleets'] });
      notify({ tone: 'success', title: 'Fleet policy saved' });
    },
  });

  const applyPolicy = useMutation({
    mutationFn: () => hostApi.applyFleetPolicy(fleet._id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['my-vehicles'] });
      notify({
        tone: r.failed ? 'error' : 'success',
        title: r.failed ? `Applied to ${r.applied} vehicles, ${r.failed} failed` : `Applied to ${r.applied} vehicles`,
      });
    },
  });

  const hasPolicy = !!(fleet.defaultDelivery || fleet.defaultLocation);

  return (
    <Card>
      <CardHeader><CardTitle>Delivery &amp; pickup policy</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Field
          label="Default parking address"
          hint={loc ? `Will be saved as ${loc.city}` : fleet.defaultLocation ? `Currently ${fleet.defaultLocation.city}` : 'Not set'}
        >
          <LocationSearch
            placeholder="Search an address"
            onPick={(p) => setLoc({ lat: p.lat, lng: p.lng, city: p.city, address: p.label })}
          />
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium">Delivery options</p>
          <div className="flex flex-wrap gap-2">
            {DELIVERY_MODES.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setDelivery((s) => ({ ...s, [key]: !s[key] }))}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  delivery[key] ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/40',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Delivery fee ($)" hint="Flat fee charged when a guest requests delivery">
          <Input
            type="number"
            min={0}
            value={delivery.fee}
            onChange={(e) => setDelivery({ ...delivery, fee: e.target.value })}
          />
        </Field>

        <div className="flex flex-wrap gap-3">
          <Button size="sm" loading={savePolicy.isPending} onClick={() => savePolicy.mutate()}>
            Save policy
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={applyPolicy.isPending}
            disabled={!hasPolicy}
            onClick={() => applyPolicy.mutate()}
          >
            Apply to all vehicles in this fleet
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function usd(amount: number): string {
  return formatMoney({ amount, currency: 'USD' });
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: 'pos' | 'neg' }) {
  const color = highlight === 'pos' ? 'text-success' : highlight === 'neg' ? 'text-destructive' : '';
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
