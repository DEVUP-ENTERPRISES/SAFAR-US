'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, BadgeCheck, Car, CreditCard, History, IdCard, Lock, Receipt, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { TimedViewer } from '@/components/secure/timed-viewer';
import { BookingStatusBadge } from '@/features/bookings/components/status-badge';
import { STATUS_LABEL } from '@/features/bookings/status';
import { adminApi, type AdminBookingOverview } from '@/features/admin/api';
import { ApiError } from '@/lib/api/types';
import { formatDate, formatDateRange, formatDateTime, formatMoney, formatDay } from '@/lib/utils/format';
import { adminPath } from '@/lib/admin-path';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

const ID_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'destructive' | 'muted' }> = {
  approved: { label: 'ID verified', tone: 'success' },
  pending: { label: 'ID check pending', tone: 'warning' },
  rejected: { label: 'ID check failed', tone: 'destructive' },
  not_started: { label: 'No ID check', tone: 'muted' },
};
const PAYMENT_TYPE: Record<string, string> = { booking: 'Trip payment', deposit: 'Security deposit', charge: 'Extra charge', topup: 'Wallet top-up' };
const PAYMENT_TONE: Record<string, 'success' | 'warning' | 'destructive' | 'muted' | 'default'> = {
  succeeded: 'success', authorized: 'warning', requires_action: 'warning', pending: 'warning', partially_refunded: 'warning', refunded: 'muted', cancelled: 'muted', failed: 'destructive',
};
const CANCELLED_BY: Record<string, string> = { guest: 'the guest', host: 'the host', admin: 'staff', system: 'CatoDrive (automatic)' };
const statusLabel = (s: string) => (STATUS_LABEL as Record<string, string>)[s] ?? s.replace(/_/g, ' ');

