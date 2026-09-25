'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Check, Clock, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { formatDateTime } from '@/lib/utils/format';
import { uploadFiles } from '@/features/media/upload';
import { tripApi, type PhotoPhase } from '@/features/trips/api';
import { useInspection } from '@/features/trips/hooks';
import { LiveCamera, type CapturedShot } from './live-camera';

/**
 * Condition photos for one phase, for guest and host alike. Every photo comes
 * from the in-app camera (no file picker), is stamped at capture, and is
 * read-only once uploaded. The server decides when the window is open and how
 * many photos are needed; this only shows it. Keyed by booking, so pickup
 * photos work before the trip has started.
 */
export function InspectionPhotos({
  bookingId,
  phase,
  openSignal = 0,
}: {
  bookingId: string;
  phase: PhotoPhase;
  /** Bumping this opens the camera (used by the return-photo banner and ?capture=post). */
  openSignal?: number;
}) {
  const qc = useQueryClient();
  const { data: state, isLoading } = useInspection(bookingId);
  const [angleId, setAngleId] = useState<string | null>(null);
  const handled = useRef(0);

  const win = state?.[phase];
  const taken = useMemo(() => (state?.photos ?? []).filter((p) => p.phase === phase), [state?.photos, phase]);
  const nextAngle = state?.angles.find((a) => !taken.some((p) => p.angle === a.id))?.id ?? state?.angles[0]?.id ?? null;
  const canShoot = !!win?.open && taken.length < win.max;

  useEffect(() => {
    if (openSignal > handled.current && canShoot && nextAngle) {
      handled.current = openSignal;
      setAngleId(nextAngle);
    }
  }, [openSignal, canShoot, nextAngle]);

  if (isLoading || !state || !win) return <Skeleton className="h-40 w-full rounded-2xl" />;

  const angle = state.angles.find((a) => a.id === angleId);
  const title = phase === 'pre' ? 'Pickup photos' : 'Return photos';
  const enough = taken.length >= win.required;

  const onUse = async (shot: CapturedShot) => {
    if (!angle) return;
    const [uploaded] = await uploadFiles('trip_photo', [new File([shot.blob], 'condition.jpg', { type: 'image/jpeg' })]);
    await tripApi.addPhotos(bookingId, phase, [
      {
        url: uploaded.url,
        key: uploaded.key,
        angle: angle.id,
        lat: shot.lat,
        lng: shot.lng,
        accuracyM: shot.accuracyM,
        capturedAtClient: shot.capturedAt.toISOString(),
        sha256: shot.sha256,
      },
    ]);
    setAngleId(null);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['inspection', bookingId] }),
      qc.invalidateQueries({ queryKey: ['trip'] }),
      qc.invalidateQueries({ queryKey: ['host-trip'] }),
    ]);
  };

  const status = win.open
    ? win.closesAt && phase === 'pre' && state.tripId
      ? `Open until ${formatDateTime(win.closesAt)}.`
      : null
    : win.reason === 'not_yet'
      ? `Photos open ${formatDateTime(win.opensAt)}.`
      : win.reason === 'no_trip'
        ? 'Return photos open once the trip has started.'
        : 'This photo window is closed.';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" /> {title}
          </CardTitle>
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-bold',
              enough ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary',
            )}
          >
            {taken.length}
            {win.required > 0 ? ` / ${win.required} needed` : ''}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {phase === 'pre'
            ? 'Photograph the car from every side before you drive off. Photos are taken live with the camera, stamped with the time and place, and cannot be changed afterwards.'
            : 'Photograph the car as you return it, so its condition at drop-off is on record. Photos are taken live with the camera and cannot be changed afterwards.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {status && (
          <p className="flex items-center gap-2 rounded-lg bg-muted/60 p-2.5 text-xs font-medium text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" /> {status}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {state.angles.map((a) => {
            const photo = taken.find((p) => p.angle === a.id);
            return (
              <button
                key={a.id}
                type="button"
                disabled={!canShoot}
                onClick={() => setAngleId(a.id)}
                className={cn(
                  'relative flex aspect-[4/3] flex-col justify-between overflow-hidden rounded-xl border p-2.5 text-left transition-colors',
                  photo ? 'border-success/50 bg-success/5' : 'border-dashed border-border bg-muted/20',
                  canShoot ? 'hover:border-primary/50' : 'cursor-default',
                )}
              >
                {photo ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={a.label} className="absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                    <span className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-success text-white">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="relative z-10 truncate text-[11px] font-bold text-white">
                      {a.label} · {photo.role === 'host' ? 'Host' : 'Guest'}
                    </span>
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4 text-muted-foreground" />
                    <span className="text-[11px] font-semibold text-muted-foreground">{a.label}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {canShoot && nextAngle && (
          <Button className="w-full" onClick={() => setAngleId(nextAngle)}>
            <Camera className="h-4 w-4" /> Take {phase === 'pre' ? 'pickup' : 'return'} photo
          </Button>
        )}
        {!win.open && taken.length === 0 && win.reason === 'closed' && (
          <p className="text-xs text-muted-foreground">No {phase === 'pre' ? 'pickup' : 'return'} photos were taken.</p>
        )}
      </CardContent>

      {angle && (
        <LiveCamera
          stamp={{
            code: state.code,
            vehicle: state.vehicleLabel,
            plate: state.plate,
            role: state.role,
            phase,
            angleLabel: angle.label,
          }}
          requireLocation={state.requireLocation}
          onUse={onUse}
          onClose={() => setAngleId(null)}
        />
      )}
    </Card>
  );
}
