'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Scale, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/utils/format';
import { ApiError } from '@/lib/api/types';
import { api } from '@/lib/api/client';

export interface Incidental {
  _id: string;
  type: string;
  amount: number;
  qty?: number;
  note?: string;
  evidenceUrl?: string;
  status: 'charged' | 'disputed' | 'refunded' | 'upheld';
  disputeReason?: string;
  resolutionNote?: string;
  at: string;
}

const LABEL: Record<string, string> = {
  fuel: 'Fuel', cleaning: 'Extra cleaning', smoking: 'Smoking', pet: 'Unapproved pet',
  late_return: 'Late return', toll: 'Toll', fine: 'Fine', other: 'Other',
};

/**
 * Post-trip charges, and the way to argue with one.
 *
 * These bill a card the guest already handed over, and until now they could see
 * a notification about it and nothing else — no itemisation, no evidence, and
 * no way to contest it. A charge nobody can dispute is not a charge, it is a
 * taking, and the only recourse left to the guest was a chargeback, which costs
 * the platform far more than a refund would have.
 *
 * Evidence sits next to the amount for the same reason it does on citations: a
 * charge with the receipt attached is usually accepted, and one without it is
 * usually not.
 */
export function IncidentalCharges({
  bookingId,
  items,
  currency,
}: {
  bookingId: string;
  items: Incidental[];
  currency: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [disputing, setDisputing] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const dispute = useMutation({
    mutationFn: ({ id, why }: { id: string; why: string }) =>
      api.post(`/bookings/${bookingId}/incidentals/${id}/dispute`, { reason: why }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Dispute sent', description: 'We will review it and come back to you.' });
      setDisputing(null);
      setReason('');
      qc.invalidateQueries({ queryKey: ['booking', bookingId] });
    },
    // The server explains whether the window closed or it is already resolved.
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not send that' }),
  });

  if (items.length === 0) return null;
  const total = items.filter((i) => i.status !== 'refunded').reduce((s, i) => s + i.amount, 0);

  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="flex items-center gap-2 font-semibold">
            <Receipt className="h-5 w-5 text-primary" /> Post-trip charges
          </p>
          <span className="numeric font-semibold">{formatMoney({ amount: total, currency })}</span>
        </div>

        <ul className="mt-4 divide-y divide-border">
          {items.map((it) => (
            <li key={it._id} className="py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {LABEL[it.type] ?? it.type}
                    {it.status === 'disputed' && <Badge tone="warning">Under review</Badge>}
                    {it.status === 'refunded' && <Badge tone="success">Refunded</Badge>}
                    {it.status === 'upheld' && <Badge tone="muted">Upheld</Badge>}
                  </p>
                  {it.note && <p className="mt-0.5 text-sm text-muted-foreground">{it.note}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(it.at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`numeric font-semibold ${it.status === 'refunded' ? 'line-through opacity-60' : ''}`}>
                    {formatMoney({ amount: it.amount, currency })}
                  </span>
                  {it.evidenceUrl && (
                    <a
                      href={it.evidenceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      See proof <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* What we decided, and why. A resolved dispute with no
                  explanation is the same as no answer. */}
              {it.resolutionNote && (
                <p className="mt-2 flex items-start gap-2 rounded-lg bg-muted/50 p-2.5 text-sm text-muted-foreground">
                  {it.status === 'refunded' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  {it.resolutionNote}
                </p>
              )}

              {it.status === 'charged' && disputing !== it._id && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => { setDisputing(it._id); setReason(''); }}>
                  <Scale className="h-3.5 w-3.5" /> This is wrong
                </Button>
              )}

              {disputing === it._id && (
                <div className="mt-3 space-y-2">
                  <Textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="What is wrong with this charge? Be specific — it goes straight to the person reviewing it."
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      disabled={reason.trim().length < 10}
                      loading={dispute.isPending}
                      onClick={() => dispute.mutate({ id: it._id, why: reason.trim() })}
                    >
                      Send dispute
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDisputing(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          Something look wrong? Say so within 72 hours and we will review it before it settles.
        </p>
      </CardContent>
    </Card>
  );
}
