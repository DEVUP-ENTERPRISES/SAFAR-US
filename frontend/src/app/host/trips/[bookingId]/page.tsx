'use client';

import Link from 'next/link';
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
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
import { bookingApi } from '@/features/bookings/api';
import { formatMoney, formatDate, kmToMiles, perKmToPerMile } from '@/lib/utils/format';
import { GuestVerification } from '@/features/host/components/guest-verification';
import { hostTripsApi } from '@/features/host/trips.api';
import { TripMessages } from '@/features/host/components/trip-messages';
import { IncidentalsForm } from '@/features/host/components/incidentals-form';
import { VerifyPickup } from '@/features/bookings/components/pickup-code';
import { InspectionPhotos } from '@/features/trips/components/inspection-photos';
import { HandoverTimeline } from '@/features/host/components/handover-timeline';
import { HandoverStep, type StepStatus } from '@/features/host/components/handover-step';
import { usePlatformConfig } from '@/features/platform/config';

type Tab = 'details' | 'messages' | 'help';

const miles = (v: number) => `${kmToMiles(v).toLocaleString()} miles`;

/** Plain message and the checklist step to send the host back to, per start error code. */
const START_ERRORS: Record<string, { text: string; step?: string }> = {
  HOST_ONLY_START: { text: 'Only the host can start this trip, at pickup. Refresh the page and try again.' },
  HOST_INSPECTION_REQUIRED: { text: 'Take the pickup photos of the car before starting the trip.', step: 'handover-inspect' },
  LICENCE_CONFIRMATION_REQUIRED: { text: 'Check the guest’s licence and confirm it before starting the trip.', step: 'handover-verify' },
  GUEST_NOT_VERIFIED: { text: 'This guest has not finished identity verification. Ask them to complete it in their app, or contact support.', step: 'handover-verify' },
  LICENCE_EXPIRES_DURING_TRIP: { text: 'The guest’s licence expires before the trip ends, so they cannot drive it. Contact support.', step: 'handover-verify' },
  PICKUP_CODE_REQUIRED: { text: 'Enter the guest’s pickup code before starting the trip.', step: 'handover-code' },
  ODOMETER_REQUIRED: { text: 'Enter the starting odometer reading.', step: 'handover-odo' },
};

const goToStep = (id?: string) => id && document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

