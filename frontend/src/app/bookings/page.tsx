'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CarFront } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ApiError } from '@/lib/api/types';
import { BookingStatusBadge } from '@/features/bookings/components/status-badge';
import { useMyBookings, useCancelBooking, useCompletePayment } from '@/features/bookings/hooks';
import { bookingApi } from '@/features/bookings/api';
import { ExtendTrip } from '@/features/bookings/components/extend-trip';
import { tripApi } from '@/features/trips/api';
import { usePlatformConfig } from '@/features/platform/config';
import { formatMoney, formatDateTime } from '@/lib/utils/format';

/** What the guest should do or expect next, per status - the "what happens now" of each trip. */
const NEXT_STEP: Record<string, string> = {
  pending_verification: 'Next: verify your licence before pickup - tap to continue',
  pending_approval: 'Next: waiting for the host to accept',
  pending_payment: 'Next: finish your payment to lock in the trip',
  paid: 'Next: show your pickup code to the host at the car',
  confirmed: 'Next: show your pickup code to the host at the car',
  in_progress: 'Trip in progress',
};

function BookingsList() {
  const router = useRouter();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useMyBookings('guest');
  const cancel = useCancelBooking();
  const completePayment = useCompletePayment();
  // Only a loaded config that says host-only hides the guest's own start.
  const hostOnlyStart = usePlatformConfig().data?.handover?.hostOnlyStart === true;
  const HOST_STARTS = 'Your host starts the trip at pickup. Show them your pickup code.';
  const [extendId, setExtendId] = useState<string | null>(null);
  const [shortenId, setShortenId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [shortEnd, setShortEnd] = useState('');
  const startTrip = useMutation({
    mutationFn: (bookingId: string) => tripApi.start(bookingId),
    onSuccess: (trip) => router.push(`/trips/${trip._id}`),
    // Pickup photos are taken from the booking page, so send them there instead of leaving a bare error.
    onError: (err, bookingId) => {
      if (err instanceof ApiError && err.code === 'PRE_PHOTOS_REQUIRED') router.push(`/bookings/${bookingId}`);
    },
  });
  const shorten = useMutation({
    mutationFn: (id: string) => bookingApi.shorten(id, new Date(shortEnd).toISOString()),
    onSuccess: () => { setShortenId(null); setShortEnd(''); qc.invalidateQueries({ queryKey: ['bookings'] }); },
  });
  // Live refund for ending earlier, before anything is committed.
  const shortPreview = useQuery({
    queryKey: ['shorten-preview', shortenId, shortEnd],
    queryFn: () => bookingApi.shortenPreview(shortenId!, new Date(shortEnd).toISOString()),
    enabled: !!shortenId && !!shortEnd,
    retry: false,
  });

  if (isLoading)
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-2xl" />
        ))}
      </div>
    );
  if (isError) return <ErrorState message="Couldn't load your trips." retry={() => refetch()} />;
  if (!data || data.length === 0)
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <CarFront className="h-8 w-8 text-muted-foreground" />
        </span>

        <p className="mt-2 text-sm text-muted-foreground">Book a vehicle to see it here.</p>
        <button
          onClick={() => router.push('/search')}
          className="mt-6 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-md transition-all hover:brightness-110"
        >
          Browse vehicles
        </button>
      </div>
    );

  const cancellable = ['pending_approval', 'confirmed', 'paid'];

  return (
    <div className="space-y-4">
      {data.map((b) => (
        <div key={b._id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
            <button onClick={() => router.push(`/bookings/${b._id}`)} className="min-w-0 flex-1 text-start">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{b.code}</span>
                <BookingStatusBadge status={b.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDateTime(b.period.start)} â†’ {formatDateTime(b.period.end)}
              </p>
              {NEXT_STEP[b.status] && (
                <p className="mt-2 text-xs font-medium text-primary">{NEXT_STEP[b.status]}</p>
              )}
              {b.status === 'paid' && (hostOnlyStart || (startTrip.error instanceof ApiError && startTrip.error.code === 'HOST_ONLY_START')) && (
                <p className="mt-1 text-xs text-muted-foreground">{HOST_STARTS}</p>
              )}
              {b.status === 'paid' && startTrip.variables === b._id && startTrip.error instanceof ApiError && startTrip.error.code !== 'HOST_ONLY_START' && startTrip.error.code !== 'PRE_PHOTOS_REQUIRED' && (
                <p className="mt-1 text-sm text-destructive">{startTrip.error.message}</p>
              )}
            </button>
            <div className="flex shrink-0 flex-row items-center justify-between gap-3 sm:flex-col sm:items-end">
              <button onClick={() => router.push(`/bookings/${b._id}/receipt`)} className="text-right" title="View receipt">
                <p className="text-xl font-bold text-foreground hover:text-primary">{formatMoney(b.priceBreakdown.total)}</p>
                <p className="text-xs text-muted-foreground">Total &middot; tap for receipt</p>
              </button>

              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {b.status === 'pending_payment' && (
                  <Button
                    size="sm" className="rounded-full"
                    loading={completePayment.isPending && completePayment.variables === b._id}
                    onClick={() => completePayment.mutate(b._id)}
                  >
                    Complete payment
                  </Button>
                )}
                {b.status === 'paid' && !hostOnlyStart && (
                  <Button size="sm" className="rounded-full" loading={startTrip.isPending} onClick={() => startTrip.mutate(b._id)}>
                    Start trip
                  </Button>
                )}
                {b.status === 'in_progress' && b.tripId && (
                  <Button size="sm" className="rounded-full" onClick={() => router.push(`/trips/${b.tripId}`)}>
                    Open trip
                  </Button>
                )}
                {['paid', 'in_progress'].includes(b.status) && (
                  <Button size="sm" className="rounded-full" variant="outline" onClick={() => { setExtendId(extendId === b._id ? null : b._id); setShortenId(null); }}>
                    Extend
                  </Button>
                )}
                {b.status === 'paid' && (
                  <Button size="sm" className="rounded-full" variant="outline" onClick={() => { setShortenId(shortenId === b._id ? null : b._id); setShortEnd(''); setExtendId(null); }}>
                    Shorten
                  </Button>
                )}
                {['completed', 'cancelled'].includes(b.status) && (
                  <Button size="sm" className="rounded-full" variant="outline" onClick={() => router.push(`/vehicles/${b.vehicleId}`)}>
                    Book again
                  </Button>
                )}
                {cancellable.includes(b.status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive" loading={cancel.isPending || previewing === b._id}
                    onClick={async () => {
                      // Fetch the exact refund first, the way Turo does - a
                      // guest deciding whether to eat a loss deserves the real
                      // number, not "it depends on the policy".
                      setPreviewing(b._id);
                      let desc: ReactNode =
                        'This cannot be undone - you would need to rebook.';
                      try {
                        const p = await bookingApi.cancellationPreview(b._id);
                        const policyLabel = { flexible: 'Flexible', moderate: 'Moderate', strict: 'Strict' }[p.policy];
                        desc = (
                          <span className="block space-y-1.5">
                            <span className="block">
                              You paid <b>{formatMoney(p.total)}</b>.{' '}
                              {p.isFullRefund ? (
                                <>Youâ€™ll be refunded the <b>full {formatMoney(p.refund)}</b>.</>
                              ) : p.refund.amount > 0 ? (
                                <>Youâ€™ll be refunded <b>{formatMoney(p.refund)}</b> - {formatMoney(p.nonRefundable)} is non-refundable under this hostâ€™s {policyLabel.toLowerCase()} policy.</>
                              ) : (
                                <>This is <b>non-refundable</b> under this hostâ€™s {policyLabel.toLowerCase()} policy.</>
                              )}
                            </span>
                            {p.fullRefundUntil && !p.isFullRefund && (
                              <span className="block text-xs text-muted-foreground">
                                A full refund was available until {new Date(p.fullRefundUntil).toLocaleString()}.
                              </span>
                            )}
                            <span className="block text-xs text-muted-foreground">This cannot be undone - you would need to rebook.</span>
                          </span>
                        );
                      } catch {
                        /* fall back to the generic copy if the preview fails */
                      } finally {
                        setPreviewing(null);
                      }

                      const { ok, reason } = await confirm({
                        title: `Cancel trip ${b.code}?`,
                        description: desc,
                        confirmLabel: 'Cancel trip',
                        tone: 'destructive',
                        reason: { label: 'Reason for cancelling', placeholder: 'e.g. Plans changed', required: true },
                      });
                      if (ok) cancel.mutate({ id: b._id, reason });
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>
          {extendId === b._id && (
            <div className="border-t border-border p-4">
              <ExtendTrip booking={b} onDone={() => setExtendId(null)} />
            </div>
          )}
          {shortenId === b._id && (
            <div className="flex flex-wrap items-end gap-2 border-t border-border p-4">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">New (earlier) end date/time</label>
                <Input
                  type="datetime-local"
                  value={shortEnd}
                  min={b.period.start.slice(0, 16)}
                  max={b.period.end.slice(0, 16)}
                  onChange={(e) => setShortEnd(e.target.value)}
                />
              </div>
              <Button
                size="sm" className="rounded-full"
                disabled={!shortEnd || !shortPreview.data?.available}
                loading={shorten.isPending}
                onClick={async () => {
                  const p = shortPreview.data;
                  if (!p?.available || !p.refund) return;
                  const { ok } = await confirm({
                    title: 'End this trip earlier?',
                    description: (
                      <span>
                        Ending on {new Date(p.newEnd).toLocaleString()} refunds{' '}
                        <b>{formatMoney(p.refund)}</b> to your wallet, and the days you give back reopen for others.
                      </span>
                    ),
                    confirmLabel: `Refund ${formatMoney(p.refund)} & shorten`,
                  });
                  if (ok) shorten.mutate(b._id);
                }}
              >
                Confirm shorter trip
              </Button>
              {shortEnd && shortPreview.isFetching && (
                <p className="w-full text-xs text-muted-foreground">Checking your refundâ€¦</p>
              )}
              {shortEnd && shortPreview.data && !shortPreview.data.available && (
                <p className="w-full text-sm text-destructive">{shortPreview.data.reason}</p>
              )}
              {shortEnd && shortPreview.data?.available && shortPreview.data.refund && (
                <p className="w-full text-sm">
                  Refunds <b>{formatMoney(shortPreview.data.refund)}</b> for the days you give back.
                </p>
              )}
              {shorten.isError && (
                <p className="w-full text-sm text-destructive">
                  {shorten.error instanceof ApiError ? shorten.error.message : 'Could not shorten the trip'}
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function BookingsPage() {
  return (
    <AuthGuard>
      <div className="space-y-6 px-0">
        <div>
          <h1 className="display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Your trips
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            All your bookings and trip history in one place.
          </p>
        </div>
        <BookingsList />
      </div>
    </AuthGuard>
  );
}
