'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ShieldAlert, Camera, Loader2, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';
import { tripApi } from '@/features/trips/api';
import { claimsApi } from '@/features/claims/api';
import { uploadFiles } from '@/features/media/upload';

/**
 * A host files a damage claim on a finished trip.
 *
 * This closes the loop on the inspection photos: the return ('post') photos are
 * the baseline, so they are pulled in as evidence automatically, and the host
 * adds close-ups of the specific damage. The claim then goes to the ops queue,
 * where an operator assesses it and — if upheld — captures the amount from the
 * security deposit already held for the trip.
 *
 * The host cannot touch the deposit directly: they file with evidence, a human
 * decides. That separation is the whole point of a claims process.
 */
export function FileDamageClaim({
  bookingId,
  tripId,
  currency = 'USD',
}: {
  bookingId: string;
  tripId: string;
  currency?: string;
}) {
  const confirm = useConfirm();
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [closeups, setCloseups] = useState<{ url: string; key: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  // The return photos are the evidence baseline. Fetched once the host opens
  // the form, and pre-selected so a claim is never filed with no record.
  const trip = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => tripApi.get(tripId),
    enabled: open && !!tripId,
  });
  const returnPhotos = (trip.data?.photos ?? []).filter((p) => p.phase === 'post');
  const [useReturnPhotos, setUseReturnPhotos] = useState(true);

  useEffect(() => {
    if (!open) {
      setDescription('');
      setAmount('');
      setCloseups([]);
    }
  }, [open]);

  const addCloseups = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded = await uploadFiles('trip_photo', Array.from(files));
      setCloseups((prev) => [...prev, ...uploaded]);
    } catch (err) {
      notify({ tone: 'error', title: 'Upload failed', description: err instanceof Error ? err.message : '' });
    } finally {
      setUploading(false);
    }
  };

  const submit = useMutation({
    mutationFn: () => {
      const evidence = [
        ...(useReturnPhotos ? returnPhotos.map((p) => ({ url: p.url, kind: 'image' as const })) : []),
        ...closeups.map((c) => ({ url: c.url, kind: 'image' as const })),
      ];
      return claimsApi.create({
        type: 'damage',
        bookingId,
        tripId,
        description: description.trim(),
        amountClaimed: amount ? Math.round(Number(amount) * 100) : undefined,
        evidence,
      });
    },
    onSuccess: () => {
      notify({ tone: 'success', title: 'Claim filed', description: 'Our team will review it and be in touch.' });
      setOpen(false);
    },
  });

  const evidenceCount = (useReturnPhotos ? returnPhotos.length : 0) + closeups.length;

  const doSubmit = async () => {
    const { ok } = await confirm({
      title: 'File this damage claim?',
      description:
        'Our team reviews the evidence and, if the claim is upheld, charges the assessed amount to the guest’s security deposit. False claims can affect your account.',
      confirmLabel: 'File claim',
    });
    if (ok) submit.mutate();
  };

  if (submit.isSuccess) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 pt-6">
          <span className="flex items-center gap-2 text-sm font-semibold text-success">
            <Check className="h-5 w-5" /> Damage claim filed
          </span>
          <Link href="/claims" className="text-sm font-semibold text-primary hover:underline">
            Track it
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={open ? 'border-destructive/30' : undefined}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-5 w-5 text-destructive" /> Report damage
          </CardTitle>
          {!open && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              File a claim
            </Button>
          )}
        </div>
        {!open && (
          <p className="text-xs text-muted-foreground">
            Found damage after this trip? File a claim against the guest’s security deposit.
          </p>
        )}
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">What’s the damage?</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="e.g. Deep scratch on the rear passenger door, not present at pickup."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Estimated repair cost ({currency})
            </label>
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 350"
            />
          </div>

          {/* Return photos as evidence */}
          {trip.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading the trip’s return photos…</p>
          ) : returnPhotos.length > 0 ? (
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={useReturnPhotos}
                onChange={(e) => setUseReturnPhotos(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
              />
              <span>
                Include the {returnPhotos.length} return inspection photo{returnPhotos.length === 1 ? '' : 's'} as evidence
                <span className="block text-muted-foreground">These are the record of the car’s condition at drop-off.</span>
              </span>
            </label>
          ) : (
            <p className="text-xs text-warning">
              No return inspection photos were taken — add close-ups of the damage below to support your claim.
            </p>
          )}

          {/* Damage close-ups */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/50">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => { addCloseups(e.target.files); e.target.value = ''; }}
                />
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {uploading ? 'Uploading…' : 'Add damage close-ups'}
              </label>
              {closeups.length > 0 && (
                <span className="text-xs text-muted-foreground">{closeups.length} added</span>
              )}
            </div>
            {closeups.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {closeups.map((c) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={c.key} src={c.url} alt="" className="h-16 w-16 rounded-lg border border-border object-cover" />
                ))}
              </div>
            )}
          </div>

          <div className={cn('flex items-center gap-3')}>
            <Button
              disabled={description.trim().length < 5 || evidenceCount === 0}
              loading={submit.isPending}
              onClick={doSubmit}
            >
              File claim
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            {evidenceCount === 0 && !trip.isLoading && (
              <span className="text-xs text-muted-foreground">Add at least one photo as evidence.</span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
