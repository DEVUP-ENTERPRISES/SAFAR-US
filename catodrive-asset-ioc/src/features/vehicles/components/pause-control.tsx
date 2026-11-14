'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PauseCircle, PlayCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
import { carPauseApi, PAUSE_STATUS, pauseSpan, todayKey } from '@/features/vehicles/pause';

/** Pause a live car now (optionally until a date), or bring a paused one back. */
export function PauseControl({ vehicleId, status, onChanged }: { vehicleId: string; status: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [backOn, setBackOn] = useState('');
  const q = useQuery({ queryKey: ['car-pause', vehicleId], queryFn: () => carPauseApi.latest(vehicleId) });
  const done = () => { void qc.invalidateQueries({ queryKey: ['car-pause', vehicleId] }); void qc.invalidateQueries({ queryKey: ['car-pauses'] }); onChanged(); };

  const pause = useMutation({
    meta: { silentError: true },
    mutationFn: () => carPauseApi.pauseNow(vehicleId, { reason: reason.trim(), ...(backOn ? { backOnDay: backOn } : {}) }),
    onSuccess: () => { setOpen(false); setReason(''); setBackOn(''); toast({ tone: 'success', title: 'Car paused' }); done(); },
  });
  const resume = useMutation({
    meta: { silentError: true },
    mutationFn: () => carPauseApi.resume(vehicleId),
    onSuccess: () => { toast({ tone: 'success', title: 'Car is live again' }); done(); },
  });
  const error = (pause.error ?? resume.error) as unknown;

  if (q.isLoading) return <Skeleton className="h-20 w-full rounded-lg" />;
  const p = q.data && ['pending', 'scheduled', 'active'].includes(q.data.status) ? q.data : null;
  const canResume = status === 'paused' || p?.status === 'scheduled';

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      {p ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              <Badge tone={PAUSE_STATUS[p.status].tone}>{p.source === 'partner' && p.status === 'pending' ? 'Partner asked to pause' : PAUSE_STATUS[p.status].label}</Badge>
              <span className="tabular-nums">{pauseSpan(p)}</span>
            </p>
            <p className="mt-1 text-muted-foreground">{p.reason}</p>
            {p.status === 'pending' && <p className="mt-1 text-muted-foreground">Review it under Partners → Pauses.</p>}
          </div>
          {canResume && (
            <Button size="sm" variant="outline" loading={resume.isPending} onClick={() => resume.mutate()}>
              <PlayCircle className="h-4 w-4" /> {p.status === 'scheduled' ? 'Cancel pause' : 'Resume now'}
            </Button>
          )}
        </div>
      ) : status === 'paused' ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">This car is paused and won’t show in search.</p>
          <Button size="sm" variant="outline" loading={resume.isPending} onClick={() => resume.mutate()}><PlayCircle className="h-4 w-4" /> Resume now</Button>
        </div>
      ) : status === 'listed' && !open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Take the car out of search for a while. Trips already booked still go ahead.</p>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}><PauseCircle className="h-4 w-4" /> Pause car</Button>
        </div>
      ) : status === 'listed' ? (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (reason.trim().length >= 3) pause.mutate(); }}>
          <Field label="Why are you pausing it?" htmlFor="pause-reason">
            <Textarea id="pause-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Windshield repair" />
          </Field>
          <Field label="Back on (optional)" htmlFor="pause-back" hint="The car goes live again by itself on this date. Leave it empty to resume by hand.">
            <Input id="pause-back" type="date" min={todayKey()} value={backOn} onChange={(e) => setBackOn(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" loading={pause.isPending} disabled={reason.trim().length < 3}>Pause car</Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">A car can be paused once it’s live.</p>
      )}
      {error ? <p role="alert" className="text-sm text-destructive">{error instanceof ApiError ? error.message : 'That didn’t go through. Try again.'}</p> : null}
    </div>
  );
}
