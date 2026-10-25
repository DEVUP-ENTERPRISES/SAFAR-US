'use client';

import { useState } from 'react';
import { History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatMoney } from '@/lib/utils/format';
import { EXCEPTION_REASON_LABEL, EXCEPTION_STATUS_LABEL } from '../status';
import type { Booking, ExceptionReasonCode } from '../types';
import { ExceptionForm } from './change-trip';

const KIND_LABEL = { pickup_shift: 'Pickup time changed', move: 'Dates changed', switch_car: 'Car switched' } as const;
const EXCEPTION_TONE = { pending: 'warning', approved: 'success', partial: 'success', rejected: 'muted' } as const;
// The server enforces the real window; this only stops offering the form on very old trips.
const OFFER_WINDOW_MS = 48 * 3_600_000;

/** What changed on this trip, and the guest's exception request if they made one. */
export function TripChangesCard({ booking: b }: { booking: Booking }) {
  const [asking, setAsking] = useState(false);
  const changes = b.changes ?? [];
  const kept = b.cancellation?.charged?.amount ?? 0;
  const canAsk =
    b.status === 'cancelled_guest' && kept > 0 && !b.exception && !!b.cancellation && Date.now() - new Date(b.cancellation.at).getTime() < OFFER_WINDOW_MS;

  if (changes.length === 0 && !b.exception && !canAsk) return null;

  if (asking) {
    return (
      <ExceptionForm
        bookingId={b._id}
        reasons={Object.keys(EXCEPTION_REASON_LABEL) as ExceptionReasonCode[]}
        proofRequired
        onDone={() => setAsking(false)}
        onSkip={() => setAsking(false)}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><History className="h-5 w-5 text-primary" aria-hidden />Trip changes</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {changes.map((c, i) => (
          <div key={i} className="space-y-0.5">
            <p className="font-medium">{KIND_LABEL[c.kind]}</p>
            <p className="text-muted-foreground">
              {c.kind === 'pickup_shift' ? `Pickup now ${formatDateTime(c.to.start)}` : c.kind === 'move' ? `${formatDateTime(c.to.start)} – ${formatDateTime(c.to.end)}` : 'Same dates, same price'}
              {c.difference && c.difference.amount !== 0 && (
                <span className="tabular-nums"> · {c.difference.amount > 0 ? `paid ${formatMoney(c.difference)}` : `refunded ${formatMoney({ ...c.difference, amount: -c.difference.amount })}`}</span>
              )}
            </p>
          </div>
        ))}
        {b.exception && (
          <div className="space-y-1 border-t border-border pt-3 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Refund review</span>
              <Badge tone={EXCEPTION_TONE[b.exception.status]}>{EXCEPTION_STATUS_LABEL[b.exception.status]}</Badge>
            </div>
            <p className="text-muted-foreground">{EXCEPTION_REASON_LABEL[b.exception.reasonCode]}</p>
            {b.exception.refund && b.exception.refund.amount > 0 && <p className="tabular-nums">{formatMoney(b.exception.refund)} back to your card.</p>}
            {b.exception.decisionNote && <p className="text-muted-foreground">{b.exception.decisionNote}</p>}
          </div>
        )}
        {canAsk && (
          <div className="space-y-2 border-t border-border pt-3 first:border-0 first:pt-0">
            <p className="text-muted-foreground">Cancelled because of a cancelled flight, bad weather or an emergency? Send proof and we’ll review it.</p>
            <Button size="sm" variant="outline" onClick={() => setAsking(true)}>Ask for a review</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