function Line({ label, value, strong }: { label: string; value?: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 break-words text-end ${strong ? 'font-semibold' : 'font-medium'} [overflow-wrap:anywhere]`}>{value ?? '-'}</span>
    </div>
  );
}

function Section({ icon, title, children, className }: { icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`min-w-0 ${className ?? ''}`}>
      <CardHeader className="p-5 pb-2 sm:p-6 sm:pb-2">
        <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">{children}</CardContent>
    </Card>
  );
}

const money = (m?: { amount: number; currency: string } | null) => (m && m.amount ? formatMoney(m) : undefined);

function MoneyCard({ o }: { o: AdminBookingOverview }) {
  const p = o.price;
  if (!p) return null;
  return (
    <Section icon={<Receipt className="h-4 w-4 text-primary" aria-hidden />} title="Price">
      <Line label={`${p.days} ${p.days === 1 ? 'day' : 'days'}`} value={money(p.base)} />
      {p.discount?.amount ? <Line label="Discount" value={`−${formatMoney(p.discount)}`} /> : null}
      {money(p.cleaningFee) && <Line label="Cleaning" value={money(p.cleaningFee)} />}
      {money(p.delivery) && <Line label="Delivery" value={money(p.delivery)} />}
      {money(p.addOnsTotal) && <Line label="Extras" value={money(p.addOnsTotal)} />}
      {money(p.protection) && <Line label={`Protection${p.protectionPlan ? ` (${p.protectionPlan})` : ''}`} value={money(p.protection)} />}
      {money(p.serviceFee) && <Line label="Service fee" value={money(p.serviceFee)} />}
      {money(p.taxTotal ?? p.tax) && <Line label="Taxes" value={money(p.taxTotal ?? p.tax)} />}
      <div className="mt-1 border-t border-border pt-1">
        <Line label="Guest total" value={money(p.total) ?? formatMoney(p.total)} strong />
        <Line label="Host earns" value={formatMoney(p.hostEarnings)} />
        <Line label="CatoDrive commission" value={formatMoney(p.commission)} />
      </div>
    </Section>
  );
}

function PaymentsCard({ o }: { o: AdminBookingOverview }) {
  if (!o.payments.length) return null;
  return (
    <Section icon={<CreditCard className="h-4 w-4 text-primary" aria-hidden />} title="Payments">
      <ul className="divide-y divide-border">
        {o.payments.map((pay) => (
          <li key={pay.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{PAYMENT_TYPE[pay.type] ?? pay.type}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(pay.createdAt)}{pay.releasedReason ? ` · ${pay.releasedReason}` : ''}</p>
            </div>
            <div className="text-end">
              <p className="font-semibold tabular-nums">{formatMoney({ amount: pay.amount, currency: pay.currency })}</p>
              {pay.refunded > 0 && <p className="text-xs text-muted-foreground tabular-nums">{formatMoney({ amount: pay.refunded, currency: pay.currency })} refunded</p>}
              {pay.wallet > 0 && <p className="text-xs text-muted-foreground tabular-nums">{formatMoney({ amount: pay.wallet, currency: pay.currency })} from wallet</p>}
              <Badge tone={PAYMENT_TONE[pay.status] ?? 'muted'}>{pay.status.replace(/_/g, ' ')}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function CancellationCard({ o }: { o: AdminBookingOverview }) {
  const c = o.cancellation;
  if (!c) return null;
  return (
    <Section icon={<AlertTriangle className="h-4 w-4 text-warning" aria-hidden />} title="Cancellation">
      <Line label="Cancelled by" value={CANCELLED_BY[c.role ?? ''] ?? c.role} />
      <Line label="When" value={formatDateTime(c.at)} />
      {c.reason && <Line label="Reason" value={c.reason} />}
      <Line label="Refunded" value={formatMoney(c.refund)} />
      {c.charged && <Line label="Kept" value={formatMoney(c.charged)} />}
    </Section>
  );
}

function HistoryCard({ o }: { o: AdminBookingOverview }) {
  if (!o.history.length) return null;
  return (
    <Section icon={<History className="h-4 w-4 text-primary" aria-hidden />} title="What happened">
      <ol className="space-y-2.5 border-s border-border ps-4">
        {o.history.map((h, i) => (
          <li key={i} className="text-sm">
            <p className="font-medium">{h.from ? `${statusLabel(h.from)} → ${statusLabel(h.to)}` : statusLabel(h.to)}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(h.at)}{h.reason ? ` · ${h.reason}` : ''}</p>
          </li>
        ))}
      </ol>
    </Section>
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

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-72 w-full rounded-lg lg:col-span-2" />
          <Skeleton className="h-72 w-full rounded-lg" />
        </div>
      </div>
    );
  }
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
        <ArrowLeft className="h-4 w-4" aria-hidden /> Bookings
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="display text-2xl">Booking <span className="font-mono">{o.booking.code}</span></h1>
        <BookingStatusBadge status={o.booking.status as never} />
        {o.booking.instantBook && <Badge tone="muted">Instant book</Badge>}
      </div>

      {openMismatch && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <span>
                <strong>Host reported the person at pickup is not the verified guest</strong> ({formatDateTime(check!.at)}).
                {check!.note ? ` "${check!.note}"` : ''} The trip can&apos;t start until this is cleared.
              </span>
            </p>
            <Button variant="outline" className="shrink-0" loading={clear.isPending} onClick={clearMismatch}>Guest confirmed, clear</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Section icon={<User className="h-4 w-4 text-primary" aria-hidden />} title="Booked by">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-2">
              <div className="min-w-0">
                <p className="text-xl font-semibold">{g.name}</p>
                {g.identity.verifiedName && <p className="text-sm text-muted-foreground">Name on licence: {g.identity.verifiedName}</p>}
              </div>
              <Badge tone={idStatus.tone}>
                {g.identity.status === 'approved' && <BadgeCheck className="me-1 h-3.5 w-3.5" aria-hidden />}{idStatus.label}
              </Badge>
            </div>
            <div className="grid gap-x-8 sm:grid-cols-2">
              <div className="min-w-0">
                <Line label="Email" value={g.email} />
                <Line label="Phone" value={g.phone} />
                <Line label="Member since" value={g.memberSince ? formatDate(g.memberSince) : undefined} />
                <Line label="Trips completed" value={g.tripsCompleted} />
              </div>
              <div className="min-w-0">
                <Line label="Age" value={g.identity.age} />
                <Line label="Date of birth" value={g.identity.dob ? formatDay(g.identity.dob) : undefined} />
                <Line label="Licence expires" value={g.identity.licenceExpiry ? formatDay(g.identity.licenceExpiry) : undefined} />
                <Line label="ID verified on" value={g.identity.verifiedAt ? formatDate(g.identity.verifiedAt) : undefined} />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-4">
              {g.identity.photos.length > 0 && g.identity.photosReadable ? (
                <Button loading={openId.isPending} onClick={viewId}><IdCard className="me-2 h-4 w-4" aria-hidden /> View licence and selfie</Button>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4" aria-hidden />
                  {g.identity.photos.length === 0 ? 'No ID photos on file for this guest.' : 'ID photos aren’t available yet: the Stripe read key isn’t set on the server.'}
                </p>
              )}
              <Link className="text-sm text-primary hover:underline" href={adminPath(`kyc?user=${g.id}`)}>ID check history</Link>
            </div>
          </Section>

          <div className="grid gap-5 md:grid-cols-2">
            <MoneyCard o={o} />
            <PaymentsCard o={o} />
          </div>
          <HistoryCard o={o} />
        </div>

        <div className="min-w-0 space-y-5">
          <Section icon={<Receipt className="h-4 w-4 text-primary" aria-hidden />} title="Trip">
            <Line label="Dates" value={formatDateRange(o.booking.period.start, o.booking.period.end)} />
            <Line label="Pickup" value={formatDateTime(o.booking.period.start)} />
            <Line label="Return" value={formatDateTime(o.booking.period.end)} />
            <Line label="Booked" value={o.booking.createdAt ? formatDateTime(o.booking.createdAt) : undefined} />
            <Line label="Cancellation policy" value={o.booking.cancellationPolicy} />
            <Line label="Pickup code" value={o.booking.pickupVerifiedAt ? `Verified ${formatDateTime(o.booking.pickupVerifiedAt)}` : 'Not yet'} />
            <Line label="Identity at pickup" value={!check ? 'Not checked' : check.result === 'match' ? 'Host confirmed' : check.clearedAt ? 'Mismatch, cleared by staff' : 'Mismatch reported'} />
            <Line label="Trip" value={o.trip ? `${o.trip.status}${o.trip.startedAt ? `, started ${formatDateTime(o.trip.startedAt)}` : ''}` : 'Not started'} />
            {o.trip?.returnedAt && <Line label="Returned" value={formatDateTime(o.trip.returnedAt)} />}
            {o.booking.extensions > 0 && <Line label="Extensions" value={o.booking.extensions} />}
            {o.booking.delivery && <Line label="Delivery" value={`${o.booking.delivery.mode}: ${o.booking.delivery.address}${o.booking.delivery.flightNumber ? ` · flight ${o.booking.delivery.flightNumber}` : ''}`} />}
            {o.booking.additionalDrivers.length > 0 && <Line label="Extra drivers" value={o.booking.additionalDrivers.join(', ')} />}
          </Section>

          <CancellationCard o={o} />

          <Section icon={<Car className="h-4 w-4 text-primary" aria-hidden />} title="Car and host">
            <Line label="Car" value={o.vehicle ? <Link className="text-primary hover:underline" href={adminPath(`vehicles/${o.vehicle.id}`)}>{o.vehicle.name}</Link> : undefined} />
            <Line label="Plate" value={o.vehicle?.plate} />
            <Line label="Host" value={o.host.name} />
            <Line label="Host phone" value={o.host.phone} />
            <Line label="Host email" value={o.host.email} />
          </Section>
        </div>
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
