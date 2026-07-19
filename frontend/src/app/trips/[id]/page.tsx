'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { MapPin, Gauge, Fuel, ShieldAlert, CheckCircle2, Camera, KeyRound, Leaf, TreePine } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils/format';
import { tripApi } from '@/features/trips/api';
import { useTrip, useCheckIn, useCompleteTrip, useSos } from '@/features/trips/hooks';
import { ChatPanel } from '@/features/messaging/chat-panel';

function TripDashboard() {
  const { id } = useParams<{ id: string }>();
  const { data: trip, isLoading, isError, refetch } = useTrip(id);
  const checkIn = useCheckIn(id);
  const complete = useCompleteTrip(id);
  const sos = useSos(id);
  const [damage, setDamage] = useState('');

  if (isLoading) return <Skeleton className="h-[70vh] w-full" />;
  if (isError || !trip) return <ErrorState message="Trip not found." retry={() => refetch()} />;

  const loc = trip.liveLocation;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="display text-display-sm">Your trip</h1>
            <p className="text-sm text-muted-foreground">Started {formatDate(trip.handover.at)}</p>
          </div>
          <Badge tone={trip.status === 'active' ? 'default' : trip.status === 'completed' ? 'success' : 'destructive'}>
            {trip.status}
          </Badge>
        </div>

        {/* Live status */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Live status</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric icon={<KeyRound className="h-4 w-4" />} label="Check-in" value={trip.checkin ? trip.checkin.method : 'Pending'} />
            <Metric icon={<Gauge className="h-4 w-4" />} label="Distance" value={`${trip.distanceKm} km`} />
            <Metric icon={<Fuel className="h-4 w-4" />} label="Fuel start" value={trip.handover.fuelStart != null ? `${trip.handover.fuelStart}%` : '—'} />
            <Metric icon={<MapPin className="h-4 w-4" />} label="Location" value={loc ? `${loc.coordinates[1].toFixed(3)}, ${loc.coordinates[0].toFixed(3)}` : 'No signal'} />
          </CardContent>
        </Card>

        {/* Carbon footprint + EV savings */}
        {trip.carbon && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Leaf className="h-5 w-5 text-success" /> Trip sustainability</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric icon={<Fuel className="h-4 w-4" />} label="CO₂ emitted" value={`${trip.carbon.emittedKg} kg`} />
              <Metric icon={<Leaf className="h-4 w-4" />} label="CO₂ saved vs gas" value={`${trip.carbon.savedKg} kg`} />
              <Metric icon={<TreePine className="h-4 w-4" />} label="≈ trees / yr" value={`${trip.carbon.treesEquivalent}`} />
              <Metric icon={<Gauge className="h-4 w-4" />} label="Distance" value={`${trip.carbon.distanceKm} km`} />
            </CardContent>
          </Card>
        )}

        {/* Map placeholder with live coords */}
        <Card>
          <CardContent className="p-0">
            <div className="relative flex aspect-[16/7] items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-primary/10 to-accent">
              <div className="text-center">
                <MapPin className="mx-auto h-8 w-8 text-primary" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {loc ? `Live location · updated ${new Date(loc.updatedAt).toLocaleTimeString()}` : 'Waiting for live location…'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        {trip.status === 'active' && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Trip actions</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {!trip.checkin && (
                <Button variant="outline" loading={checkIn.isPending} onClick={() => checkIn.mutate()}>
                  <KeyRound className="h-4 w-4" /> Contactless check-in
                </Button>
              )}
              <Button loading={complete.isPending} onClick={() => complete.mutate()}>
                <CheckCircle2 className="h-4 w-4" /> Complete trip
              </Button>
              <Button variant="destructive" loading={sos.isPending} onClick={() => sos.mutate()}>
                <ShieldAlert className="h-4 w-4" /> Emergency SOS
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Damage reporting */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Report damage</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={damage} onChange={(e) => setDamage(e.target.value)} placeholder="Describe any damage…" />
              <Button
                variant="outline"
                disabled={!damage.trim()}
                onClick={async () => {
                  await tripApi.reportDamage(id, damage.trim(), []);
                  setDamage('');
                  refetch();
                }}
              >
                <Camera className="h-4 w-4" /> Report
              </Button>
            </div>
            {trip.damageReports.length > 0 && (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {trip.damageReports.map((d, i) => (
                  <li key={i}>• {d.description} — {formatDate(d.at)}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chat */}
      <div>
        <ChatPanel bookingId={trip.bookingId} />
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground"><span className="text-primary">{icon}</span> {label}</p>
      <p className="mt-1 font-medium capitalize">{value}</p>
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
