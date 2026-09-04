'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { Banknote, CheckCircle2, ExternalLink, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';

interface ConnectStatus {
  connected: boolean;
  accountId?: string;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  requirementsDue: string[];
  needsOnboarding: boolean;
}

/**
 * Connecting a bank account.
 *
 * Until this existed, payouts moved on our ledger and nowhere else — a host
 * could see "paid" and never receive anything. There was no way for a host to
 * tell us where their money should go.
 *
 * Onboarding is Stripe-hosted: bank details, tax identity and documents are
 * collected by Stripe, so none of it passes through this app. The host leaves,
 * completes it, and comes back.
 *
 * Readiness is read from Stripe on every load rather than cached, because a
 * host can abandon onboarding halfway and the only thing that knows whether
 * they can actually be paid is Stripe.
 */

/** Stripe's requirement keys are machine names; these are the common ones. */
const REQUIREMENT_LABELS: Record<string, string> = {
  'individual.verification.document': 'A photo of your ID',
  'individual.id_number': 'Your SSN or tax ID',
  'external_account': 'Your bank account',
  'individual.address.line1': 'Your address',
  'individual.dob.day': 'Your date of birth',
  'business_profile.url': 'A website or profile link',
  'business_profile.mcc': 'What your business does',
  'tos_acceptance.date': 'Accepting Stripe’s terms',
};
const humanise = (k: string) => REQUIREMENT_LABELS[k] ?? k.replace(/[._]/g, ' ');

export function PayoutConnect() {
  const toast = useToast();

  const status = useQuery({
    queryKey: ['connect-status'],
    queryFn: () => api.get<ConnectStatus>('/payouts/connect/status'),
    retry: false,
  });

  const onboard = useMutation({
    mutationFn: () => api.post<{ url: string }>('/payouts/connect/onboard', { returnPath: '/host/earnings' }),
    // Stripe's flow replaces the page; coming back re-reads status.
    onSuccess: (r) => { window.location.href = r.url; },
    onError: () => toast({ tone: 'error', title: 'Could not start payout setup' }),
  });

  const dashboard = useMutation({
    mutationFn: () => api.post<{ url: string }>('/payouts/connect/dashboard', {}),
    onSuccess: (r) => window.open(r.url, '_blank', 'noopener'),
    onError: () => toast({ tone: 'error', title: 'Could not open your Stripe dashboard' }),
  });

  if (status.isLoading) return <Skeleton className="h-32 w-full" />;
  // A 5xx here usually means Stripe is not configured on this environment.
  if (status.isError || !status.data) return null;

  const s = status.data;

  // Fully set up — small and quiet, because there is nothing to do.
  if (s.connected && s.payoutsEnabled && !s.needsOnboarding) {
    return (
      <Card className="border-success/30 bg-success/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
            <span><span className="font-semibold">Payouts are set up.</span> Your earnings go to your bank automatically.</span>
          </p>
          <Button size="sm" variant="outline" loading={dashboard.isPending} onClick={() => dashboard.mutate()}>
            Manage <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  const started = s.connected && s.requirementsDue.length > 0;

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardContent className="py-5">
        <div className="flex items-start gap-3">
          {started ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          ) : (
            <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          )}
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {started ? 'Finish setting up payouts' : 'Set up payouts'}
              <Badge tone="warning">Required to get paid</Badge>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {started
                ? 'Stripe still needs a few details before money can reach your bank.'
                : 'Your earnings are being tracked, but nothing can reach your bank until you connect an account. Stripe handles this — your bank details never pass through us.'}
            </p>

            {/* Stripe's own words, translated. Naming what is missing is the
                difference between a host finishing this and abandoning it. */}
            {s.requirementsDue.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {s.requirementsDue.slice(0, 5).map((r) => (
                  <li key={r} className="flex items-start gap-2 text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />
                    <span className="capitalize">{humanise(r)}</span>
                  </li>
                ))}
                {s.requirementsDue.length > 5 && (
                  <li className="text-xs text-muted-foreground">…and {s.requirementsDue.length - 5} more</li>
                )}
              </ul>
            )}

            <Button className="mt-4" loading={onboard.isPending} onClick={() => onboard.mutate()}>
              {started ? 'Continue on Stripe' : 'Connect a bank account'}
              <ExternalLink className="h-4 w-4" />
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Takes about five minutes. You will need your bank details and a photo of your ID.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
