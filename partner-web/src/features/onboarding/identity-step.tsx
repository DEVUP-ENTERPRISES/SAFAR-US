'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Clock, IdCard, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { kycApi } from '@/features/kyc/api';
import { kycReasonLabel } from '@/features/kyc/copy';
import { openIdentityModal } from '@/features/kyc/stripe-identity';
import { useStripePublishableKey } from '@/features/payments/stripe-key';
import type { IdentityState } from '@/features/asset-partners/api';
import { ApiError } from '@/lib/api/types';

const isDev = process.env.NODE_ENV !== 'production';

/** Stripe Identity for partners: the same document and selfie check guests do, before the agreement opens. */
export function IdentityStep({ state, reason, onChange }: { state: IdentityState; reason?: string; onChange: () => void }) {
  const { key: stripeKey } = useStripePublishableKey();
  const [devSession, setDevSession] = useState(false);
  const [problem, setProblem] = useState<string>();

  // Stripe usually decides within a minute; check again while the partner waits on this screen.
  useEffect(() => {
    if (state !== 'pending') return;
    const t = setInterval(onChange, 10_000);
    return () => clearInterval(t);
  }, [state, onChange]);

  const start = useMutation({
    meta: { silentError: true },
    mutationFn: async () => {
      setProblem(undefined);
      const session = await kycApi.startVerification();
      if (session.clientSecret && stripeKey) return { outcome: await openIdentityModal(session.clientSecret) } as const;
      if (session.url && session.url !== 'about:blank') {
        window.location.assign(session.url);
        return { outcome: 'redirect' } as const;
      }
      return { outcome: 'stub' } as const;
    },
    onSuccess: (r) => {
      if (r.outcome === 'completed') onChange();
      else if (r.outcome === 'stub') {
        if (isDev) setDevSession(true);
        else setProblem('The ID check isn’t available right now. Please try again in a few minutes, or call us and we’ll check your ID in person.');
      }
    },
    onError: (e) => setProblem(e instanceof ApiError ? e.message : 'We couldn’t open the ID check. Please try again.'),
  });

  const decide = useMutation({ mutationFn: (d: 'verified' | 'rejected') => kycApi.devDecide(d, d === 'rejected' ? 'documents_unreadable' : undefined), onSuccess: onChange });

  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><IdCard className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold">Verify your ID</h2>
            <p className="text-sm text-muted-foreground">Take a photo of your driver’s licence or passport and a quick selfie. Stripe checks it in about a minute. We use it to confirm who is signing your agreement.</p>
          </div>
        </div>

        {state === 'pending' ? (
          <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4 text-sm" role="status">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p>Stripe is checking your ID. This page moves on by itself when it’s done. You can also close it and come back later.</p>
          </div>
        ) : (
          <>
            {state === 'rejected' && (
              <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                That check didn’t pass{reason ? `: ${kycReasonLabel(reason)}` : ''}. Try again in good light with the whole ID in the frame.
              </p>
            )}
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-success" /> Your ID photos stay with Stripe. We only receive your verified name.</li>
              <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-success" /> Use the same name you applied with.</li>
            </ul>
            <Button className="w-full sm:w-auto" loading={start.isPending} onClick={() => start.mutate()}>{state === 'rejected' ? 'Try again' : 'Start ID check'}</Button>
          </>
        )}

        {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
        {devSession && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-warning p-3 text-sm">
            <span className="text-warning">Test server only:</span>
            <Button size="sm" variant="outline" loading={decide.isPending} onClick={() => decide.mutate('verified')}>Pass the check</Button>
            <Button size="sm" variant="ghost" onClick={() => decide.mutate('rejected')}>Fail the check</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
