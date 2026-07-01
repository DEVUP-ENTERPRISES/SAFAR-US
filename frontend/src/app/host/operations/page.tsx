'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { formatDateRange, formatDate } from '@/lib/utils/format';
import { bookingApi } from '@/features/bookings/api';
import { hostApi } from '@/features/host/api';
import { useMyVehicles } from '@/features/vehicles/hooks';

function TripApprovals() {
  const qc = useQueryClient();
  const bookings = useQuery({ queryKey: ['host-bookings'], queryFn: () => bookingApi.list('host') });
  const confirm = useMutation({
    mutationFn: (id: string) => bookingApi.confirm(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['host-bookings'] }),
  });
  const decline = useMutation({
    mutationFn: (id: string) => bookingApi.decline(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['host-bookings'] }),
  });

  const pending = bookings.data?.filter((b) => b.status === 'pending_approval') ?? [];

  if (bookings.isLoading) return <Skeleton className="h-24 w-full" />;
  if (pending.length === 0)
    return <EmptyState title="No pending approvals" description="Booking requests appear here." />;

  return (
    <div className="space-y-3">
      {pending.map((b) => (
        <Card key={b._id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div>
              <p className="font-medium">{b.code}</p>
              <p className="text-sm text-muted-foreground">{formatDateRange(b.period.start, b.period.end)}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" loading={confirm.isPending} onClick={() => confirm.mutate(b._id)}>Approve</Button>
              <Button size="sm" variant="outline" loading={decline.isPending} onClick={() => decline.mutate(b._id)}>Decline</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Maintenance() {
  const qc = useQueryClient();
  const vehicles = useMyVehicles(true);
  const list = useQuery({ queryKey: ['maintenance'], queryFn: () => hostApi.maintenance() });
  const [form, setForm] = useState({ vehicleId: '', type: 'service', scheduledFor: '', notes: '' });

  const schedule = useMutation({
    mutationFn: () =>
      hostApi.scheduleMaintenance({
        vehicleId: form.vehicleId,
        type: form.type,
        scheduledFor: new Date(form.scheduledFor).toISOString(),
        notes: form.notes,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Schedule maintenance</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Vehicle">
            <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Select…</option>
              {vehicles.data?.map((v) => (
                <option key={v._id} value={v._id}>{v.make} {v.model}</option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {['service', 'repair', 'inspection', 'cleaning'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Date"><Input type="date" value={form.scheduledFor} onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })} /></Field>
          <Field label="Notes"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <Button disabled={!form.vehicleId || !form.scheduledFor} loading={schedule.isPending} onClick={() => schedule.mutate()}>Schedule</Button>
          </div>
        </CardContent>
      </Card>

      {list.data && list.data.length > 0 && (
        <div className="space-y-2">
          {list.data.map((m) => (
            <Card key={m._id}>
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="font-medium capitalize">{m.type}</p>
                  <p className="text-sm text-muted-foreground">{formatDate(m.scheduledFor)} · {m.notes}</p>
                </div>
                <span className="text-sm capitalize text-muted-foreground">{m.status}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OperationsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operations</h1>
        <p className="text-muted-foreground">Approve trip requests and manage vehicle maintenance.</p>
      </div>
      <section className="space-y-3">
        <h2 className="font-semibold">Trip approvals</h2>
        <TripApprovals />
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Maintenance</h2>
        <Maintenance />
      </section>
    </div>
  );
}
