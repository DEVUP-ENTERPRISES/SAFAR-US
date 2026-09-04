'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/types';
import { api } from '@/lib/api/client';

/**
 * The guest's pickup code.
 *
 * This is the handover itself: the moment a host, standing next to their car,
 * confirms the person in front of them is the person who booked it. The
 * endpoints existed and neither side had a screen, so the check that stops
 * someone collecting a stranger's booking simply did not happen.
 *
 * Issued on demand rather than at booking time. A code that has been sitting in
 * a notification for three days has been screenshotted, forwarded and possibly
 * read over someone's shoulder; one generated at the car has not. Each request
 * replaces the last, so an old screenshot stops working.
 */
export function PickupCode({ bookingId }: { bookingId: string }) {
  const [code, setCode] = useState<string | null>(null);

  const issue = useMutation({
    mutationFn: () => api.post<{ code: string }>(`/bookings/${bookingId}/pickup-code`, {}),
    onSuccess: (r) => setCode(r.code),
  });

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="py-5">
        <p className="flex items-center gap-2 font-semibold">
          <KeyRound className="h-5 w-5 text-primary" /> Your pickup code
        </p>

        {code ? (
          <>
            {/* Large, spaced, monospace — this is read aloud or across a car
                park, not tapped. Ambiguity between 0 and O costs a retry. */}
            <p className="numeric mt-3 text-center font-mono text-5xl font-bold tracking-[0.25em] text-primary">
              {code}
            </p>
            <p className="mt-3 text-center text-sm text-muted-foreground">
              Show this to your host when you collect the car.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full"
              loading={issue.isPending}
              onClick={() => issue.mutate()}
            >
              Get a new code
            </Button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate this when you are at the car. Your host checks it before handing over the keys.
            </p>
            <Button className="mt-3 w-full" loading={issue.isPending} onClick={() => issue.mutate()}>
              Show my code
            </Button>
          </>
        )}

        {issue.isError && (
          <p className="mt-2 text-sm text-destructive">
            {issue.error instanceof ApiError ? issue.error.message : 'Could not get a code'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The host's side of the same moment.
 *
 * Deliberately not a scanner. A host is outdoors, possibly in the dark, holding
 * keys — six digits typed is more reliable than a camera trying to focus on
 * another phone's screen in sunlight.
 */
export function VerifyPickup({ tripId, onVerified }: { tripId: string; onVerified?: () => void }) {
  const [code, setCode] = useState('');
  const [ok, setOk] = useState(false);

  const verify = useMutation({
    mutationFn: () => api.post<{ verified: boolean }>(`/trips/${tripId}/verify-pickup`, { code }),
    onSuccess: () => { setOk(true); onVerified?.(); },
  });

  if (ok) {
    return (
      <Card className="border-success/40 bg-success/5">
        <CardContent className="flex items-center gap-3 py-4">
          <ShieldCheck className="h-5 w-5 shrink-0 text-success" />
          <p className="text-sm font-medium">Guest verified — you can hand over the keys.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-5">
        <p className="flex items-center gap-2 font-semibold">
          <KeyRound className="h-5 w-5 text-primary" /> Check your guest&apos;s code
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask them to show the six-digit code in their app. This confirms you are handing the car to the right
          person.
        </p>

        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          aria-label="Pickup code"
          className="mt-4 w-full rounded-xl border border-input/60 bg-muted/30 py-4 text-center font-mono text-3xl tracking-[0.25em] outline-none focus-visible:border-primary/50 focus-visible:ring-[4px] focus-visible:ring-primary/10"
        />

        <Button
          className="mt-3 w-full"
          disabled={code.length !== 6}
          loading={verify.isPending}
          onClick={() => verify.mutate()}
        >
          Verify
        </Button>

        {verify.isError && (
          <p className="mt-2 text-sm text-destructive">
            {/* Wrong code is the common case and is not an error state to
                panic about — a guest reads a digit wrong constantly. */}
            {verify.error instanceof ApiError ? verify.error.message : 'That code did not match. Ask them to read it again.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
