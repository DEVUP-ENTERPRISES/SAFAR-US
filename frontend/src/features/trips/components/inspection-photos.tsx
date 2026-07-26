'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, Loader2, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';
import { uploadFiles } from '@/features/media/upload';
import { tripApi, type Trip } from '@/features/trips/api';

/**
 * The eight angles that make a complete condition record. This is guidance —
 * the labels tell a guest what to shoot — but every tile takes a REAL photo:
 * it opens the camera/file picker, uploads the actual bytes to storage, and
 * attaches the returned URL to the trip.
 *
 * This is the honest version of a component that previously faked completion by
 * dropping stock photos of random cars into the grid and then filing a damage
 * report with those stock URLs. These photos are the baseline a damage claim
 * and a deposit capture are judged against, so they cannot be theatre.
 */
const ANGLES = [
  { id: 'front', label: 'Front' },
  { id: 'front_left', label: 'Front left' },
  { id: 'driver_side', label: 'Driver side' },
  { id: 'rear_left', label: 'Rear left' },
  { id: 'rear', label: 'Rear' },
  { id: 'passenger_side', label: 'Passenger side' },
  { id: 'interior', label: 'Interior' },
  { id: 'dashboard', label: 'Dash & fuel' },
];

export function InspectionPhotos({
  trip,
  phase,
  editable,
}: {
  trip: Trip;
  /** 'pre' at pickup, 'post' at return. */
  phase: 'pre' | 'post';
  /** Off once the trip is finished — the record is then read-only evidence. */
  editable: boolean;
}) {
  const qc = useQueryClient();
  const notify = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);

  // Photos already attached for this phase, in upload order — the tiles fill
  // left to right, so the grid always reflects real, stored images.
  const taken = useMemo(
    () => (trip.photos ?? []).filter((p) => p.phase === phase),
    [trip.photos, phase],
  );

  const attach = useMutation({
    mutationFn: (photos: { url: string; key: string }[]) => tripApi.addPhotos(trip._id, phase, photos),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trip', trip._id] }),
  });

  const onPick = async (files: FileList | null, slot: number) => {
    const file = files?.[0];
    if (!file) return;
    setBusySlot(slot);
    try {
      const [uploaded] = await uploadFiles('trip_photo', [file]);
      await attach.mutateAsync([uploaded]);
    } catch (err) {
      notify({
        tone: 'error',
        title: 'Photo upload failed',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setBusySlot(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const done = taken.length;
  const complete = done >= ANGLES.length;
  const title = phase === 'pre' ? 'Pickup inspection' : 'Return inspection';

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
              complete ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary',
            )}
          >
            {done} / {ANGLES.length}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {phase === 'pre'
            ? 'Photograph the car before you drive off. These are the record any damage is judged against — take them even if the car looks perfect.'
            : 'Photograph the car as you return it, so its condition at drop-off is on record.'}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ANGLES.map((angle, i) => {
            const photo = taken[i];
            const busy = busySlot === i;
            return (
              <label
                key={angle.id}
                className={cn(
                  'group relative flex aspect-[4/3] cursor-pointer flex-col justify-between overflow-hidden rounded-xl border p-2.5 transition-colors',
                  photo
                    ? 'border-success/50 bg-success/5'
                    : 'border-dashed border-border bg-muted/20 hover:border-primary/50',
                  (!editable || busy) && 'pointer-events-none',
                )}
              >
                {editable && (
                  <input
                    ref={i === done ? inputRef : undefined}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => onPick(e.target.files, i)}
                  />
                )}

                {photo ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={angle.label} className="absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                    <span className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-success text-white">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="relative z-10 truncate text-[11px] font-bold text-white">{angle.label}</span>
                  </>
                ) : (
                  <>
                    <span className="text-muted-foreground group-hover:text-primary">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground group-hover:text-foreground">
                      {busy ? 'Uploading…' : angle.label}
                    </span>
                  </>
                )}
              </label>
            );
          })}
        </div>

        {complete && (
          <p className="mt-3 rounded-lg bg-success/10 p-2.5 text-xs font-semibold text-success">
            ✓ All {ANGLES.length} angles recorded. This is your condition record for the trip.
          </p>
        )}
        {!editable && done === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">No {phase === 'pre' ? 'pickup' : 'return'} photos were taken.</p>
        )}
      </CardContent>
    </Card>
  );
}
