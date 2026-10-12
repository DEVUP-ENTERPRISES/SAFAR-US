import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BottomSheet, Badge, Button, Card, Chip, DateRangeCalendar, EmptyState, Input, Screen, ScreenHeader, Section, SkeletonList, Text, space } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { bookingApi } from '@catodrive/core/web/features/bookings/api';
import { hostApi } from '@catodrive/core/web/features/host/api';
import { useMyVehicles } from '@catodrive/core/web/features/vehicles/hooks';
import { formatDateRange, formatDay } from '@catodrive/core/web/lib/utils/format';

const TYPES = ['service', 'repair', 'inspection', 'cleaning'];

/** The website's /host/operations: approve trip requests and schedule maintenance. */
function Operations() {
  const router = useRouter();
  return (
    <Screen header={<ScreenHeader title="Operations" subtitle="Approve trip requests and manage vehicle maintenance." onBack={() => (router.canGoBack() ? router.back() : router.replace('/host/menu'))} />}>
      <Section title="Trip approvals">
        <TripApprovals />
      </Section>
      <Section title="Maintenance">
        <Maintenance />
      </Section>
    </Screen>
  );
}

function TripApprovals() {
  const qc = useQueryClient();
  const bookings = useQuery({ queryKey: ['host-bookings'], queryFn: () => bookingApi.list('host') });
  const confirm = useMutation({ mutationFn: (id: string) => bookingApi.confirm(id), onSuccess: () => void qc.invalidateQueries({ queryKey: ['host-bookings'] }) });
  const decline = useMutation({ mutationFn: (id: string) => bookingApi.decline(id), onSuccess: () => void qc.invalidateQueries({ queryKey: ['host-bookings'] }) });
  const pending = bookings.data?.filter((b) => b.status === 'pending_approval') ?? [];
  if (bookings.isPending) return <SkeletonList rows={2} height={72} />;
  if (pending.length === 0) return <EmptyState title="No pending approvals" body="Booking requests appear here." />;
  return (
    <>
      {pending.map((b) => (
        <Card key={b._id}>
          <Text variant="label">{b.code}</Text>
          <Text variant="caption" tone="muted">{formatDateRange(b.period.start, b.period.end)}</Text>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
            <View style={{ flex: 1 }}>
              <Button title="Approve" size="sm" loading={confirm.isPending && confirm.variables === b._id} disabled={confirm.isPending || decline.isPending} onPress={() => confirm.mutate(b._id)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Decline" size="sm" variant="outline" loading={decline.isPending && decline.variables === b._id} disabled={confirm.isPending || decline.isPending} onPress={() => decline.mutate(b._id)} />
            </View>
          </View>
        </Card>
      ))}
    </>
  );
}

function Maintenance() {
  const qc = useQueryClient();
  const vehicles = useMyVehicles(true);
  const list = useQuery({ queryKey: ['maintenance'], queryFn: () => hostApi.maintenance() });
  const [form, setForm] = useState({ vehicleId: '', type: 'service', scheduledFor: '', notes: '' });
  const [picking, setPicking] = useState(false);
  const schedule = useMutation({
    mutationFn: () => hostApi.scheduleMaintenance({ vehicleId: form.vehicleId, type: form.type, scheduledFor: new Date(form.scheduledFor).toISOString(), notes: form.notes }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['maintenance'] });
      setForm({ vehicleId: '', type: 'service', scheduledFor: '', notes: '' });
    },
  });
  return (
    <>
      <Card>
        <Text variant="heading">Schedule maintenance</Text>
        <View style={{ gap: space.md, marginTop: space.md }}>
          <Text variant="label">Vehicle</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {vehicles.data?.map((v) => <Chip key={v._id} label={`${v.make} ${v.model}`} selected={form.vehicleId === v._id} onPress={() => setForm({ ...form, vehicleId: v._id })} />)}
          </ScrollView>
          <Text variant="label">Type</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {TYPES.map((t) => <Chip key={t} label={t[0].toUpperCase() + t.slice(1)} selected={form.type === t} onPress={() => setForm({ ...form, type: t })} />)}
          </View>
          <View style={{ gap: 6 }}>
            <Text variant="label">Date</Text>
            <Button title={form.scheduledFor ? formatDay(form.scheduledFor) : 'Choose a date'} variant="outline" onPress={() => setPicking(true)} />
          </View>
          <Input label="Notes" value={form.notes} onChangeText={(t) => setForm({ ...form, notes: t })} />
          <Button title="Schedule" disabled={!form.vehicleId || !form.scheduledFor} loading={schedule.isPending} onPress={() => schedule.mutate()} />
        </View>
      </Card>
      {list.data?.map((m) => (
        <Card key={m._id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" style={{ textTransform: 'capitalize' }}>{m.type}</Text>
              <Text variant="caption" tone="muted">{formatDay(m.scheduledFor)}{m.notes ? ` · ${m.notes}` : ''}</Text>
            </View>
            <Badge label={m.status} />
          </View>
        </Card>
      ))}
      <BottomSheet visible={picking} onClose={() => setPicking(false)} title="Date" footer={<Button title="Done" onPress={() => setPicking(false)} />}>
        <DateRangeCalendar single from={form.scheduledFor} to="" onChange={(from) => setForm((f) => ({ ...f, scheduledFor: from }))} />
      </BottomSheet>
    </>
  );
}

export default function OperationsScreen() {
  return (
    <RequireAuth>
      <Operations />
    </RequireAuth>
  );
}
