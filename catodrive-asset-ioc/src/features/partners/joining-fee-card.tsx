'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { partnerManageApi } from '@/features/asset-partners/manage-api';
import { ApiError } from '@/lib/api/types';
import { formatDateTime } from '@/lib/utils/format';

const manage = partnerManageApi('/ioc');
const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export interface JoiningFee {
  amountCents: number;
  platformFeeCents?: number;
  currency: string;
  setAt?: string;
  paidAt?: string;
  paidCents?: number;
  refundedAt?: string;
  refundReason?: string;
}

/** The partner's one-time fee: what is owed, when it was paid, and the only changes ops can make at each point. */
export function JoiningFeeCard({ partnerId, fee, signed }: { partnerId: string; fee?: JoiningFee; signed: boolean }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-asset-partner', partnerId] });
  const fail = (e: unknown) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That didn’t go through. Try again.' });

  const set = useMutation({
    mutationFn: (cents: number) => manage.setJoiningFee(partnerId, cents),
    onSuccess: () => { setEditing(false); toast({ tone: 'success', title: 'Fee updated' }); void refresh(); },
    onError: fail,
  });
  const refund = useMutation({
    mutationFn: (reason: string) => manage.refundJoiningFee(partnerId, reason),
    onSuccess: () => { toast({ tone: 'success', title: 'Fee refunded' }); void refresh(); },
    onError: fail,
  });

  const status = !fee ? 'none' : fee.refundedAt ? 'refunded' : fee.paidAt ? 'paid' : fee.amountCents > 0 ? 'due' : 'waived';
  const canChange = (status === 'due' || status === 'waived' || status === 'none') && !signed;
  const cents = Math.round(Number(amount) * 100);
  const valid = amount.trim() !== '' && Number.isFinite(cents) && cents >= 0 && cents <= 500_000;

  const askRefund = async () => {
    const { ok, reason } = await confirm({
      title: `Refund ${money(fee?.paidCents ?? fee?.amountCents ?? 0)}?`,
      description: 'The full fee goes back to the partner’s card. This can’t be undone.',
      confirmLabel: 'Refund',
      tone: 'destructive',
      reason: { label: 'Why (kept on the record)', required: true },
    });
    if (ok && reason) refund.mutate(reason);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Registration fee</CardTitle>
        <Badge tone={status === 'paid' ? 'success' : status === 'due' ? 'warning' : 'muted'}>
          {status === 'none' ? 'Not charged' : status === 'due' ? 'Waiting for payment' : status === 'paid' ? 'Paid' : status === 'waived' ? 'Waived' : 'Refunded'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {status === 'none' && <p className="text-muted-foreground">No fee was set for this partner{signed ? '; they joined before the fee or were added directly.' : '.'}</p>}
        {status === 'due' && (
          <p>
            Owes <span className="font-semibold tabular-nums">{money(fee!.amountCents + (fee!.platformFeeCents ?? 0))}</span>
            {(fee!.platformFeeCents ?? 0) > 0 && <span className="text-muted-foreground tabular-nums"> ({money(fee!.amountCents)} registration + {money(fee!.platformFeeCents!)} platform fee)</span>}
            . They pay right after their ID check, before signing.
          </p>
        )}
        {status === 'waived' && <p className="text-muted-foreground">Waived{fee?.setAt ? ` on ${formatDateTime(fee.setAt)}` : ''}.</p>}
        {(status === 'paid' || status === 'refunded') && (
          <p>Paid <span className="font-semibold tabular-nums">{money(fee!.paidCents ?? fee!.amountCents)}</span> on {formatDateTime(fee!.paidAt!)}.</p>
        )}
        {status === 'refunded' && <p className="text-muted-foreground">Refunded on {formatDateTime(fee!.refundedAt!)}: {fee!.refundReason}</p>}

        {canChange && !editing && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { setAmount(fee ? String(fee.amountCents / 100) : ''); setEditing(true); }}>Change amount</Button>
            {status === 'due' && <Button size="sm" variant="ghost" loading={set.isPending} onClick={() => set.mutate(0)}>Waive</Button>}
          </div>
        )}
        {canChange && editing && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Registration fee (USD)" htmlFor="fee-amount" hint="0 waives it. The platform fee is added on top. An open payment page is closed and a new one made.">
              <Input id="fee-amount" type="number" inputMode="decimal" min="0" max="5000" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular-nums sm:w-40" />
            </Field>
            <div className="flex gap-2">
              <Button size="sm" disabled={!valid} loading={set.isPending} onClick={() => set.mutate(cents)}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {status === 'paid' && <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" loading={refund.isPending} onClick={() => void askRefund()}>Refund</Button>}
      </CardContent>
    </Card>
  );
}
