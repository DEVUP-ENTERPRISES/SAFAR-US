'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Calendar, MapPin, MessageSquare, Receipt, Car, ShieldCheck, XCircle, Lock,
} from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { TrackingPanel } from '@/features/trips/components/tracking-panel';
import { useLocationStreaming, useTrackingState } from '@/features/trips/hooks';
import { cn } from '@/lib/utils/cn';
import { ChatPanel } from '@/features/messaging/chat-panel';
import { bookingApi } from '@/features/bookings/api';
import { claimsApi } from '@/features/claims/api';
import { vehicleApi } from '@/features/vehicles/api';
import { DepositStatus } from '@/features/payments/deposit-status';
import { IncidentalCharges } from '@/features/bookings/components/incidental-charges';
import { PickupCode } from '@/features/bookings/components/pickup-code';
import { ApiError } from '@/lib/api/types';

/** How each state reads to the guest, and what it means for them. */
const STATE: Record<string, { tone: 'success' | 'warning' | 'destructive' | 'muted' | 'default'; label: string; detail: string }> = {
  pending_approval: { tone: 'warning', label: 'Waiting on the host', detail: 'The host is reviewing your request. You haven’t been charged yet.' },
  pending_verification: { tone: 'warning', label: 'Verifying your identity', detail: 'We’re confirming your licence. Your card is authorised but not charged.' },
  pending_payment: { tone: 'warning', label: 'Payment incomplete', detail: 'Your dates are held but the payment didn’t finish. This trip isn’t confirmed until it does.' },
  paid: { tone: 'success', label: 'Confirmed', detail: 'You’re booked. The host will meet you at pickup.' },
  confirmed: { tone: 'success', label: 'Confirmed', detail: 'You’re booked. The host will meet you at pickup.' },
  in_progress: { tone: 'default', label: 'Trip in progress', detail: 'Enjoy the drive — return it on time to avoid late fees.' },
  completed: { tone: 'muted', label: 'Completed', detail: 'This trip is finished. Thanks for riding.' },
  declined: { tone: 'destructive', label: 'Declined by host', detail: 'The host couldn’t take this trip. You haven’t been charged.' },
  expired: { tone: 'destructive', label: 'Request expired', detail: 'The host didn’t respond in time. You haven’t been charged.' },
  cancelled_guest: { tone: 'muted', label: 'Cancelled by you', detail: 'You cancelled this trip.' },
  cancelled_host: { tone: 'destructive', label: 'Cancelled by host', detail: 'The host cancelled. We’ll cover the price difference on a replacement car.' },
  cancelled_system: { tone: 'muted', label: 'Cancelled', detail: 'This booking was cancelled.' },
};

const CANCELLABLE = ['pending_approval', 'pending_verification', 'pending_payment', 'confirmed', 'paid'];
const CHATTABLE = ['pending_approval', 'pending_verification', 'pending_payment', 'confirmed', 'paid', 'in_progress', 'completed'];

function BookingDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const confirm = useConfirm();
  // Share position only while the server says the window is open.
  const tracking = useTrackingState(id);
  useLocationStreaming(id, !!tracking.data?.trackingEnabled && tracking.data.broadcasters.includes('guest'));
  const toast = useToast();

  const booking = useQuery({ queryKey: ['booking', id], queryFn: () => bookingApi.getById(id), retry: false });
  const vehicle = useQuery({
    queryKey: ['vehicle', booking.data?.vehicleId],
    queryFn: () => vehicleApi.getById(booking.data!.vehicleId),
    enabled: !!booking.data?.vehicleId,
  });

  // After a trip ends there is a window in which damage can still be claimed.
  // Guests deserve to know when that shuts — it is the difference between
  // "probably fine" and "this trip can no longer cost me anything".
  const settlement = useQuery({
    queryKey: ['settlement', id],
    queryFn: () => claimsApi.settlement(id),
    enabled: booking.data?.status === 'completed',
    retry: false,
  });

  const cancel = useMutation({
    mutationFn: (reason: string) => bookingApi.cancel(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking', id] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      toast({ tone: 'success', title: 'Booking cancelled' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not cancel' }),
  });

  if (booking.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 py-6">
        <Skeleton className="h-52 w-full rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2"><Skeleton className="h-64 w-full rounded-2xl" /></div>
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    );
  }
  if (booking.isError || !booking.data) {
    return (
      <div className="mx-auto max-w-6xl py-6">
        <ErrorState message="We couldn’t find that booking." />
        <Link href="/bookings" className="mt-4 inline-block text-sm font-medium text-primary underline">Back to my trips</Link>
      </div>
    );
  }

  const b = booking.data;
  const state = STATE[b.status] ?? { tone: 'muted' as const, label: b.status, detail: '' };
  const v = vehicle.data;
  const canCancel = CANCELLABLE.includes(b.status);
  const canChat = CHATTABLE.includes(b.status);

  const onCancel = async () => {
    const preview = await bookingApi.cancellationPreview(id).catch(() => null);
    const { ok, reason } = await confirm({
      title: 'Cancel this trip?',
      description: preview
        ? `You’d be refunded ${formatMoney(preview.refund)} of ${formatMoney(preview.total)}.${preview.isFullRefund ? '' : ' Cancelling later refunds less.'}`
        : 'This cannot be undone.',
      confirmLabel: 'Cancel trip',
      tone: 'destructive',
      reason: { label: 'Reason', placeholder: 'e.g. Plans changed', required: true },
    });
    if (ok && reason) cancel.mutate(reason);
  };

  const p = b.priceBreakdown;

  return (
    /*
      Two columns from lg, one below.

      This was a single max-w-3xl stack of identically-weighted cards: on a
      laptop it read as a narrow ribbon with dead space either side, and the
      status, the car and the price all carried the same visual weight, so
      nothing answered "what is happening with my trip" at a glance.

      Now the summary leads, and what the guest can DO about it (pay, cancel,
      get help) stays in a sticky rail rather than being buried under the chat.
    */
    <div className="mx-auto max-w-6xl space-y-6 py-6 pb-24">
      <Link href="/bookings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> My trips
      </Link>

      {/* ── Summary: status, car and dates in one glance ───────────────── */}
      <Card className="overflow-hidden">
        <div className="grid gap-0 sm:grid-cols-[minmax(0,260px)_1fr]">
          <div className="relative h-44 w-full bg-muted sm:h-full sm:min-h-[200px]">
            {v?.photos?.[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.photos[0].url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                <Car className="h-8 w-8" />
              </div>
            )}
          </div>

          <div className="min-w-0 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone={state.tone}>{state.label}</Badge>
              <span className="font-mono text-xs text-muted-foreground">{b.code}</span>
            </div>

            <h1 className="display mt-3 truncate text-2xl">
              {v ? `${v.year} ${v.make} ${v.model}` : 'Loading…'}
            </h1>
            {v?.location?.city && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> {v.location.city}
              </p>
            )}

            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{state.detail}</p>

            {/* The two dates that define the trip, given equal billing. */}
            <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <DateBlock label="Pick-up" value={formatDate(b.period.start)} />
              <DateBlock label="Return" value={formatDate(b.period.end)} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/vehicles/${b.vehicleId}`}>
                <Button variant="outline" size="sm">View listing</Button>
              </Link>
              {b.status === 'cancelled_host' && (
                <Button size="sm" onClick={() => router.push(`/bookings/${id}/rebook`)}>
                  Find a replacement car
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Time-critical and full width: this is the screen a guest is actually
          on in the half hour before pickup. Both hide themselves outside
          their window. */}
      <TrackingPanel bookingId={id} role="guest" />
      {['paid', 'confirmed', 'in_progress'].includes(String(b.status)) && <PickupCode bookingId={id} />}

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* ── Main column ──────────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-2">
          <DepositStatus bookingId={id} />

          {/* Post-trip charges, itemised and disputable. */}
          {(b.incidentals?.length ?? 0) > 0 && (
            <IncidentalCharges
              bookingId={id}
              items={b.incidentals!}
              currency={b.priceBreakdown?.currency ?? 'USD'}
            />
          )}

          {/* Only the details the summary above does not already carry. */}
          {!!(b.delivery?.address || b.additionalDrivers?.length) && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Calendar className="h-5 w-5 text-primary" /> Trip details</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {b.delivery?.address && <Row label="Delivered to" value={b.delivery.address} />}
                {b.additionalDrivers?.length ? (
                  <Row label="Additional drivers" value={b.additionalDrivers.map((d: { name: string }) => d.name).join(', ')} />
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* The close-out promise, in a date. */}
          {b.status === 'completed' && settlement.data && (
            <Card className={settlement.data.closed ? 'border-success/40 bg-success/5' : undefined}>
              <CardContent className="flex items-start gap-3 py-5">
                <Lock className={cn('mt-0.5 h-5 w-5 shrink-0', settlement.data.closed ? 'text-success' : 'text-muted-foreground')} />
                <div>
                  <p className="font-semibold">
                    {settlement.data.closed
                      ? 'This trip is closed'
                      : settlement.data.openClaims > 0
                        ? 'A claim is being reviewed'
                        : 'Final checks'}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {settlement.data.closed
                      ? 'No further charges can be made for this trip. You’re done.'
                      : settlement.data.openClaims > 0
                        ? 'We’ll let you know the outcome. Nothing is charged until it’s resolved.'
                        : `Your host has ${settlement.data.hoursRemaining}h left to report any damage. After that, this trip can’t be charged again.`}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {canChat && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><MessageSquare className="h-5 w-5 text-primary" /> Message your host</CardTitle></CardHeader>
              <CardContent><ChatPanel bookingId={id} /></CardContent>
            </Card>
          )}
        </div>

        {/* ── Rail: what it cost, and what you can do ──────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Receipt className="h-5 w-5 text-primary" /> Payment</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <Row label={`${p.days} ${p.days === 1 ? 'day' : 'days'}`} value={formatMoney(p.base)} />
              {p.cleaningFee?.amount > 0 && <Row label="Cleaning" value={formatMoney(p.cleaningFee)} />}
              {p.delivery?.amount > 0 && <Row label="Delivery" value={formatMoney(p.delivery)} />}
              {p.addOnsTotal?.amount > 0 && <Row label="Extras" value={formatMoney(p.addOnsTotal)} />}
              {p.protection?.amount > 0 && <Row label="Protection" value={formatMoney(p.protection)} />}
              {p.serviceFee?.amount > 0 && <Row label="Service fee" value={formatMoney(p.serviceFee)} />}
              {p.discount?.amount > 0 && <Row label="Discount" value={`−${formatMoney(p.discount)}`} />}
              <div className="border-t border-border pt-2.5">
                <Row label="Total" value={formatMoney(p.total)} strong />
              </div>
              <Button variant="outline" size="sm" className="mt-1 w-full" onClick={() => router.push(`/bookings/${id}/receipt`)}>
                View full receipt
              </Button>
            </CardContent>
          </Card>

          {/* Full-width stacked buttons, not a wrapping row — these were the
              last thing on a long page and easy to miss entirely. */}
          <Card>
            <CardContent className="space-y-2 py-5">
              {b.tripId && (b.status === 'in_progress' || b.status === 'paid' || b.status === 'confirmed') && (
                <Button className="w-full" onClick={() => router.push(`/trips/${b.tripId}`)}>
                  <ShieldCheck className="h-4 w-4" /> Go to trip
                </Button>
              )}
              <Button variant="outline" className="w-full" onClick={() => router.push('/support')}>
                Get help
              </Button>
              {canCancel && (
                <Button
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive"
                  loading={cancel.isPending}
                  onClick={onCancel}
                >
                  <XCircle className="h-4 w-4" /> Cancel trip
                </Button>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/** A labelled date, sized so pick-up and return read as a pair. */
function DateBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-semibold' : 'font-medium'}>{value}</span>
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <BookingDetail id={id} />
    </AuthGuard>
  );
}
