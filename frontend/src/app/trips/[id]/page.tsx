'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { MapPin, Gauge, Fuel, ShieldAlert, CheckCircle2, Camera, KeyRound, Leaf, TreePine } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils/format';
import { tripApi } from '@/features/trips/api';
import { useTrip, useCheckIn, useCompleteTrip, useSos, useLocationStreaming, useTrackingState } from '@/features/trips/hooks';
import { ChatPanel } from '@/features/messaging/chat-panel';
import { HandoverPanel } from '@/features/trips/components/handover-panel';
import { TrackingPanel } from '@/features/trips/components/tracking-panel';
import { IncidentButton } from '@/features/trips/components/incident-button';
import { DamageReviewPanel } from '@/features/ai/components/damage-review-panel';
import { DriverManager } from '@/features/bookings/components/driver-manager';
import { InspectionPhotos } from '@/features/trips/components/inspection-photos';
import { ReviewPrompt } from '@/features/reviews/components/review-prompt';

function TripDashboard() {
  const { id } = useParams<{ id: string }>();
  const { data: trip, isLoading, isError, refetch } = useTrip(id);
  const checkIn = useCheckIn(id);
  const complete = useCompleteTrip(id);
  const sos = useSos(id);
  const [damage, setDamage] = useState('');
  const [odoEnd, setOdoEnd] = useState('');
  const [fuelEnd, setFuelEnd] = useState('');

  // Stream only while the server says tracking is open.
  const tracking = useTrackingState(trip?.bookingId ?? '');
  useLocationStreaming(trip?.bookingId ?? '', !!tracking.data?.trackingEnabled && tracking.data.broadcasters.includes('guest'));

  if (isLoading) return <Skeleton className="h-[70vh] w-full rounded-[2rem]" />;
  if (isError || !trip) return <ErrorState message="Trip not found." retry={() => refetch()} />;

  const returnPhotoCount = (trip.photos ?? []).filter((p) => p.phase === 'post').length;
  const loc = trip.liveLocation;
  const isActive = trip.status === 'active';
  const isCompleted = trip.status === 'completed';

  return (
    <div className="flex flex-col lg:flex-row gap-8 xl:gap-12 pb-24 lg:pb-12">
      {/* Main Content */}
      <div className="flex-1 space-y-10 min-w-0">
        
        {/* Header Section */}
        <header className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">Your trip</h1>
              <p className="mt-1.5 text-base text-muted-foreground font-medium">Started {formatDate(trip.handover.at)}</p>
            </div>
            <Badge
              tone={isActive ? 'default' : isCompleted ? 'success' : 'destructive'}
              className="px-3 py-1 text-sm font-semibold uppercase tracking-wider"
            >
              {trip.status}
            </Badge>
          </div>
        </header>

        {/* Primary Actions (Sticky on Mobile, Top on Desktop) */}
        {isActive && (
          <section className="fixed bottom-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-xl border-t border-border/50 p-4 pb-safe sm:pb-4 lg:relative lg:border-none lg:p-0 lg:bg-transparent lg:backdrop-blur-none shadow-[0_-8px_30px_rgba(0,0,0,0.04)] lg:shadow-none">
            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto lg:max-w-none">
              {!trip.checkin && (
                <Button size="lg" className="flex-1 font-semibold text-base rounded-full shadow-md" loading={checkIn.isPending} onClick={() => checkIn.mutate()}>
                  <KeyRound className="h-5 w-5 mr-2" /> Check-in now
                </Button>
              )}
              {trip.checkin && (
                <Button
                  size="lg"
                  variant="primary"
                  className="flex-1 font-semibold text-base rounded-full shadow-md"
                  loading={complete.isPending}
                  disabled={returnPhotoCount < 2}
                  title={returnPhotoCount < 2 ? 'Add at least 2 return photos first' : undefined}
                  onClick={() =>
                    complete.mutate({
                      odometerEnd: odoEnd ? Number(odoEnd) : undefined,
                      fuelEnd: fuelEnd ? Number(fuelEnd) : undefined,
                    })
                  }
                >
                  <CheckCircle2 className="h-5 w-5 mr-2" /> Complete trip
                </Button>
              )}
              <Button size="lg" variant="destructive" className="sm:flex-none rounded-full" loading={sos.isPending} onClick={() => sos.mutate()}>
                <ShieldAlert className="h-5 w-5 sm:mr-0 lg:mr-2" /> <span className="sm:hidden lg:inline">SOS</span>
              </Button>
            </div>
          </section>
        )}

        {/* Critical Panels */}
        <div className="space-y-4">
          {isActive && !trip.checkin && <HandoverPanel tripId={trip._id} role="guest" />}
          {isActive && <IncidentButton tripId={trip._id} />}
          <TrackingPanel bookingId={trip.bookingId} role="guest" />
          <DamageReviewPanel tripId={trip._id} canRun={false} />
        </div>

        {/* Trip Details Grid */}
        <section>
          <h2 className="text-xl font-bold mb-4">Trip details</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricBox icon={<KeyRound />} label="Check-in" value={trip.checkin ? trip.checkin.method : 'Pending'} />
            <MetricBox icon={<Gauge />} label="Distance" value={`${trip.distanceKm} km`} />
            <MetricBox icon={<Fuel />} label="Fuel start" value={trip.handover.fuelStart != null ? `${trip.handover.fuelStart}%` : '—'} />
            <MetricBox icon={<MapPin />} label="Location" value={loc ? `${loc.coordinates[1].toFixed(3)}, ${loc.coordinates[0].toFixed(3)}` : 'No signal'} />
          </div>
        </section>

        {/* Sustainability */}
        {trip.carbon && (
          <section>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Leaf className="h-5 w-5 text-success" /> Sustainability
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricBox icon={<Fuel />} label="CO₂ emitted" value={`${trip.carbon.emittedKg} kg`} />
              <MetricBox icon={<Leaf className="text-success" />} label="CO₂ saved" value={`${trip.carbon.savedKg} kg`} />
              <MetricBox icon={<TreePine className="text-success" />} label="Trees / yr" value={`${trip.carbon.treesEquivalent}`} />
              <MetricBox icon={<Gauge />} label="Distance" value={`${trip.carbon.distanceKm} km`} />
            </div>
          </section>
        )}

        {isCompleted && (
          <section>
            <ReviewPrompt bookingId={trip.bookingId} role="guest" />
          </section>
        )}

        {/* Return Details Form */}
        {isActive && trip.checkin && (
          <section className="bg-muted/30 rounded-3xl p-5 sm:p-6 border border-border/40">
            <h2 className="text-xl font-bold mb-5">Return details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <label className="block">
                <span className="block text-sm font-semibold text-muted-foreground mb-2">Ending odometer (km)</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={trip.handover.odometerStart ?? 0}
                  value={odoEnd}
                  onChange={(e) => setOdoEnd(e.target.value)}
                  placeholder={trip.handover.odometerStart != null ? `≥ ${trip.handover.odometerStart}` : 'e.g. 41250'}
                  className="h-12 rounded-xl bg-background border-border/50 focus:ring-primary/20 text-lg"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-semibold text-muted-foreground mb-2">Fuel level (%)</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={fuelEnd}
                  onChange={(e) => setFuelEnd(e.target.value)}
                  placeholder="e.g. 80"
                  className="h-12 rounded-xl bg-background border-border/50 focus:ring-primary/20 text-lg"
                />
              </label>
            </div>
            {returnPhotoCount < 2 && (
              <p className="mt-5 text-sm font-medium text-amber-600 flex items-center gap-2 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                <Camera className="h-4 w-4" /> Add at least 2 return photos below to complete the trip.
              </p>
            )}
          </section>
        )}

        {/* Inspections */}
        <div className="space-y-10">
          <section>
            <h2 className="text-xl font-bold mb-4">Pickup condition</h2>
            <InspectionPhotos trip={trip} phase="pre" editable={isActive} />
          </section>

          {(isActive || (trip.photos ?? []).some((p) => p.phase === 'post')) && (
            <section>
              <h2 className="text-xl font-bold mb-4">Return condition</h2>
              <InspectionPhotos trip={trip} phase="post" editable={isActive} />
            </section>
          )}
        </div>

        {/* Drivers */}
        <section>
          <DriverManager bookingId={trip.bookingId} />
        </section>

        {/* Damage Reporting */}
        <section className="bg-muted/30 rounded-3xl p-5 sm:p-6 border border-border/40">
          <h2 className="text-xl font-bold mb-4">Report damage</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input 
              value={damage} 
              onChange={(e) => setDamage(e.target.value)} 
              placeholder="Describe any damage…" 
              className="h-12 flex-1 rounded-xl bg-background border-border/50 text-base"
            />
            <Button
              size="lg"
              className="rounded-xl font-semibold sm:w-auto w-full shrink-0"
              disabled={!damage.trim()}
              onClick={async () => {
                await tripApi.reportDamage(id, damage.trim(), []);
                setDamage('');
                refetch();
              }}
            >
              <Camera className="h-5 w-5 mr-2" /> Report
            </Button>
          </div>
          {trip.damageReports.length > 0 && (
            <ul className="mt-5 space-y-3">
              {trip.damageReports.map((d, i) => (
                <li key={i} className="flex gap-3 text-sm text-muted-foreground p-3 bg-background rounded-xl border border-border/40">
                  <div className="w-1.5 h-1.5 rounded-full bg-destructive mt-2 shrink-0" />
                  <div>
                    <span className="text-foreground font-medium block">{d.description}</span>
                    <span className="text-xs opacity-70">{formatDate(d.at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>

      {/* Chat Sidebar */}
      <div className="w-full lg:w-[380px] xl:w-[420px] shrink-0">
        <div className="sticky top-24 h-[calc(100vh-8rem)] rounded-3xl overflow-hidden border border-border/40 shadow-xl bg-card">
          <ChatPanel bookingId={trip.bookingId} />
        </div>
      </div>
    </div>
  );
}

function MetricBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col p-4 bg-muted/30 rounded-2xl border border-border/40 transition-colors hover:bg-muted/50">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2">
        <span className="text-primary [&>svg]:w-4 [&>svg]:h-4">{icon}</span> {label}
      </div>
      <div className="text-lg font-bold text-foreground capitalize tracking-tight">{value}</div>
    </div>
  );
}

export default function TripPage() {
  return (
    <AuthGuard>
      <TripDashboard />
    </AuthGuard>
  );
}
