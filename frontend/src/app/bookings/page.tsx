'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ApiError } from '@/lib/api/types';
import { BookingStatusBadge } from '@/features/bookings/components/status-badge';
import { useMyBookings, useCancelBooking, useCompletePayment } from '@/features/bookings/hooks';
import { bookingApi } from '@/features/bookings/api';
import { ExtendTrip } from '@/features/bookings/components/extend-trip';
import { tripApi } from '@/features/trips/api';
import { formatMoney, formatDateTime } from '@/lib/utils/format';

/** What the guest should do or expect next, per status — the "what happens now" of each trip. */
const NEXT_STEP: Record<string, string> = {
  pending_verification: 'Next: verify your licence before pickup — tap to continue',
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
  const [extendId, setExtendId] = useState<string | null>(null);
  const [shortenId, setShortenId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [shortEnd, setShortEnd] = useState('');
  const startTrip = useMutation({
    mutationFn: (bookingId: string) => tripApi.start(bookingId),
    onSuccess: (trip) => router.push(`/trips/${trip._id}`),
    // Pickup photos are taken from the booking page, so send them there instead of leaving a bare error.
    onError: (err, bookingId) => { if (err instanceof ApiError && err.code === 'PRE_PHOTOS_REQUIRED') router.push(`/bookings/${bookingId}`); },
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
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  if (isError) return <ErrorState message="Couldn't load your trips." retry={() => refetch()} />;
  if (!data || data.length === 0)
    return <EmptyState title="No trips yet" description="Book a vehicle to see it here." />;

  const cancellable = ['pending_approval', 'confirmed', 'paid'];

  return (
    <div className="space-y-3">
      {data.map((b) => (
        <Card key={b._id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
            <button onClick={() => router.push(`/bookings/${b._id}`)} className="min-w-0 text-start">
              <div className="flex items-center gap-2">
                <span className="font-semibold hover:text-primary hover:underline">{b.code}</span>
                <BookingStatusBadge status={b.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick-up {formatDateTime(b.period.start)} → Return {formatDateTime(b.period.end)}
              </p>
              {NEXT_STEP[b.status] && (
                <p className="mt-1 text-sm font-medium text-primary">{NEXT_STEP[b.status]}</p>
              )}
            </button>
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={() => router.push(`/bookings/${b._id}/receipt`)}
                className="font-semibold hover:text-primary hover:underline"
                title="View receipt"
              >
                {formatMoney(b.priceBreakdown.total)}
              </button>
              <div className="flex items-center gap-1">
                {b.status === 'pending_payment' && (
                  <Button
                    size="sm"
                    loading={completePayment.isPending && completePayment.variables === b._id}
                    onClick={() => completePayment.mutate(b._id)}
                  >
                    Complete payment
                  </Button>
                )}
                {b.status === 'paid' && (
                  <Button size="sm" loading={startTrip.isPending} onClick={() => startTrip.mutate(b._id)}>
                    Start trip
                  </Button>
                )}
                {b.status === 'in_progress' && b.tripId && (
                  <Button size="sm" onClick={() => router.push(`/trips/${b.tripId}`)}>
                    Open trip
                  </Button>
                )}
                {['paid', 'in_progress'].includes(b.status) && (
                  <Button size="sm" variant="outline" onClick={() => { setExtendId(extendId === b._id ? null : b._id); setShortenId(null); }}>
                    Extend
                  </Button>
                )}
                {b.status === 'paid' && (
                  <Button size="sm" variant="outline" onClick={() => { setShortenId(shortenId === b._id ? null : b._id); setShortEnd(''); setExtendId(null); }}>
                    Shorten
                  </Button>
                )}
                {['completed', 'cancelled'].includes(b.status) && (
                  <Button size="sm" variant="outline" onClick={() => router.push(`/vehicles/${b.vehicleId}`)}>
                    Book again
                  </Button>
                )}
                {cancellable.includes(b.status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    loading={cancel.isPending || previewing === b._id}
                    onClick={async () => {
                      // Fetch the exact refund first, the way Turo does — a
                      // guest deciding whether to eat a loss deserves the real
                      // number, not "it depends on the policy".
                      setPreviewing(b._id);
                      let desc: ReactNode =
                        'This cannot be undone — you would need to rebook.';
                      try {
                        const p = await bookingApi.cancellationPreview(b._id);
                        const policyLabel = { flexible: 'Flexible', moderate: 'Moderate', strict: 'Strict' }[p.policy];
                        desc = (
                          <span className="block space-y-1.5">
                            <span className="block">
                              You paid <b>{formatMoney(p.total)}</b>.{' '}
                              {p.isFullRefund ? (
                                <>You’ll be refunded the <b>full {formatMoney(p.refund)}</b>.</>
                              ) : p.refund.amount > 0 ? (
                                <>You’ll be refunded <b>{formatMoney(p.refund)}</b> — {formatMoney(p.nonRefundable)} is non-refundable under this host’s {policyLabel.toLowerCase()} policy.</>
                              ) : (
                                <>This is <b>non-refundable</b> under this host’s {policyLabel.toLowerCase()} policy.</>
                              )}
                            </span>
                            {p.fullRefundUntil && !p.isFullRefund && (
                              <span className="block text-xs text-muted-foreground">
                                A full refund was available until {new Date(p.fullRefundUntil).toLocaleString()}.
                              </span>
                            )}
                            <span className="block text-xs text-muted-foreground">This cannot be undone — you would need to rebook.</span>
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
          </CardContent>
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
                size="sm"
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
                <p className="w-full text-xs text-muted-foreground">Checking your refund…</p>
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
        </Card>
      ))}
    </div>
  );
}

export default function BookingsPage() {
  return (
    <AuthGuard>
      <div className="space-y-6">
        <h1 className="display text-display-sm">Your trips</h1>
        <BookingsList />
      </div>
    </AuthGuard>
  );
}
