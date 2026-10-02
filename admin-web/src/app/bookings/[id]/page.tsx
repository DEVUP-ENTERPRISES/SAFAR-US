'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, BadgeCheck, IdCard, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { TimedViewer } from '@/components/secure/timed-viewer';
import { BookingStatusBadge } from '@/features/bookings/components/status-badge';
import { adminApi } from '@/features/admin/api';
import { ApiError } from '@/lib/api/types';
import { formatDate, formatDateRange, formatDateTime, formatMoney } from '@/lib/utils/format';
import { adminPath } from '@/lib/admin-path';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

const ID_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'destructive' | 'muted' }> = {
  approved: { label: 'ID verified', tone: 'success' },
  pending: { label: 'ID check pending', tone: 'warning' },
  rejected: { label: 'ID check failed', tone: 'destructive' },
  not_started: { label: 'No ID check', tone: 'muted' },
};

function Line({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-end font-medium">{value ?? '-'}</span>
    </div>
  );
}

export default function AdminBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [view, setView] = useState<{ token: string; viewSeconds: number; items: { id: string; label: string }[] } | null>(null);

  const { data: o, isLoading, isError, refetch } = useQuery({ queryKey: ['admin-booking', id], queryFn: () => adminApi.bookingOverview(id) });

  const openId = useMutation({
    mutationFn: (reason: string) => adminApi.openGuestId(id, reason),
    onSuccess: setView,
    onError: (e) => toast({ tone: 'error', title: errorText(e) }),
  });
  const clear = useMutation({
    mutationFn: (reason: string) => adminApi.clearIdentityCheck(id, reason),
    onSuccess: () => { toast({ tone: 'success', title: 'Cleared. The host can start the trip.' }); void qc.invalidateQueries({ queryKey: ['admin-booking', id] }); },
    onError: (e) => toast({ tone: 'error', title: errorText(e) }),
  });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (isError || !o) return <ErrorState message="Booking not found." retry={() => refetch()} />;

  const g = o.guest;
  const idStatus = ID_STATUS[g.identity.status] ?? ID_STATUS.not_started;
  const check = o.booking.identityCheck;
  const openMismatch = check?.result === 'mismatch' && !check.clearedAt;

  const viewId = async () => {
    const { ok, reason } = await confirm({
      title: `View ${g.name}'s ID?`,
      description: 'The driving licence and selfie open for a few minutes, stamped with your name. Your reason and every view are recorded in the audit log.',
      confirmLabel: 'View ID',
      reason: { label: 'Why do you need to see it?', placeholder: 'e.g. Damage claim, police request, host reported a mismatch', required: true },
    });
    if (ok) openId.mutate(reason);
  };

  const clearMismatch = async () => {
    const { ok, reason } = await confirm({
      title: 'Confirm this is the verified guest?',
      description: 'Only clear this after you have checked the guest yourself (for example a video call against their ID). The host can then start the trip.',
      confirmLabel: 'Clear and allow pickup',
      tone: 'destructive',
      reason: { label: 'How did you confirm it?', placeholder: 'e.g. Video call, matched licence and selfie', required: true },
    });
    if (ok) clear.mutate(reason);
  };

  return (
    <div className="space-y-5">
      <Link href={adminPath('bookings')} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Bookings
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="display text-2xl">Booking <span className="font-mono">{o.booking.code}</span></h1>
        <BookingStatusBadge status={o.booking.status as never} />
      </div>

      {openMismatch && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                <strong>Host reported the person at pickup is not the verified guest</strong> ({formatDateTime(check!.at)}).
                {check!.note ? ` "${check!.note}"` : ''} The trip can&apos;t start until this is cleared.
              </span>
            </p>
            <Button variant="outline" className="shrink-0" loading={clear.isPending} onClick={clearMismatch}>Guest confirmed, clear</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Booked by</p>
                <p className="text-xl font-semibold">{g.name}</p>
                {g.identity.verifiedName && <p className="text-sm text-muted-foreground">Name on licence: {g.identity.verifiedName}</p>}
              </div>
              <Badge tone={idStatus.tone}>
                {g.identity.status === 'approved' && <BadgeCheck className="mr-1 h-3.5 w-3.5" />}{idStatus.label}
              </Badge>
            </div>

            <div className="grid gap-x-8 sm:grid-cols-2">
              <div>
                <Line label="Email" value={g.email} />
                <Line label="Phone" value={g.phone} />
                <Line label="Member since" value={g.memberSince ? formatDate(g.memberSince) : undefined} />
                <Line label="Trips completed" value={g.tripsCompleted} />
              </div>
              <div>
                <Line label="Age" value={g.identity.age} />
                <Line label="Date of birth" value={g.identity.dob ? formatDate(g.identity.dob) : undefined} />
                <Line label="Licence expires" value={g.identity.licenceExpiry ? formatDate(g.identity.licenceExpiry) : undefined} />
                <Line label="ID verified on" value={g.identity.verifiedAt ? formatDate(g.identity.verifiedAt) : undefined} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              {g.identity.photos.length > 0 && g.identity.photosReadable ? (
                <Button loading={openId.isPending} onClick={viewId}><IdCard className="mr-2 h-4 w-4" /> View licence and selfie</Button>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4" />
                  {g.identity.photos.length === 0 ? 'No ID photos on file for this guest.' : 'ID photos aren’t available yet: the Stripe read key isn’t set on the server.'}
                </p>
              )}
              <Link className="text-sm text-primary hover:underline" href={adminPath(`kyc?user=${g.id}`)}>ID check history</Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-5">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Trip</p>
            <Line label="Dates" value={formatDateRange(o.booking.period.start, o.booking.period.end)} />
            <Line label="Total" value={o.booking.total ? formatMoney(o.booking.total) : undefined} />
            <Line label="Booked" value={o.booking.createdAt ? formatDateTime(o.booking.createdAt) : undefined} />
            <Line label="Pickup code" value={o.booking.pickupVerifiedAt ? `Verified ${formatDateTime(o.booking.pickupVerifiedAt)}` : 'Not yet'} />
            <Line label="Identity at pickup" value={!check ? 'Not checked' : check.result === 'match' ? 'Host confirmed' : check.clearedAt ? 'Mismatch, cleared by staff' : 'Mismatch reported'} />
            <Line label="Trip" value={o.trip ? `${o.trip.status}${o.trip.startedAt ? `, started ${formatDateTime(o.trip.startedAt)}` : ''}` : 'Not started'} />
            <p className="mb-2 mt-4 text-xs uppercase tracking-wide text-muted-foreground">Car and host</p>
            <Line label="Car" value={o.vehicle ? <Link className="text-primary hover:underline" href={adminPath(`vehicles/${o.vehicle.id}`)}>{o.vehicle.name}</Link> : undefined} />
            <Line label="Plate" value={o.vehicle?.plate} />
            <Line label="Host" value={o.host.name} />
            <Line label="Host contact" value={o.host.phone ?? o.host.email} />
          </CardContent>
        </Card>
      </div>

      {view && (
        <TimedViewer
          title={`${g.name}: ID documents`}
          subtitle="Staff review · stamped with your name · every view is recorded"
          seconds={view.viewSeconds}
          items={view.items}
          load={(kind) => adminApi.guestIdFile(id, view.token, kind)}
          onClose={() => setView(null)}
        />
      )}
    </div>
  );
}
