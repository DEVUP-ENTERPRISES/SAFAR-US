'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { formatMoney } from '@/lib/utils/format';
import { hostApi } from '@/features/host/api';

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Fleet management</h1>

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
            <button key={fl._id} onClick={() => setSelected(fl._id)} className="text-left">
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

      {selected && dashboard.data && (
        <Card>
          <CardHeader><CardTitle>{dashboard.data.name} — analytics</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Metric label="Vehicles" value={String(dashboard.data.totalVehicles)} />
            <Metric label="Listed" value={String(dashboard.data.listedVehicles)} />
            <Metric label="Occupancy" value={`${dashboard.data.occupancyPct}%`} />
            <Metric label="Trips" value={String(dashboard.data.totalTrips)} />
            <Metric label="Revenue" value={formatMoney({ amount: dashboard.data.revenue, currency: 'INR' })} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
