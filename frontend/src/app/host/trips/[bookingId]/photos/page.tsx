'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/ui/states';
import { SectionLabel } from '@/components/ui/rows';
import { ApiError } from '@/lib/api/types';
import { hostApi } from '@/features/host/api';
import { hostTripsApi } from '@/features/host/trips.api';

/**
 * Condition photos. `pre` (check-in) proves the car's state at handover and is
 * what qualifies the host for their protection plan; `post` (checkout) is the
 * evidence for any damage claim. Bytes go straight to S3 via a presigned PUT —
 * they never pass through the API.
 */
export default function TripPhotosPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<'pre' | 'post'>('pre');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: t, isLoading, isError } = useQuery({
    queryKey: ['host-trip', bookingId],
    queryFn: () => hostTripsApi.one(bookingId),
  });

  const attach = useMutation({
    mutationFn: (photos: { url: string; key?: string }[]) =>
      hostTripsApi.addPhotos(t!.tripId!, phase, photos),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['host-trip', bookingId] }),
  });

  const onPick = async (files: FileList | null) => {
    if (!files?.length || !t?.tripId) return;
    setBusy(true);
    setError(null);
    try {
      // 1. Ask the API for presigned S3 PUT targets.
      const targets = await hostApi.uploadUrls('trip_photo', files.length, files[0].type || 'image/jpeg');

      // 2. Upload the bytes directly to S3 — large files never touch our API.
      await Promise.all(
        Array.from(files).map((file, i) =>
          fetch(targets[i].uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type || 'image/jpeg' },
          }).then((r) => {
            if (!r.ok) throw new Error(`Upload failed (${r.status})`);
          }),
        ),
      );

      // 3. Record the public URLs against the trip.
      await attach.mutateAsync(targets.map((x) => ({ url: x.publicUrl, key: x.key })));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (isError || !t) return <ErrorState message="Trip not found." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push(`/host/trips/${bookingId}`)}
          className="rounded-lg p-1.5 transition-colors hover:bg-accent"
          aria-label="Back to trip"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold leading-tight">Trip photos</h1>
          <p className="text-sm text-muted-foreground">
            {t.vehicle.make} {t.vehicle.model} · {t.photoCount} photo{t.photoCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Phase toggle */}
      <div className="flex gap-2">
        {(['pre', 'post'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPhase(p)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              phase === p
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card hover:border-primary/40'
            }`}
          >
            {p === 'pre' ? 'Pre-trip (check-in)' : 'Post-trip (checkout)'}
          </button>
        ))}
      </div>

      {!t.tripId && (
        <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          The trip hasn&apos;t started yet — photos can be added once the guest begins it.
        </p>
      )}

      {/* Uploader */}
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border py-14 text-center transition-colors hover:border-primary/50 ${
          !t.tripId ? 'pointer-events-none opacity-50' : ''
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onPick(e.target.files)}
        />
        {busy ? (
          <>
            <Upload className="h-8 w-8 animate-pulse text-primary" />
            <p className="text-sm font-medium">Uploading to S3…</p>
          </>
        ) : (
          <>
            <Camera className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Add {phase === 'pre' ? 'pre-trip' : 'post-trip'} photos</p>
              <p className="text-sm text-muted-foreground">Tap to choose — you can pick several at once.</p>
            </div>
          </>
        )}
      </label>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <SectionLabel>Uploaded</SectionLabel>
      {t.photoCount === 0 ? (
        <EmptyState
          icon={<Camera className="h-10 w-10" />}
          title="No photos yet"
          description="Pre-trip photos are what qualify you for your protection plan."
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t.photoCount} photo{t.photoCount === 1 ? '' : 's'} recorded on this trip.
        </p>
      )}

      <Button variant="outline" className="w-full" onClick={() => router.push(`/host/trips/${bookingId}`)}>
        Done
      </Button>
    </div>
  );
}
