'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Trash2, UserPlus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
import { formatDateTime, formatMoney } from '@/lib/utils/format';
import { driverApi, DRIVER_STATUS, type TripDriver } from '@/features/bookings/drivers';

/** Extra drivers on a trip: invite by email, they pass the ID check, then the fee is charged. */
export function DriverManager({ bookingId }: { bookingId: string }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const q = useQuery({ queryKey: ['trip-drivers', bookingId], queryFn: () => driverApi.list(bookingId), refetchInterval: (query) => (query.state.data?.drivers.some((d) => ['invited', 'verifying'].includes(d.status)) ? 20_000 : false) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['trip-drivers', bookingId] }); void qc.invalidateQueries({ queryKey: ['booking', bookingId] }); };
  const fail = (e: unknown) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That didn’t go through. Try again.' });

  const invite = useMutation({
    meta: { silentError: true },
    mutationFn: () => driverApi.invite(bookingId, { name: name.trim(), email: email.trim() }),
    onSuccess: (d) => { setOpen(false); setName(''); setEmail(''); toast({ tone: 'success', title: 'Invite sent', description: `We emailed ${d.email}. They’ll check their license and take a selfie.` }); refresh(); },
    onError: fail,
  });
  const act = useMutation({
    meta: { silentError: true },
    mutationFn: ({ d, kind }: { d: TripDriver; kind: 'resend' | 'pay' | 'remove' }) => (kind === 'resend' ? driverApi.resend(bookingId, d._id) : kind === 'pay' ? driverApi.pay(bookingId, d._id) : driverApi.remove(bookingId, d._id)),
    onSuccess: (d, v) => {
      if (v.kind === 'resend') toast({ tone: 'success', title: 'New link sent' });
      if (v.kind === 'pay') toast(d.status === 'approved' ? { tone: 'success', title: `${d.name} is approved` } : { tone: 'error', title: 'Your card didn’t go through. Update it and try again.' });
      if (v.kind === 'remove') toast({ tone: 'success', title: 'Driver removed', description: d.refundedAt ? 'The driver fee is on its way back to your card.' : undefined });
      refresh();
    },
    onError: fail,
  });

  const doRemove = async (d: TripDriver) => {
    const { ok } = await confirm({
      title: `Remove ${d.name}?`,
      description: d.chargedAt ? 'They can’t drive this car anymore. If pickup hasn’t happened yet, we refund the driver fee.' : 'They can’t drive this car anymore.',
      confirmLabel: 'Remove driver',
      tone: 'destructive',
    });
    if (ok) act.mutate({ d, kind: 'remove' });
  };

  if (q.isLoading) return <Skeleton className="h-32 w-full rounded-lg" />;
  if (q.isError || !q.data) return null;
  const { enabled, canAdd, feeCents, currency, addBy, drivers } = q.data;
  if (!enabled && !drivers.length) return null;
  const fee = formatMoney({ amount: feeCents, currency });
  const busy = (d: TripDriver) => act.isPending && act.variables?.d._id === d._id;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5 text-primary" /> Extra drivers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Only you and approved drivers may drive. Each driver checks their own license and takes a selfie. {feeCents > 0 ? `${fee} per driver, charged to your card only once they’re approved.` : 'Free.'}
        </p>

        {drivers.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {drivers.map((d) => (
              <li key={d._id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-medium">{d.name}<Badge tone={DRIVER_STATUS[d.status].tone}>{DRIVER_STATUS[d.status].label}</Badge></span>
                  <span className="block truncate text-xs text-muted-foreground">{d.email}{d.refundedAt ? ' · Fee refunded' : d.chargedAt ? ` · ${formatMoney({ amount: d.feeCents, currency: d.currency })} charged` : ''}</span>
                  {d.status === 'declined' && d.declineReasons?.length ? <span className="mt-1 block text-xs text-destructive">{d.declineReasons.join(' ')}</span> : null}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {d.status === 'payment_failed' && <Button size="sm" loading={busy(d) && act.variables?.kind === 'pay'} onClick={() => act.mutate({ d, kind: 'pay' })}>Pay {formatMoney({ amount: d.feeCents, currency: d.currency })}</Button>}
                  {['invited', 'verifying'].includes(d.status) && <Button size="sm" variant="ghost" disabled={busy(d)} onClick={() => act.mutate({ d, kind: 'resend' })}><Mail className="h-4 w-4" /> Resend</Button>}
                  {d.active && (
                    <button type="button" onClick={() => void doRemove(d)} disabled={busy(d)} aria-label={`Remove ${d.name}`} className="rounded-sm p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canAdd && !open && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Add drivers by {formatDateTime(addBy)}.</p>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" /> Add a driver</Button>
          </div>
        )}
        {canAdd && open && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2 && validEmail) invite.mutate(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Driver’s full name" htmlFor="driver-name"><Input id="driver-name" autoComplete="off" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="As on their license" /></Field>
              <Field label="Their email" htmlFor="driver-email" hint="We send them a link to get approved."><Input id="driver-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" loading={invite.isPending} disabled={name.trim().length < 2 || !validEmail}>Send invite</Button>
            </div>
          </form>
        )}
        {!canAdd && enabled && drivers.every((d) => !d.active) && <p className="text-xs text-muted-foreground">Drivers can’t be added to this trip anymore.</p>}
      </CardContent>
    </Card>
  );
}
