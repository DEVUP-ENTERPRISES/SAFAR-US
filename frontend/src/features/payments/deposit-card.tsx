'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Clock, Lock } from 'lucide-react';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { formatDateTime, formatMoney } from '@/lib/utils/format';
import { PayNow } from './pay-now';

interface DepositState {
  held: boolean;
  status: string;
  enabled?: boolean;
  amount?: { amount: number; currency: string };
  releaseHours?: number;
  opensAt?: string;
  requiredAtHandover?: boolean;
}
type Session =
  | { status: 'held' | 'not_needed'; amount: { amount: number; currency: string } }
  | { status: 'needs_payment'; clientSecret: string; amount: { amount: number; currency: string } }
  | { status: 'too_early'; amount: { amount: number; currency: string }; opensAt: string };

/** The security deposit on a guest's booking: how much, when it is held, when it comes back, and a button to place it if the saved card cannot. */
export function DepositCard({ bookingId, isGuest }: { bookingId: string; isGuest: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [secret, setSecret] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['deposit', bookingId], queryFn: () => api.get<DepositState>(`/payments/deposits/${bookingId}`), retry: false });
  const refresh = () => qc.invalidateQueries({ queryKey: ['deposit', bookingId] });
  const start = useMutation({
    mutationFn: () => api.post<Session>(`/bookings/${bookingId}/deposit-session`, {}),
    onSuccess: (s) => {
      if (s.status === 'needs_payment') setSecret(s.clientSecret);
      else if (s.status === 'held') { setSecret(null); toast({ tone: 'success', title: 'Deposit held. You are ready for pickup.' }); refresh(); }
      else if (s.status === 'too_early') toast({ tone: 'info', title: `You can place it from ${formatDateTime(s.opensAt)}` });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not start the deposit' }),
  });

  const d = q.data;
  if (!d || d.enabled === false || !d.amount || d.amount.amount <= 0) return null;
  const days = Math.round((d.releaseHours ?? 120) / 24);
  const canPlace = isGuest && !d.held && (!d.opensAt || new Date(d.opensAt).getTime() <= Date.now());

  return (
    <section className="rounded-2xl border border-border p-4">
      <p className="flex items-center gap-2 font-semibold">
        {d.held ? <ShieldCheck className="h-5 w-5 text-success" /> : <Lock className="h-5 w-5 text-primary" />}
        Security deposit {formatMoney(d.amount)}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {!isGuest
          ? d.held ? 'Held on the guest’s card. You can start the trip.' : 'Not held yet. With a saved card it is held automatically when you start the trip; otherwise the guest places it from their booking, and is alerted if you try to start without it.'
          : d.held
          ? `Held on your card, not charged. Released about ${days} days after your trip unless there is a damage claim.`
          : `A hold, not a charge, placed before pickup and released about ${days} days after your trip.${d.requiredAtHandover ? ' The trip cannot start without it.' : ''}`}
      </p>
      {!d.held && isGuest && !canPlace && d.opensAt && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> With a saved card this is done for you at pickup. Otherwise you can place it from {formatDateTime(d.opensAt)}.
        </p>
      )}
      {canPlace && !secret && (
        <Button className="mt-3" size="sm" loading={start.isPending} onClick={() => start.mutate()}>Place deposit hold</Button>
      )}
      {secret && (
        <div className="mt-3">
          <PayNow clientSecret={secret} returnPath={`/bookings/${bookingId}?deposit=1`} onPaid={() => start.mutate()} />
        </div>
      )}
    </section>
  );
}
