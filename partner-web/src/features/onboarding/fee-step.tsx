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
type FeeLine = { key: string; label: string; amountCents: number; regularCents?: number };
type Plan = 'now' | 'later' | 'platform_now';
type FeeOption = { plan: Plan; todayCents: number; fromEarningsCents: number };

const OPTION_TEXT: Record<Plan, (o: FeeOption) => { title: string; detail: string }> = {
  now: (o) => ({ title: `Pay ${money(o.todayCents)} now`, detail: 'Done in one step. Your full earnings are yours from day one.' }),
  later: (o) => ({ title: 'Pay later from your car’s first earnings', detail: `Nothing today. ${money(o.fromEarningsCents)} comes out of your first payouts.` }),
  platform_now: (o) => ({ title: `Pay ${money(o.todayCents)} now, the rest later`, detail: `${money(o.fromEarningsCents)} comes out of your first payouts.` }),
};

export function FeeStep({ fee, onPaid }: { fee: { totalCents: number; lines: FeeLine[]; options?: FeeOption[] }; onPaid: () => void }) {
  const options = fee.options?.length ? fee.options : [{ plan: 'now' as const, todayCents: fee.totalCents, fromEarningsCents: 0 }];
  const [plan, setPlan] = useState<Plan>('now');
  const chosen = options.find((o) => o.plan === plan) ?? options[0];
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
    mutationFn: async () => {
      if (chosen.plan === 'later') {
        await assetPartnerApi.joiningFeeFromEarnings();
        return { paid: true };
      }
      return assetPartnerApi.joiningFeeCheckout(chosen.plan);
    },
    onSuccess: (r: { url?: string; paid: boolean }) => {
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
            <h2 className="text-xl font-bold">Your car, protected and ready</h2>
            <p className="text-sm text-muted-foreground">One payment sets up everything your car needs to start earning.</p>
          </div>
        </div>

        <dl className="space-y-2 rounded-lg bg-subtle p-4 text-sm">
          {(fee.lines ?? []).map((l) => (
            <div key={l.key} className="flex items-start justify-between gap-4">
              <dt className="min-w-0">
                <span className="font-medium">{l.label}</span>
                {l.key === 'gps' && <span className="block text-xs text-muted-foreground">Live tracking for your car’s safety and protection</span>}
                {l.regularCents && <span className="mt-1 inline-block rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">Launch price for our first 100 partners</span>}
              </dt>
              <dd className="shrink-0 text-end tabular-nums">
                {l.regularCents && <span className="block text-xs text-muted-foreground line-through">{money(l.regularCents)}</span>}
                <span className="font-medium">{money(l.amountCents)}</span>
              </dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2"><dt className="font-semibold">Total</dt><dd className="text-2xl font-bold tabular-nums">{money(fee.totalCents)}</dd></div>
          <p className="text-xs text-muted-foreground">One-time and non-refundable. Covers every car you place with CatoDrive.</p>
        </dl>

        {back === 'paid' ? (
          <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4 text-sm" role="status">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p>Confirming your payment. This takes a few seconds.</p>
          </div>
        ) : (
          <>
            {back === 'cancelled' && <p role="status" className="rounded-lg bg-warning/10 p-3 text-sm">Payment wasn’t completed. You weren’t charged.</p>}
            {options.length > 1 && (
              <fieldset className="space-y-2">
                <legend className="pb-1 text-sm font-semibold">How would you like to pay?</legend>
                {options.map((o) => {
                  const t = OPTION_TEXT[o.plan](o);
                  return (
                    <label key={o.plan} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${plan === o.plan ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                      <input type="radio" name="fee-plan" value={o.plan} checked={plan === o.plan} onChange={() => setPlan(o.plan)} className="mt-1 h-4 w-4 accent-primary" />
                      <span className="min-w-0">
                        <span className="block font-semibold">{t.title}</span>
                        <span className="block text-muted-foreground">{t.detail}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}
            {chosen.todayCents > 0 && (
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-success" /> Card, Apple Pay or Google Pay on Stripe’s secure page.</li>
                <li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-success" /> You’ll get a receipt by email.</li>
              </ul>
            )}
            <Button className="w-full sm:w-auto" loading={pay.isPending} onClick={() => pay.mutate()}>
              {chosen.todayCents > 0 ? `Pay ${money(chosen.todayCents)}` : 'Continue, pay from earnings'}
            </Button>
          </>
        )}

        {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Your card details go only to Stripe.</p>
      </CardContent>
    </Card>
  );
}
