'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ApiError } from '@/lib/api/types';
import { formatMoney } from '@/lib/utils/format';
import { bookingApi } from '../api';
import type { Booking } from '../types';

/**
 * Pick a new return time, see the exact added charge (and why it cannot be done,
 * when it cannot), then confirm. Shared by the trips list and the trip page.
 */
export function ExtendTrip({ booking, onDone }: { booking: Pick<Booking, '_id' | 'period'>; onDone?: () => void }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [newEnd, setNewEnd] = useState('');
  const newEndIso = newEnd ? new Date(newEnd).toISOString() : '';

  // Live cost and availability, so nothing is captured before the guest has seen it.
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
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['booking', booking._id] });
      qc.invalidateQueries({ queryKey: ['receipts', booking._id] });
      onDone?.();
    },
  });

  const p = preview.data;
  const doable = !!p && !!p.extraCost && (p.available || !!p.swap?.possible);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex-1">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">New end date/time</label>
        <Input type="datetime-local" value={newEnd} min={booking.period.end.slice(0, 16)} onChange={(e) => setNewEnd(e.target.value)} />
      </div>
      <Button
        size="sm"
        disabled={!newEnd || !doable}
        loading={extend.isPending}
        onClick={async () => {
          if (!p?.extraCost) return;
          const { ok } = await confirm({
            title: 'Extend this trip?',
            description: (
              <span>
                Extending to {new Date(p.newEnd).toLocaleString()} adds <b>{formatMoney(p.extraCost)}</b>, charged now.
              </span>
            ),
            confirmLabel: `Pay ${formatMoney(p.extraCost)} & extend`,
          });
          if (ok) extend.mutate();
        }}
      >
        Confirm extension
      </Button>
      {newEnd && preview.isFetching && <p className="w-full text-xs text-muted-foreground">Checking availability &amp; price…</p>}
      {newEnd && p && !p.available && !p.swap && <p className="w-full text-sm text-destructive">{p.reason}</p>}
      {newEnd && p?.swap && p.extraCost && (
        <p className="w-full text-sm">
          {p.reason} Adds <b>{formatMoney(p.extraCost)}</b>.
        </p>
      )}
      {newEnd && p?.available && p.extraCost && (
        <p className="w-full text-sm">
          Adds <b>{formatMoney(p.extraCost)}</b> for the extra day{p.days === 1 ? '' : 's'}.
        </p>
      )}
      {preview.isError && <p className="w-full text-sm text-destructive">Could not check those dates. Try again.</p>}
      {extend.isError && (
        <p className="w-full text-sm text-destructive">
          {extend.error instanceof ApiError ? extend.error.message : 'Extension failed'}
        </p>
      )}
    </div>
  );
}
