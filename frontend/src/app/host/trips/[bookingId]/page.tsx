'use client';

import { useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, User, Star, Camera, Receipt, FileText, ShieldCheck, LifeBuoy, Car, IdCard, Gauge,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { SectionLabel, RowGroup, Row, ActionSheet, Tabs } from '@/components/ui/rows';
import { ReviewPrompt } from '@/features/reviews/components/review-prompt';
import { FileDamageClaim } from '@/features/claims/components/file-damage-claim';
import { TrackingPanel } from '@/features/trips/components/tracking-panel';
import { HandoverPanel } from '@/features/trips/components/handover-panel';
import { DamageReviewPanel } from '@/features/ai/components/damage-review-panel';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { bookingApi } from '@/features/bookings/api';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { hostTripsApi } from '@/features/host/trips.api';
import { TripMessages } from '@/features/host/components/trip-messages';

type Tab = 'details' | 'messages' | 'help';

const km = (v: number) => `${v.toLocaleString()} KM`;

export default function HostTripDetailPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('details');

  const [odoStart, setOdoStart] = useState('');
  const [odoEnd, setOdoEnd] = useState('');
  const [fuelStart, setFuelStart] = useState('');
  const [fuelEnd, setFuelEnd] = useState('');

  const { data: t, isLoading, isError } = useQuery({
    queryKey: ['host-trip', bookingId],
    queryFn: () => hostTripsApi.one(bookingId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['host-trip', bookingId] });
    qc.invalidateQueries({ queryKey: ['host-trips'] });
  };

  const confirmLicense = useMutation({
    mutationFn: () => hostTripsApi.confirmLicense(t!.tripId!),
    onSuccess: invalidate,
  });
  const handover = useMutation({
    mutationFn: () =>
      hostTripsApi.handover(t!.tripId!, {
        odometerStart: Number(odoStart),
        ...(fuelStart ? { fuelStart: Number(fuelStart) } : {}),
      }),
    onSuccess: invalidate,
  });
  const complete = useMutation({
    mutationFn: () =>
      hostTripsApi.complete(t!.tripId!, {
        odometerEnd: Number(odoEnd),
        ...(fuelEnd ? { fuelEnd: Number(fuelEnd) } : {}),
      }),
    onSuccess: () => {
      invalidate();
      router.push('/host/trips');
    },
  });

  const cancelBooking = useMutation({
    mutationFn: (reason: string) => bookingApi.cancel(t!.bookingId, reason),
    onSuccess: () => { invalidate(); router.push('/host/trips'); },
  });

  const doHostCancel = async () => {
    // Show the host exactly what cancelling costs — the guest's full refund
    // and the standing penalty — before they commit. This is the marketplace's
    // most damaging event, so it is deliberately heavy.
    let desc: ReactNode = 'The guest is fully refunded and this counts against your standing.';
    try {
      const p = await bookingApi.cancellationPreview(t!.bookingId);
      desc = (
        <span className="block space-y-1.5">
          <span className="block">The guest will be refunded <b>{formatMoney(p.refund)}</b> in full.</span>
          {p.hostPenalty?.affectsStanding && (
            <span className="block text-destructive">{p.hostPenalty.note}</span>
          )}
        </span>
      );
    } catch { /* fall back to generic copy */ }
    const { ok, reason } = await confirm({
      title: 'Cancel this booking?',
      description: desc,
      confirmLabel: 'Cancel booking',
      tone: 'destructive',
      reason: { label: 'Reason (shared with our team)', placeholder: 'e.g. Vehicle issue', required: true },
    });
    if (ok) cancelBooking.mutate(reason);
  };

  if (isLoading) return <Skeleton className="h-[70vh] w-full rounded-2xl" />;
  if (isError || !t) return <ErrorState message="Trip not found." />;

  const cur = t.currency;
  const unlimited = t.mileage.includedKm === 0;
  const started = t.status === 'in_progress';
  const finished = t.status === 'completed' || t.status === 'cancelled';

  const doCheckIn = async () => {
    const { ok } = await confirm({
      title: 'Start the trip?',
      description: `Recording ${Number(odoStart).toLocaleString()} km as the starting odometer. Every mileage charge is measured from this — it cannot be changed afterwards.`,
      confirmLabel: 'Start trip',
    });
    if (ok) handover.mutate();
  };

  const doCheckout = async () => {
    const driven = Number(odoEnd) - 0;
    const { ok } = await confirm({
      title: 'End this trip?',
      description: unlimited ? (
        'The trip will be marked complete and your payout scheduled.'
      ) : (
        <>
          If the guest drove past the <strong>{km(t.mileage.includedKm)}</strong> included, they are
          automatically charged <strong>{formatMoney({ amount: t.mileage.overageFeePerKm, currency: cur })}</strong>{' '}
          per extra km. This cannot be undone.
        </>
      ),
      confirmLabel: 'End trip',
      tone: 'destructive',
    });
    if (ok && driven >= 0) complete.mutate();
  };

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => router.push('/host/trips')}
          className="rounded-lg p-1.5 transition-colors hover:bg-accent"
          aria-label="Back to trips"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="h-11 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
          {t.vehicle.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.vehicle.photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center brand-gradient text-xs font-bold text-white/70">
              {t.vehicle.make.slice(0, 1)}
              {t.vehicle.model.slice(0, 1)}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold leading-tight">
            {finished ? 'Past trip' : started ? 'Trip in progress' : 'Booked trip'}
          </h1>
          <p className="truncate text-sm uppercase tracking-wide text-muted-foreground">{t.guest.name}</p>
        </div>
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'details', label: 'Details' },
          { key: 'messages', label: 'Messages' },
          { key: 'help', label: 'Help' },
        ]}
      />

      {/* ── DETAILS ─────────────────────────────────────────────────── */}
      {tab === 'details' && (
        <div className="space-y-1">
          {/* Dates */}
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-card p-5">
            <div>
              <p className="text-lg font-bold">{formatDate(t.period.start)}</p>
              <p className="text-sm text-muted-foreground">
                {new Date(t.period.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="text-end">
              <p className="text-lg font-bold">{formatDate(t.period.end)}</p>
              <p className="text-sm text-muted-foreground">
                {new Date(t.period.end).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          </div>

          {/* Before handover the useful thing is when to set off, not a map. */}
          {!started && t.tripId && (
            <>
              <SectionLabel>Handover</SectionLabel>
              <HandoverPanel tripId={t.tripId} role="host" />
            </>
          )}

          {/* Location, gated on the trip's tracking phase. The host used to
              see the guest's live position for the entire hire; now it is the
              handover edges and declared exceptions only, and the panel says
              which. */}
          {started && t.tripId && (
            <>
              <SectionLabel>Location</SectionLabel>
              <TrackingPanel tripId={t.tripId} role="host" />
            </>
          )}

          {/* Guest */}
          <SectionLabel>Your guest</SectionLabel>
          <RowGroup>
            <Row
              icon={
                t.guest.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.guest.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-muted">
                    <User className="h-5 w-5" />
                  </span>
                )
              }
              title={t.guest.name}
              subtitle={
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-foreground text-foreground" /> {t.guest.tripCount} trips
                  </span>
                  <span>· Joined {new Date(t.guest.joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
                </span>
              }
              action={{ label: 'Contact guest', onClick: () => setTab('messages') }}
            />
          </RowGroup>

          {/* Trip info */}
          <SectionLabel>Trip info</SectionLabel>
          <RowGroup>
            <Row
              icon={<IdCard className="h-5 w-5" />}
              title="Confirm driver's licence"
              subtitle={t.licenseConfirmed ? '✓ Licence confirmed' : 'Awaiting licence'}
              action={
                t.licenseConfirmed || finished
                  ? undefined
                  : { label: 'Confirm', onClick: () => confirmLicense.mutate() }
              }
              value={t.licenseConfirmed ? '✓' : undefined}
            />
            <Row
              icon={<Camera className="h-5 w-5" />}
              title={`Trip photos (${t.photoCount})`}
              subtitle="Document condition before and after"
              action={{ label: 'Add photos', href: `/host/trips/${t.bookingId}/photos` }}
            />
            <Row
              icon={<Receipt className="h-5 w-5" />}
              title="Total earnings"
              subtitle={formatMoney({ amount: t.earnings, currency: cur })}
              action={{ label: 'View receipt', href: `/host/trips/${t.bookingId}/receipt` }}
            />
            <Row
              icon={<FileText className="h-5 w-5" />}
              title="Cancellation policy"
              action={{ label: 'Review', onClick: () => setTab('help') }}
            />
          </RowGroup>

          {/* Mileage */}
          <SectionLabel>Mileage</SectionLabel>
          <RowGroup>
            <Row
              title="Total distance included"
              subtitle={
                unlimited
                  ? 'This car has unlimited mileage.'
                  : `${t.guest.name} is charged ${formatMoney({ amount: t.mileage.overageFeePerKm, currency: cur })} for every km over the total included.`
              }
              value={unlimited ? 'UNLIMITED' : km(t.mileage.includedKm)}
            />
            <Row
              icon={<Gauge className="h-5 w-5" />}
              title="Distance driven"
              value={t.mileage.drivenKm != null ? km(t.mileage.drivenKm) : '—'}
            />
          </RowGroup>

          {/* About the car */}
          <SectionLabel>About the car</SectionLabel>
          <RowGroup>
            <Row
              icon={<Car className="h-5 w-5" />}
              title={`${t.vehicle.make} ${t.vehicle.model} ${t.vehicle.year || ''}`}
              action={{ label: 'View listing', href: `/host/listings/${t.vehicle._id}` }}
            />
            <Row title="Licence plate number" value={t.vehicle.plate ?? '—'} />
          </RowGroup>

          {/* Post-trip: rate the guest, and file a damage claim if needed */}
          {finished && t.tripId && (
            <div className="mt-6 space-y-4">
              <DamageReviewPanel tripId={t.tripId} canRun />
              <ReviewPrompt bookingId={t.bookingId} role="host" subjectName={t.guest.name} />
              <FileDamageClaim bookingId={t.bookingId} tripId={t.tripId} currency={cur} />
            </div>
          )}
        </div>
      )}

      {/* ── MESSAGES ────────────────────────────────────────────────── */}
      {tab === 'messages' && <TripMessages bookingId={t.bookingId} guestName={t.guest.name} />}

      {/* ── HELP ────────────────────────────────────────────────────── */}
      {tab === 'help' && (
        <div className="space-y-1">
          <div className="mt-6 rounded-2xl border border-border bg-card p-5">
            <p className="font-semibold">Get help</p>
            <p className="mt-1 text-sm text-muted-foreground">Help centre and contact support</p>
            <Button className="mt-4 w-full" onClick={() => router.push('/support')}>
              <LifeBuoy className="h-4 w-4" /> Get help
            </Button>
          </div>

          <SectionLabel>Policy</SectionLabel>
          <RowGroup>
            <Row
              icon={<FileText className="h-5 w-5" />}
              title="Cancellation policy"
              subtitle="Trip cancellation penalties and where exceptions apply"
              href="/support"
            />
          </RowGroup>

          <SectionLabel>Protection</SectionLabel>
          <RowGroup>
            <Row
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Protection plan"
              subtitle="Confirm the licence and take pre-trip photos to stay covered"
              value={t.licenseConfirmed && t.photoCount > 0 ? 'Covered' : 'Action needed'}
            />
          </RowGroup>

          <SectionLabel>Report</SectionLabel>
          <RowGroup>
            <Row
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Report damage"
              subtitle="Open a claim with photo evidence"
              danger
              href={`/claims?booking=${t.bookingId}`}
            />
          </RowGroup>
        </div>
      )}

      {/* ── Sticky action sheet ─────────────────────────────────────── */}
      {!finished && tab === 'details' && (
        <ActionSheet
          title={started ? 'End trip' : 'Start check-in'}
          description={
            started
              ? "Inspect and document your car's condition after your guest's trip."
              : "Confirm your guest's licence and take pre-trip photos to qualify for your protection plan."
          }
        >
          {started ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ending odometer (km)">
                  <Input
                    type="number"
                    min={0}
                    value={odoEnd}
                    onChange={(e) => setOdoEnd(e.target.value)}
                    placeholder="e.g. 41250"
                  />
                </Field>
                <Field label="Fuel level (%)">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={fuelEnd}
                    onChange={(e) => setFuelEnd(e.target.value)}
                    placeholder="e.g. 80"
                  />
                </Field>
              </div>
              <Button size="lg" disabled={!odoEnd} loading={complete.isPending} onClick={doCheckout}>
                Start checkout
              </Button>
            </>
          ) : (
            <>
              {!t.licenseConfirmed && (
                <Button
                  size="lg"
                  variant="outline"
                  loading={confirmLicense.isPending}
                  onClick={() => confirmLicense.mutate()}
                >
                  <IdCard className="h-4 w-4" /> Confirm guest&apos;s licence
                </Button>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Starting odometer (km)">
                  <Input
                    type="number"
                    min={0}
                    value={odoStart}
                    onChange={(e) => setOdoStart(e.target.value)}
                    placeholder="e.g. 40100"
                  />
                </Field>
                <Field label="Fuel level (%)">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={fuelStart}
                    onChange={(e) => setFuelStart(e.target.value)}
                    placeholder="e.g. 95"
                  />
                </Field>
              </div>
              <Button
                size="lg"
                disabled={!t.licenseConfirmed || !odoStart || !t.tripId}
                loading={handover.isPending}
                onClick={doCheckIn}
              >
                Get started
              </Button>
              {!t.licenseConfirmed && (
                <p className="text-xs text-muted-foreground">
                  Confirm the licence first — it&apos;s required for your protection plan.
                </p>
              )}
              {!t.tripId && (
                <p className="text-xs text-muted-foreground">
                  The guest starts the trip from their app; check-in unlocks then.
                </p>
              )}
            </>
          )}
        </ActionSheet>
      )}

      {/* A host may cancel an upcoming trip, but it is costly and clearly framed. */}
      {!finished && !started && tab === 'details' && (
        <div className="mt-3">
          <Button
            variant="ghost"
            className="w-full text-destructive"
            loading={cancelBooking.isPending}
            onClick={doHostCancel}
          >
            Cancel this booking
          </Button>
        </div>
      )}
    </div>
  );
}
