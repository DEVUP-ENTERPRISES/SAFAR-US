'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MapPin, KeyRound, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { vehicleApi } from '@/features/vehicles/api';

/**
 * Where the car actually is, and how to get into it.
 *
 * A map pin is street level; the car is on P3 in bay 44. Every host explains
 * this by message, to every guest, every time — so it is stored once here and
 * shown automatically when the guest is on their way.
 *
 * The access code is treated differently from the other two because it is the
 * only field that opens something. It is released to the guest only after they
 * tap "on my way", and never to anyone else — a code sent at booking time has
 * been sitting in an inbox for a week by the time it is used.
 */
export function PickupEditor({
  vehicleId,
  initial,
  onSaved,
}: {
  vehicleId: string;
  initial?: { instructions?: string; spotPhotoUrl?: string; accessCode?: string } | null;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [accessCode, setAccessCode] = useState(initial?.accessCode ?? '');
  const [spotPhotoUrl, setSpotPhotoUrl] = useState(initial?.spotPhotoUrl ?? '');

  const save = useMutation({
    mutationFn: () =>
      vehicleApi.update(vehicleId, {
        pickup: {
          // Empty strings clear the field rather than saving a blank.
          ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
          ...(accessCode.trim() ? { accessCode: accessCode.trim() } : {}),
          ...(spotPhotoUrl.trim() ? { spotPhotoUrl: spotPhotoUrl.trim() } : {}),
        },
      }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Pickup details saved' });
      onSaved?.();
    },
    onError: () => toast({ tone: 'error', title: 'Could not save those details' }),
  });

  const dirty =
    instructions !== (initial?.instructions ?? '') ||
    accessCode !== (initial?.accessCode ?? '') ||
    spotPhotoUrl !== (initial?.spotPhotoUrl ?? '');

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <MapPin className="h-4 w-4 text-primary" /> Finding the car
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Shown to your guest once they are on their way. This is what stops the
            &ldquo;I&apos;m here, where exactly?&rdquo; message.
          </p>
        </div>

        <Field label="Where it is parked" hint="Level, bay, entrance, which side of the street">
          <Textarea
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Level 3 of the Main St garage, bay 44, blue section. Lift on the north side."
          />
        </Field>

        <Field label="Photo of the spot" hint="Optional, and worth more than the description">
          <Input
            value={spotPhotoUrl}
            onChange={(e) => setSpotPhotoUrl(e.target.value)}
            placeholder="https://…"
          />
        </Field>

        <Field
          label="Gate or lockbox code"
          hint="Only your guest sees this, and only after they set off"
        >
          <Input value={accessCode} onChange={(e) => setAccessCode(e.target.value)} placeholder="4417" />
        </Field>

        {accessCode.trim() && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
            Held back until your guest taps &ldquo;on my way&rdquo;, so it is not sitting in their inbox for a week.
          </p>
        )}

        <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
          <KeyRound className="h-4 w-4" /> Save pickup details
        </Button>
      </CardContent>
    </Card>
  );
}
