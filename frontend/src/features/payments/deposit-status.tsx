'use client';

import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Landmark, Clock, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/utils/format';
import { api } from '@/lib/api/client';

interface Deposit {
  held: boolean;
  amount?: { amount: number; currency: string };
  captured?: { amount: number; currency: string };
  status?: 'authorized' | 'captured' | 'released' | 'partially_captured';
  reason?: string | null;
  settledAt?: string | null;
}

/**
 * The security deposit, explained without anyone having to ask.
 *
 * The endpoint existed and nothing called it. Its own comment in the route says
 * why that mattered: "when do I get my $500 back" is the single most common
 * post-trip support question in this category, and the answer was sitting in an
 * API nobody had connected.
 *
 * The distinction that does the work here is HELD versus CHARGED. A hold is not
 * a charge — the money never left, it is only unavailable — and guests who do
 * not know that read a pending line on their statement as a second payment and
 * open a dispute. Saying it plainly costs nothing and prevents that.
 */
export function DepositStatus({ bookingId }: { bookingId: string }) {
  const q = useQuery({
    queryKey: ['deposit', bookingId],
    queryFn: () => api.get<Deposit>(`/payments/deposits/${bookingId}`),
    retry: false,
  });

  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  // No deposit on this booking is the common case, and not worth a card.
  if (q.isError || !q.data || !q.data.amount) return null;

  const d = q.data;
  const captured = d.captured?.amount ?? 0;
  const released = d.status === 'released';
  const partial = captured > 0 && captured < (d.amount?.amount ?? 0);

  return (
    <Card>
      <CardContent className="py-5">
        <p className="flex items-center gap-2 font-semibold">
          {released ? (
            <ShieldCheck className="h-5 w-5 text-success" />
          ) : (
            <Landmark className="h-5 w-5 text-primary" />
          )}
          Security deposit
        </p>

        {d.held && (
          <>
            <p className="numeric mt-2 text-2xl font-bold">{formatMoney(d.amount!)}</p>
            {/* The sentence that stops the support ticket. */}
            <p className="mt-1 text-sm text-muted-foreground">
              Held on your card, not charged. Your bank shows it as pending and it does not leave your account.
            </p>
            <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              Released after your trip ends and the damage window closes. Most banks clear it within a few days
              of that.
            </p>
          </>
        )}

        {released && captured === 0 && (
          <p className="mt-2 text-sm">
            <span className="font-medium text-success">Released in full.</span>{' '}
            <span className="text-muted-foreground">
              Nothing was taken
              {d.settledAt
                ? ` — released ${new Date(d.settledAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}.`
                : '.'}
            </span>
          </p>
        )}

        {captured > 0 && (
          <div className="mt-2 space-y-2">
            <p className="numeric text-sm">
              <span className="font-semibold">{formatMoney(d.captured!)}</span> taken from your{' '}
              {formatMoney(d.amount!)} deposit
              {partial && <span className="text-muted-foreground"> — the rest was released</span>}
            </p>
            {/* Never a charge without the reason attached. */}
            {d.reason && (
              <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                {d.reason}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
