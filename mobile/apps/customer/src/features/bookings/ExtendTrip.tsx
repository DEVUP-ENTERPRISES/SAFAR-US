import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Text, useConfirm, space } from '@catodrive/ui';
import { bookingApi } from '@catodrive/core/web/features/bookings/api';
import type { Booking } from '@catodrive/core/web/features/bookings/types';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatDateTime, formatMoney } from '@catodrive/core/web/lib/utils/format';
import { DateTimeSheet } from './DateTimeSheet';

/** Extend a trip: pick a later end, see availability and price (or a swap), confirm and pay. */
export function ExtendTrip({ booking, onDone }: { booking: Pick<Booking, '_id' | 'period'>; onDone?: () => void }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [newEnd, setNewEnd] = useState('');
  const newEndIso = newEnd ? new Date(newEnd).toISOString() : '';

  const preview = useQuery({
    queryKey: ['extension-preview', booking._id, newEnd],
    queryFn: () => bookingApi.extensionPreview(booking._id, newEndIso),
    enabled: !!newEnd,
    retry: false,
  });
  const extend = useMutation({
    mutationFn: () => bookingApi.extend(booking._id, newEndIso),
    onSuccess: () => {
      setNewEnd('');
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: ['booking', booking._id] });
      void qc.invalidateQueries({ queryKey: ['receipts', booking._id] });
      onDone?.();
    },
  });
  const p = preview.data;
  const doable = !!p && !!p.extraCost && (p.available || !!p.swap?.possible);
  const end = new Date(booking.period.end);

  return (
    <View style={{ gap: space.md }}>
      <Button title={newEnd ? `New end: ${formatDateTime(new Date(newEnd))}` : 'Pick a new end date and time'} variant="outline" onPress={() => setPicking(true)} />
      {newEnd && preview.isFetching ? <Text variant="caption" tone="muted">Checking availability & price…</Text> : null}
      {newEnd && p && !p.available && !p.swap ? <Text variant="caption" tone="destructive">{p.reason}</Text> : null}
      {newEnd && p?.swap && p.extraCost ? <Text variant="caption" tone="warning">{p.reason} Adds {formatMoney(p.extraCost)}.</Text> : null}
      {newEnd && p?.available && p.extraCost ? (
        <Text variant="caption">
          Adds {formatMoney(p.extraCost)} for the extra day{p.days === 1 ? '' : 's'}.
          {p.lateCharge ? ` Plus a late fee of ${formatMoney(p.lateCharge)} for the time already past your return.` : ''}
        </Text>
      ) : null}
      {preview.isError ? <Text variant="caption" tone="destructive">Could not check those dates. Try again.</Text> : null}
      {extend.isError ? <Text variant="caption" tone="destructive">{extend.error instanceof ApiError ? extend.error.message : 'Extension failed'}</Text> : null}
      <Button
        title="Confirm extension"
        disabled={!newEnd || !doable}
        loading={extend.isPending}
        onPress={async () => {
          if (!p?.extraCost) return;
          const { ok } = await confirm({
            title: 'Extend this trip?',
            description: `Extending to ${formatDateTime(p.newEnd)} adds ${formatMoney(p.extraCost)}, charged now.${p.lateCharge ? ` You are past your return time, so a late fee of ${formatMoney(p.lateCharge)} for ${p.lateHours} started hour${p.lateHours === 1 ? '' : 's'} is also charged.` : ''}`,
            confirmLabel: `Pay ${formatMoney(p.extraCost)} & extend`,
          });
          if (ok) extend.mutate();
        }}
      />
      <DateTimeSheet
        visible={picking}
        title="New end date and time"
        earliest={end}
        initial={newEnd}
        onClose={() => setPicking(false)}
        onPick={(local) => {
          setNewEnd(local);
          setPicking(false);
        }}
      />
    </View>
  );
}
