'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Check, Clock, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { formatDateTime } from '@/lib/utils/format';
import { uploadFiles } from '@/features/media/upload';
import { tripApi, type InspectionAngle, type PhotoPhase } from '@/features/trips/api';
import { useInspection } from '@/features/trips/hooks';
import { LiveCamera, type CapturedShot } from './live-camera';
import { ShotDiagram, ShotLegend } from './shot-diagram';

const GROUPS = [
  { id: 'walkaround', title: 'Walk-around' },
  { id: 'outside', title: 'Outside details' },
  { id: 'inside', title: 'Inside' },
  { id: 'id', title: 'ID & existing damage' },
] as const;

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

  const angles = state?.angles ?? [];
  const win = state?.[phase];
  const taken = useMemo(() => (state?.photos ?? []).filter((p) => p.phase === phase), [state?.photos, phase]);
  const shotsOf = (id: string) => taken.filter((p) => p.angle === id);
  const needOf = (a: InspectionAngle) => a.shots ?? 1;
  const nextAngle = angles.find((a) => needOf(a) > 0 && shotsOf(a.id).length < needOf(a))?.id ?? null;
  const canShoot = !!win?.open && taken.length < win.max;

  useEffect(() => {
    if (openSignal > handled.current && canShoot && nextAngle) {
      handled.current = openSignal;
      setAngleId(nextAngle);
    }
  }, [openSignal, canShoot, nextAngle]);

  if (isLoading || !state || !win) return <Skeleton className="h-40 w-full rounded-2xl" />;

  const angle = angles.find((a) => a.id === angleId);
  // Photos under an angle this guide no longer lists (from an older app version) stay visible.
  const others = taken.filter((p) => !angles.some((a) => a.id === p.angle));
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
        <p className="text-sm text-muted-foreground">
          {angles.length} shots, about five minutes. Start at the front and walk counterclockwise so nothing gets skipped.
        </p>
        <p className="text-xs text-muted-foreground">
          {phase === 'pre' ? 'Take them before you drive off.' : 'Take them as you return the car.'} Photos are taken live, stamped with the time and place, and can’t be changed afterwards.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {status && (
          <p className="flex items-center gap-2 rounded-lg bg-muted/60 p-2.5 text-xs font-medium text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" /> {status}
          </p>
        )}

        <ShotLegend />

        {GROUPS.map((g) => {
          const cards = angles.filter((a) => (a.group ?? 'walkaround') === g.id);
          if (!cards.length) return null;
          return (
            <section key={g.id} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-bold">{g.title}</h3>
                <span className="text-xs text-muted-foreground">
                  {cards.length} shots{g.id === 'walkaround' ? ', counterclockwise' : ''}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {cards.map((a) => {
                  const number = angles.indexOf(a) + 1;
                  const shots = shotsOf(a.id);
                  const need = needOf(a);
                  const done = need > 0 && shots.length >= need;
                  const canAdd = canShoot && (need === 0 || shots.length < need);
                  const cover = done ? shots[0] : undefined;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={!canAdd}
                      onClick={() => setAngleId(a.id)}
                      className={cn(
                        'flex flex-col rounded-2xl border bg-card p-3 text-left transition-colors',
                        done ? 'border-success/50' : 'border-border',
                        canAdd ? 'hover:border-primary/50' : 'cursor-default',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <Camera className="h-4 w-4 text-muted-foreground" />
                        <span
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold',
                            done ? 'bg-success text-white' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {done ? <Check className="h-3.5 w-3.5" /> : number}
                        </span>
                      </div>
                      <div className="relative my-2 aspect-[4/3] overflow-hidden rounded-lg">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cover.url} alt={a.label} className="h-full w-full object-cover" />
                        ) : (
                          <ShotDiagram angle={a.id} className="h-full w-full text-muted-foreground" />
                        )}
                        {(need !== 1 && shots.length > 0) && (
                          <span className="absolute bottom-1.5 end-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
                            {need > 0 ? `${shots.length} of ${need}` : `${shots.length} taken`}
                          </span>
                        )}
                      </div>
                      <span className="text-[15px] font-bold leading-snug">{a.label}</span>
                      {a.hint && <span className="mt-0.5 text-xs leading-snug text-muted-foreground">{a.hint}</span>}
                      {cover && <span className="mt-1 text-[11px] font-semibold text-success">{cover.role === 'host' ? 'Host' : 'Guest'} photo</span>}
                      {need === 0 && !shots.length && <span className="mt-1 text-[11px] font-semibold text-muted-foreground">Only if the car has marks</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {others.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {others.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.url} src={p.url} alt="Condition photo" className="aspect-square w-full rounded-lg object-cover" />
            ))}
          </div>
        )}

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Left and right are as if you were sitting in the driver’s seat. Card numbers match the shooting order.</p>
          <Link href="/help/photo-guide" target="_blank" className="inline-flex font-semibold text-primary hover:underline">
            Why each shot matters
          </Link>
        </div>

        {canShoot && nextAngle && (
          <Button className="w-full" onClick={() => setAngleId(nextAngle)}>
            <Camera className="h-4 w-4" /> Take photo {angles.findIndex((a) => a.id === nextAngle) + 1}: {angles.find((a) => a.id === nextAngle)?.label}
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
          guide={angle.id}
          tip={angle.hint}
          requireLocation={state.requireLocation}
          onUse={onUse}
          onClose={() => setAngleId(null)}
        />
      )}
    </Card>
  );
}
