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
import { ApiError } from '@/lib/api/types';

/** How each state reads to the guest, and what it means for them. */
const STATE: Record<string, { tone: 'success' | 'warning' | 'destructive' | 'muted' | 'default'; label: string; detail: string }> = {
  pending_approval: { tone: 'warning', label: 'Waiting on the host', detail: 'The host is reviewing your request. You haven’t been charged yet.' },
  pending_verification: { tone: 'warning', label: 'Verifying your identity', detail: 'We’re confirming your licence. Your card is authorised but not charged.' },
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

const CANCELLABLE = ['pending_approval', 'pending_verification', 'confirmed', 'paid'];
const CHATTABLE = ['pending_approval', 'pending_verification', 'confirmed', 'paid', 'in_progress', 'completed'];

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
    return <div className="mx-auto max-w-3xl space-y-4 py-6"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (booking.isError || !booking.data) {
    return (
      <div className="mx-auto max-w-3xl py-6">
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

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-6 pb-24">
      <Link href="/bookings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> My trips
      </Link>

      {/* The approach — who has set off, live map, and how to find the car.
          This is the screen a guest is actually on in the half hour before
          pickup, which is why it sits above everything else. The panel hides
          itself outside the window. */}
      <TrackingPanel bookingId={id} role="guest" />

      {/* "When do I get my $500 back" — the most common post-trip question in
          this category, previously answerable only by an API nobody called. */}
      <DepositStatus bookingId={id} />

      {/* Status first — the question the guest opened this page to answer. */}
      <Card>
        <CardContent className="py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Badge tone={state.tone}>{state.label}</Badge>
              <p className="mt-2 text-sm text-muted-foreground">{state.detail}</p>
            </div>
            <span className="font-mono text-xs text-muted-foreground">{b.code}</span>
          </div>

          {b.status === 'cancelled_host' && (
            <Button className="mt-4" onClick={() => router.push(`/bookings/${id}/rebook`)}>
              Find a replacement car
            </Button>
          )}
        </CardContent>
      </Card>

      {/* The car */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Car className="h-5 w-5 text-primary" /> Your car</CardTitle></CardHeader>
        <CardContent className="flex gap-4">
          {v?.photos?.[0]?.url ? (
            <img src={v.photos[0].url} alt="" className="h-24 w-32 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="h-24 w-32 shrink-0 rounded-xl bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{v ? `${v.year} ${v.make} ${v.model}` : 'Loading…'}</p>
            {v?.location?.city && (
              <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> {v.location.city}
              </p>
            )}
            <Link href={`/vehicles/${b.vehicleId}`} className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
              View listing
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* When + where */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Calendar className="h-5 w-5 text-primary" /> Trip details</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Pick-up" value={formatDate(b.period.start)} />
          <Row label="Return" value={formatDate(b.period.end)} />
          {b.delivery?.address && <Row label="Delivered to" value={b.delivery.address} />}
          {b.additionalDrivers?.length ? (
            <Row label="Additional drivers" value={b.additionalDrivers.map((d: { name: string }) => d.name).join(', ')} />
          ) : null}
        </CardContent>
      </Card>

      {/* What it cost */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Receipt className="h-5 w-5 text-primary" /> Payment</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Trip total" value={formatMoney(b.priceBreakdown.total)} strong />
          <div className="pt-2">
            <Button variant="outline" size="sm" onClick={() => router.push(`/bookings/${id}/receipt`)}>
              View full receipt
            </Button>
          </div>
        </CardContent>
      </Card>

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

      {/* Talk to the host — the thing that was missing entirely. */}
      {canChat && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><MessageSquare className="h-5 w-5 text-primary" /> Message your host</CardTitle></CardHeader>
          <CardContent><ChatPanel bookingId={id} /></CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {b.tripId && (b.status === 'in_progress' || b.status === 'paid' || b.status === 'confirmed') && (
          <Button onClick={() => router.push(`/trips/${b.tripId}`)}>
            <ShieldCheck className="h-4 w-4" /> Go to trip
          </Button>
        )}
        {canCancel && (
          <Button variant="outline" loading={cancel.isPending} onClick={onCancel}>
            <XCircle className="h-4 w-4" /> Cancel trip
          </Button>
        )}
        <Button variant="outline" onClick={() => router.push('/support')}>Get help</Button>
      </div>
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
