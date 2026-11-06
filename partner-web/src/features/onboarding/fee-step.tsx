'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Clock, CreditCard, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { assetPartnerApi } from '@/features/asset-partners/api';
import { ApiError } from '@/lib/api/types';

const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** The one-time Asset Partner fee, paid on Stripe's own page between the ID check and signing. */
export function FeeStep({ amountCents, onPaid }: { amountCents: number; onPaid: () => void }) {
  const [back, setBack] = useState<string | null>(null);
  useEffect(() => setBack(new URLSearchParams(window.location.search).get('fee')), []);
  const [problem, setProblem] = useState<string>();

  // Back from Stripe: the server asks Stripe on every load, so a few quick checks move the partner on.
  useEffect(() => {
    if (back !== 'paid') return;
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      onPaid();
      if (n >= 10) {
        clearInterval(t);
        // Pressing Pay asks Stripe first, so a payment that landed late is never taken twice.
        setBack(null);
      }
    }, 3_000);
    return () => clearInterval(t);
  }, [back, onPaid]);

  const pay = useMutation({
    meta: { silentError: true },
    mutationFn: () => assetPartnerApi.joiningFeeCheckout(),
    onSuccess: (r) => {
      if (r.paid) onPaid();
      else if (r.url) window.location.assign(r.url);
      else setProblem('We couldn’t open the payment page. Please try again.');
    },
    onError: (e) => setProblem(e instanceof ApiError ? e.message : 'We couldn’t open the payment page. Please try again.'),
  });

  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><CreditCard className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold">Asset Partner fee</h2>
            <p className="text-sm text-muted-foreground">A one-time fee to join. It covers every car you place with CatoDrive, now and later.</p>
          </div>
        </div>

        <div className="flex items-baseline justify-between rounded-lg bg-subtle p-4">
          <span className="text-sm text-muted-foreground">To pay once</span>
          <span className="text-2xl font-bold tabular-nums">{money(amountCents)}</span>
        </div>

        {back === 'paid' ? (
          <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4 text-sm" role="status">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p>Confirming your payment with Stripe. This page moves on by itself in a few seconds.</p>
          </div>
        ) : (
          <>
            {back === 'cancelled' && <p role="status" className="rounded-lg bg-warning/10 p-3 text-sm">The payment wasn’t completed and nothing was charged. You can try again.</p>}
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-success" /> Card, Apple Pay or Google Pay on Stripe’s secure page.</li>
              <li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-success" /> We email you a receipt, then you sign your agreement.</li>
            </ul>
            <Button className="w-full sm:w-auto" loading={pay.isPending} onClick={() => pay.mutate()}>Pay {money(amountCents)}</Button>
          </>
        )}

        {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Card details go to Stripe only; CatoDrive never sees them.</p>
      </CardContent>
    </Card>
  );
}
