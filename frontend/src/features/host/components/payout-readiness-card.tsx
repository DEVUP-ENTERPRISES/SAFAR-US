'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, Building2, ChevronRight, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';
import { hostApi } from '@/features/host/api';

/**
 * Where the money goes, and what is stopping it.
 *
 * Shown above the earnings figures rather than below: a balance is meaningless
 * if it cannot reach anyone, and a host should learn that now rather than at
 * the first failed payout.
 */
export function PayoutReadinessCard() {
  const q = useQuery({ queryKey: ['payout-readiness'], queryFn: () => hostApi.payoutReadiness(), retry: false });

  if (q.isLoading) return <Skeleton className="h-28 w-full" />;
  if (q.isError || !q.data) return null; // never block the earnings page on this

  const d = q.data;
  const blocking = d.blockers.filter((b) => b.severity === 'blocking');
  const warnings = d.blockers.filter((b) => b.severity === 'warning');

  return (
    <Card className={cn(blocking.length > 0 && 'border-destructive/40 bg-destructive/5')}>
      <CardContent className="space-y-3 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {blocking.length > 0 ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            ) : (
              <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            )}
            <div>
              <p className="font-semibold">
                {blocking.length > 0
                  ? 'Payouts are on hold'
                  : d.destination.configured
                    ? 'You’re set up to get paid'
                    : 'Payouts ready'}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {blocking.length > 0
                  ? 'Your earnings keep accruing — they just can’t be sent yet.'
                  : d.nextPayoutAt
                    ? `Next payout ${formatDate(d.nextPayoutAt)}.`
                    : 'Completed trips are paid out after the hold window.'}
              </p>
            </div>
          </div>

          {/* The destination, recognisable but never fully shown. */}
          {d.destination.configured && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span>
                {d.destination.viaStripe
                  ? 'Stripe'
                  : `${d.destination.bankName ?? 'Bank'}${d.destination.last4 ? ` ••${d.destination.last4}` : ''}`}
              </span>
              {d.destination.verified && <BadgeCheck className="h-4 w-4 text-success" />}
            </div>
          )}
        </div>

        {/* Every blocker names the screen that clears it — "on hold" with no
            next step is just anxiety. */}
        {(blocking.length > 0 || warnings.length > 0) && (
          <ul className="divide-y divide-border border-t border-border">
            {[...blocking, ...warnings].map((b) => (
              <li key={`${b.key}-${b.severity}`}>
                <Link href={b.href} className="flex items-center justify-between gap-3 py-3 hover:text-primary">
                  <span className="flex items-start gap-2.5">
                    {b.severity === 'blocking' ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{b.label}</span>
                      <span className="block text-xs text-muted-foreground">{b.detail}</span>
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