export default function HostTripDetailPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('details');

  const [odoStart, setOdoStart] = useState('');
  const [odoEnd, setOdoEnd] = useState('');
  const [fuelStart, setFuelStart] = useState('');
  const [fuelEnd, setFuelEnd] = useState('');
  // Licence check ticked at the handover; sent with the start request.
  const [licenseChecked, setLicenseChecked] = useState(false);
  const cfg = usePlatformConfig().data;

  const { data: t, isLoading, isError } = useQuery({
    queryKey: ['host-trip', bookingId],
    queryFn: () => hostTripsApi.one(bookingId),
  });

  const licenceOk = !!(t?.licenseConfirmed || t?.handover?.licenceConfirmed || licenseChecked);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['host-trip', bookingId] });
    qc.invalidateQueries({ queryKey: ['host-trips'] });
  };

  const confirmLicense = useMutation({
    mutationFn: () => hostTripsApi.confirmLicense(t!.tripId!),
    onSuccess: invalidate,
  });
  const handover = useMutation({
    // This call creates the trip and records the licence check with it.
    mutationFn: () =>
      hostTripsApi.start(bookingId, {
        odometerStart: Number(odoStart),
        ...(fuelStart ? { fuelStart: Number(fuelStart) } : {}),
        licenceConfirmed: licenceOk,
      }),
    onSuccess: invalidate,
    onError: (e) => goToStep(e instanceof ApiError ? START_ERRORS[e.code]?.step : undefined),
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

  const confirmReturn = useMutation({
    mutationFn: () =>
      hostTripsApi.confirmReturn(t!.tripId!, {
        ...(odoEnd ? { odometerEnd: Number(odoEnd) } : {}),
        ...(fuelEnd ? { fuelEnd: Number(fuelEnd) } : {}),
      }),
    onSuccess: () => { invalidate(); toast({ tone: 'success', title: 'Return confirmed' }); },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not confirm the return' }),
  });

  const cancelBooking = useMutation({
    mutationFn: (reason: string) => bookingApi.cancel(t!.bookingId, reason),
    onSuccess: () => { invalidate(); router.push('/host/trips'); },
  });

  const guestNoShow = useMutation({
    mutationFn: () => bookingApi.noShow(bookingId, 'guest'),
    onSuccess: () => { invalidate(); toast({ tone: 'success', title: 'Guest no-show recorded' }); router.push('/host/trips'); },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not record the no-show' }),
  });

  const doGuestNoShow = async () => {
    const { ok } = await confirm({
      title: 'Report that the guest didn’t show up?',
      description: 'The trip is cancelled and the guest forfeits part of what they paid; you earn your share of that through your normal payout. The rest is refunded to the guest. This cannot be undone.',
      confirmLabel: 'Report no-show',
      tone: 'destructive',
    });
    if (ok) guestNoShow.mutate();
  };

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

  // Handover gates: the per-trip payload wins, then the public config; unknown means the server decides.
  const hv = t.handover;
  const inspectRequired = hv?.requirements?.hostInspectionRequired ?? cfg?.handover?.hostInspectionRequired ?? false;
  const codeRequired = hv?.requirements?.pickupCodeRequired ?? cfg?.handover?.pickupCodeRequired ?? false;
  const insp = hv?.inspection;
  const inspectDone = !inspectRequired || (insp ? insp.taken >= insp.required : (t.photoCount ?? 0) > 0);
  const guestVerified = hv ? hv.guestVerified : (t.guest.verification?.verified ?? true);
  const licenceExpired = (hv?.licenceValidThroughTrip ?? t.guest.verification?.licenceValidThroughTrip) === false;
  const verifyDone = guestVerified && !licenceExpired && licenceOk;
  const codeDone = !codeRequired || !!t.pickupVerified || !!hv?.pickupVerified;
  const odoDone = odoStart !== '' && Number(odoStart) >= 0;
  const canStart = inspectDone && verifyDone && codeDone && odoDone;
  const stepStatus = (done: boolean, prevDone: boolean, na = false): StepStatus =>
    na ? 'na' : done ? 'done' : prevDone ? 'active' : 'locked';
  const sInspect = stepStatus(inspectDone, true, !inspectRequired);
  const sVerify = stepStatus(verifyDone, inspectDone);
  const sCode = stepStatus(codeDone, inspectDone && verifyDone, !codeRequired);
  const sOdo = stepStatus(odoDone, inspectDone && verifyDone && codeDone);

  const doCheckIn = async () => {
    const { ok } = await confirm({
      title: 'Start the trip?',
      description: `Recording ${Number(odoStart).toLocaleString()} miles as the starting odometer. Every mileage charge is measured from this — it cannot be changed afterwards.`,
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
          If the guest drove past the <strong>{miles(t.mileage.includedKm)}</strong> included, they are
          automatically charged <strong>{formatMoney({ amount: perKmToPerMile(t.mileage.overageFeePerKm), currency: cur })}</strong>{' '}
          per extra mile. This cannot be undone.
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
          {t.timeline && t.timeline.length > 0 && (
            <div className="mt-6">
              <HandoverTimeline timeline={t.timeline} />
            </div>
          )}
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

          {!started && t.tripId && (
            <>
              <SectionLabel>Handover</SectionLabel>
              <HandoverPanel tripId={t.tripId} role="host" />
            </>
          )}

          {/* Location, gated on the tracking phase. Keyed on the booking, not
              the trip: the approach happens before a trip exists, and showing
              this only once started would hide it for the whole window it
              matters. The panel hides itself outside the window. */}
          <SectionLabel>Location</SectionLabel>
          <TrackingPanel bookingId={t.bookingId} role="host" />

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
              subtitle={
                t.licenseConfirmed
                  ? '✓ Licence confirmed'
                  : t.tripId
                    ? 'Awaiting licence'
                    : 'Confirm it in the check-in below'
              }
              action={
                t.licenseConfirmed || finished || !t.tripId
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

          {(t.extensions?.length ?? 0) > 0 && (
            <>
              <SectionLabel>Extensions</SectionLabel>
              <RowGroup>
                {(t.extensions ?? []).map((e) => (
                  <Row
                    key={e._id}
                    icon={<Receipt className="h-5 w-5" />}
                    title={`+${e.days} day${e.days === 1 ? '' : 's'}, returns ${formatDate(e.newEnd)}`}
                    subtitle={`Was ${formatDate(e.prevEnd)}`}
                    value={`+${formatMoney({ amount: e.hostEarnings, currency: cur })}`}
                  />
                ))}
              </RowGroup>
            </>
          )}

          {/* Mileage */}
          <SectionLabel>Mileage</SectionLabel>
          <RowGroup>
            <Row
              title="Total distance included"
              subtitle={
                unlimited
                  ? 'This car has unlimited mileage.'
                  : `${t.guest.name} is charged ${formatMoney({ amount: perKmToPerMile(t.mileage.overageFeePerKm), currency: cur })} for every mile over the total included.`
              }
              value={unlimited ? 'UNLIMITED' : miles(t.mileage.includedKm)}
            />
            <Row
              icon={<Gauge className="h-5 w-5" />}
              title="Distance driven"
              value={t.mileage.drivenKm != null ? miles(t.mileage.drivenKm) : '—'}
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
              <IncidentalsForm bookingId={t.bookingId} />
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

      {t.returnAwaitingConfirmation && (
        <ActionSheet
          title="Confirm return"
          description="Your guest ended the trip. Check the car, correct the readings if they are wrong, then confirm. Your payout and the guest's deposit wait for this; report any problem instead of confirming."
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ending odometer (miles)">
              <Input type="number" min={0} value={odoEnd} onChange={(e) => setOdoEnd(e.target.value)} placeholder="Leave blank to accept the guest's" />
            </Field>
            <Field label="Fuel level (%)">
              <Input type="number" min={0} max={100} value={fuelEnd} onChange={(e) => setFuelEnd(e.target.value)} placeholder="Leave blank to accept the guest's" />
            </Field>
          </div>
          <Button size="lg" loading={confirmReturn.isPending} onClick={() => confirmReturn.mutate()}>Confirm return</Button>
        </ActionSheet>
      )}

      {/* ── Sticky action sheet ─────────────────────────────────────── */}
      {!finished && tab === 'details' && (
        <ActionSheet
          title={started ? 'End trip' : 'Start check-in'}
          description={
            started
              ? "Inspect and document your car's condition after your guest's trip."
              : 'Work down the steps in order. Each one unlocks when the one before it is done.'
          }
        >
          {started ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ending odometer (miles)">
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
              <HandoverStep
                id="handover-inspect"
                n={1}
                title="Inspect the car"
                status={sInspect}
                summary={insp ? `${insp.taken}${insp.required > 0 ? ` / ${insp.required}` : ''} photos` : undefined}
              >
                <InspectionPhotos bookingId={t.bookingId} phase="pre" />
              </HandoverStep>

              <HandoverStep
                id="handover-verify"
                n={2}
                title="Verify the guest"
                status={sVerify}
                lockedReason="Take the pickup photos first."
              >
                <GuestVerification
                  guest={t.guest}
                  confirmed={!!(t.licenseConfirmed || hv?.licenceConfirmed)}
                  checked={licenseChecked}
                  onToggle={() => setLicenseChecked((v) => !v)}
                />
              </HandoverStep>

              <HandoverStep
                id="handover-code"
                n={3}
                title="Guest’s pickup code"
                status={sCode}
                lockedReason="Verify the guest first."
              >
                {codeDone ? (
                  <p className="text-sm font-medium text-success">Guest verified — you can hand over the keys.</p>
                ) : (
                  <VerifyPickup
                    tripId={t.tripId}
                    bookingId={t.bookingId}
                    locked={!!hv?.codeLocked}
                    onVerified={invalidate}
                  />
                )}
              </HandoverStep>

              <HandoverStep
                id="handover-odo"
                n={4}
                title="Odometer and fuel"
                status={sOdo}
                lockedReason="Finish the steps above first."
                showWhenLocked
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Starting odometer (miles)">
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
              </HandoverStep>

              <Button size="lg" disabled={!canStart} loading={handover.isPending} onClick={doCheckIn}>
                Start trip
              </Button>
              {!canStart && (
                <p className="text-xs text-muted-foreground">
                  {!inspectDone
                    ? 'Take the pickup photos to continue.'
                    : !verifyDone
                      ? 'Verify the guest and confirm their licence to continue.'
                      : !codeDone
                        ? 'Enter the guest’s pickup code to continue.'
                        : 'Enter the starting odometer to start the trip.'}
                </p>
              )}
              {handover.error && (() => {
                const code = handover.error instanceof ApiError ? handover.error.code : undefined;
                const known = code ? START_ERRORS[code] : undefined;
                return (
                  <p className="text-sm text-destructive">
                    {known ? known.text : handover.error instanceof Error ? handover.error.message : 'Could not start the trip.'}{' '}
                    {known?.step && (
                      <button type="button" className="font-semibold underline" onClick={() => goToStep(known.step)}>Go to that step</button>
                    )}
                    {code === 'PRE_PHOTOS_REQUIRED' && (
                      <Link href={`/host/trips/${t.bookingId}/photos`} className="font-semibold underline">Take pickup photos</Link>
                    )}
                  </p>
                );
              })()}
            </>
          )}
        </ActionSheet>
      )}

      {t.status === 'paid' && !t.tripId && tab === 'details' && new Date(t.period.start).getTime() < Date.now() && (
        <div className="mt-3">
          <Button variant="outline" className="w-full" loading={guestNoShow.isPending} onClick={doGuestNoShow}>
            Guest didn’t show up
          </Button>
        </div>
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
