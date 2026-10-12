import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Text, useConfirm, space } from '@catodrive/ui';
import { bookingApi } from '@catodrive/core/web/features/bookings/api';
import type { Booking } from '@catodrive/core/web/features/bookings/types';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatDateTime, formatMoney } from '@catodrive/core/web/lib/utils/format';
import { DateTimeSheet } from './DateTimeSheet';

/** End a paid trip earlier: preview the refund for the days given back, then confirm. */
export function ShortenTrip({ booking, onDone }: { booking: Pick<Booking, '_id' | 'period'>; onDone?: () => void }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [shortEnd, setShortEnd] = useState('');

  const preview = useQuery({
    queryKey: ['shorten-preview', booking._id, shortEnd],
    queryFn: () => bookingApi.shortenPreview(booking._id, new Date(shortEnd).toISOString()),
    enabled: !!shortEnd,
    retry: false,
  });
  const shorten = useMutation({
    mutationFn: () => bookingApi.shorten(booking._id, new Date(shortEnd).toISOString()),
    onSuccess: () => {
      setShortEnd('');
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: ['booking', booking._id] });
      onDone?.();
    },
  });
  const p = preview.data;

  return (
    <View style={{ gap: space.md }}>
      <Button title={shortEnd ? `New end: ${formatDateTime(new Date(shortEnd))}` : 'Pick the new (earlier) end'} variant="outline" onPress={() => setPicking(true)} />
      {shortEnd && preview.isFetching ? <Text variant="caption" tone="muted">Checking your refund…</Text> : null}
      {shortEnd && p && !p.available ? <Text variant="caption" tone="destructive">{p.reason}</Text> : null}
      {shortEnd && p?.available && p.refund ? <Text variant="caption">Refunds {formatMoney(p.refund)} for the days you give back.</Text> : null}
      {shorten.isError ? <Text variant="caption" tone="destructive">{shorten.error instanceof ApiError ? shorten.error.message : 'Could not shorten the trip'}</Text> : null}
      <Button
        title="Confirm shorter trip"
        disabled={!shortEnd || !p?.available}
        loading={shorten.isPending}
        onPress={async () => {
          if (!p?.available || !p.refund) return;
          const { ok } = await confirm({
            title: 'End this trip earlier?',
            description: `Ending on ${formatDateTime(p.newEnd)} refunds ${formatMoney(p.refund)} to your wallet, and the days you give back reopen for others.`,
            confirmLabel: `Refund ${formatMoney(p.refund)} & shorten`,
          });
          if (ok) shorten.mutate();
        }}
      />
      <DateTimeSheet
        visible={picking}
        title="New end date and time"
        earliest={new Date(booking.period.start)}
        initial={shortEnd}
        onClose={() => setPicking(false)}
        onPick={(local) => {
          setShortEnd(local);
          setPicking(false);
        }}
      />
    </View>
  );
}
