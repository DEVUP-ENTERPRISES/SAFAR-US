'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PauseCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
import { partnerPauseApi, PAUSE_STATUS, pauseSpan, todayKey } from '@/features/vehicles/pause';

const RECENT_MS = 14 * 86_400_000;

/** A partner asks for their car to be off CatoDrive for some dates, and follows the answer. */
export function PauseCard({ vehicleId, status }: { vehicleId: string; status: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [fromDay, setFromDay] = useState('');
  const [backOnDay, setBackOnDay] = useState('');
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['partner-car-pause', vehicleId], queryFn: () => partnerPauseApi.latest(vehicleId) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['partner-car-pause', vehicleId] }); void qc.invalidateQueries({ queryKey: ['asset-partner-vehicle', vehicleId] }); };

  const send = useMutation({
    meta: { silentError: true },
    mutationFn: () => partnerPauseApi.request(vehicleId, { reason: reason.trim(), fromDay, backOnDay }),
    onSuccess: () => { setOpen(false); setReason(''); setFromDay(''); setBackOnDay(''); toast({ tone: 'success', title: 'Request sent', description: 'We’ll review it and let you know.' }); refresh(); },
  });
  const cancel = useMutation({
    meta: { silentError: true },
    mutationFn: (id: string) => partnerPauseApi.cancel(id),
    onSuccess: () => { toast({ tone: 'success', title: 'Pause cancelled' }); refresh(); },
  });
  const error = (send.error ?? cancel.error) as unknown;

  if (!['listed', 'paused'].includes(status)) return null;
  if (q.isLoading) return <Skeleton className="h-28 w-full rounded-lg" />;

  const p = q.data;
  const current = p && ['pending', 'scheduled', 'active'].includes(p.status) ? p : null;
  const recent = p && !current && p.status === 'declined' && Date.now() - new Date(p.decidedAt ?? p.createdAt).getTime() < RECENT_MS ? p : null;
  const valid = reason.trim().length >= 3 && !!fromDay && !!backOnDay && backOnDay > fromDay;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><PauseCircle className="h-5 w-5 text-primary" /> Pause this car</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {current ? (
          <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
            <div className="min-w-0 space-y-1">
              <p className="flex flex-wrap items-center gap-2"><Badge tone={PAUSE_STATUS[current.status].tone}>{PAUSE_STATUS[current.status].label}</Badge><span className="font-medium tabular-nums">{pauseSpan(current)}</span></p>
              <p className="text-muted-foreground">
                {current.status === 'pending' ? 'We’re reviewing your request.' : current.status === 'scheduled' ? 'Guests can’t book these dates. The car goes back live by itself on the return date.' : current.backOnDay ? 'The car goes back live by itself on the return date.' : 'We’ll put the car back live and let you know.'}
              </p>
            </div>
            {current.source === 'partner' && ['pending', 'scheduled'].includes(current.status) && (
              <Button size="sm" variant="outline" loading={cancel.isPending} onClick={() => cancel.mutate(current._id)}>{current.status === 'pending' ? 'Withdraw request' : 'Cancel pause'}</Button>
            )}
          </div>
        ) : open ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) send.mutate(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First day off" htmlFor="pause-from">
                <Input id="pause-from" type="date" min={todayKey()} value={fromDay} onChange={(e) => setFromDay(e.target.value)} />
              </Field>
              <Field label="Back on CatoDrive" htmlFor="pause-back" error={fromDay && backOnDay && backOnDay <= fromDay ? 'Pick a date after the first day off.' : undefined}>
                <Input id="pause-back" type="date" min={fromDay || todayKey()} value={backOnDay} onChange={(e) => setBackOnDay(e.target.value)} />
              </Field>
            </div>
            <Field label="Reason" htmlFor="pause-reason">
              <Textarea id="pause-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family trip" />
            </Field>
            <p className="text-xs text-muted-foreground">If guests have already booked these dates, we’ll talk to you before deciding.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" loading={send.isPending} disabled={!valid}>Send request</Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Need the car for a while? Ask us to take it off CatoDrive for those dates.</p>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Request a pause</Button>
          </div>
        )}
        {recent && <p className="text-sm text-muted-foreground">Your last request ({pauseSpan(recent)}) was declined. {recent.declineReason}</p>}
        {error ? <p role="alert" className="text-sm text-destructive">{error instanceof ApiError ? error.message : 'That didn’t go through. Try again.'}</p> : null}
      </CardContent>
    </Card>
  );
}
