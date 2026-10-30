'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CarFront, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { assetPartnerApi, type PartnerReturn } from '@/features/asset-partners/api';
import { RETURN_STATUS } from '@/features/asset-partners/returns-api';
import { ApiError } from '@/lib/api/types';
import { formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

const failMessage = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const dayInput = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

function RequestForm({ earliest, noticeDays, busyCars, onSent }: { earliest: string; noticeDays: number; busyCars: Set<string>; onSent: () => void }) {
  const toast = useToast();
  const cars = useQuery({ queryKey: ['asset-partner-vehicles'], queryFn: () => assetPartnerApi.vehicles() });
  const available = useMemo(() => (cars.data ?? []).filter((c) => !busyCars.has(c._id)), [cars.data, busyCars]);
  const [picked, setPicked] = useState<string[]>([]);
  const [date, setDate] = useState(dayInput(earliest));
  const [handover, setHandover] = useState<'pickup' | 'deliver'>('pickup');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => setDate(dayInput(earliest)), [earliest]);

  const send = useMutation({
    meta: { silentError: true },
    mutationFn: () =>
      assetPartnerApi.requestReturn({
        vehicleIds: picked,
        preferredDate: new Date(`${date}T12:00:00`).toISOString(),
        handoverPreference: handover,
        deliveryAddress: handover === 'deliver' ? address : undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: (r) => {
      toast({ tone: 'success', title: 'Request sent', description: `Reference ${r.reference}. We’ll confirm the date.` });
      setPicked([]);
      setNote('');
      onSent();
    },
  });

  if (cars.isLoading) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (cars.isError) return <ErrorState message="We couldn’t load your cars." retry={() => void cars.refetch()} />;
  if (available.length === 0) {
    return <EmptyState icon={<CarFront className="h-6 w-6" />} title="No cars to return" description="Every car you have with us already has a return in progress, or none are with CatoDrive right now." />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ask for a car back</CardTitle>
        <p className="text-sm text-muted-foreground">Your agreement asks for {noticeDays} days’ notice. Your car keeps earning until the return date.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-label font-semibold">Which car?</legend>
          {available.map((c) => (
            <label key={c._id} className={cn('flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm', picked.includes(c._id) ? 'border-primary bg-primary/5' : 'border-border')}>
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={picked.includes(c._id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, c._id] : picked.filter((x) => x !== c._id))}
              />
              <span className="font-medium">{c.year} {c.make} {c.model}{c.trim ? ` ${c.trim}` : ''}</span>
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Return date" htmlFor="return-date" hint={`${formatDate(earliest)} at the earliest`}>
            <Input id="return-date" type="date" min={dayInput(earliest)} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-label font-semibold">Handover</legend>
            <div className="flex flex-wrap gap-2">
              {(['pickup', 'deliver'] as const).map((h) => (
                <label key={h} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm', handover === h ? 'border-primary bg-primary/5' : 'border-border')}>
                  <input type="radio" name="handover" className="accent-primary" checked={handover === h} onChange={() => setHandover(h)} />
                  {h === 'pickup' ? 'I’ll collect it' : 'Bring it to me'}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        {handover === 'deliver' && (
          <Field label="Address to bring the car to" htmlFor="return-address">
            <Input id="return-address" autoComplete="street-address" maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
        )}
        <Field label="Anything we should know? (optional)" htmlFor="return-note">
          <Textarea id="return-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {send.isError && <p role="alert" className="text-sm text-destructive">{failMessage(send.error, 'We couldn’t send that. Try again.')}</p>}
        <div className="flex justify-end">
          <Button className="w-full sm:w-auto" disabled={picked.length === 0 || !date || (handover === 'deliver' && address.trim().length < 8)} loading={send.isPending} onClick={() => send.mutate()}>
            Send request
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReturnCard({ r, onChange }: { r: PartnerReturn; onChange: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const cancel = useMutation({
    mutationFn: () => assetPartnerApi.cancelReturn(r._id),
    onSuccess: () => { toast({ tone: 'success', title: 'Request withdrawn' }); onChange(); },
    onError: (e) => toast({ tone: 'error', title: failMessage(e, 'We couldn’t withdraw it. Try again.') }),
  });
  const respond = useMutation({
    mutationFn: () => assetPartnerApi.respondToNotice(r._id),
    onSuccess: () => { toast({ tone: 'success', title: 'Thanks for getting back to us' }); onChange(); },
    onError: (e) => toast({ tone: 'error', title: failMessage(e, 'That didn’t go through. Try again.') }),
  });
  const s = RETURN_STATUS[r.status];
  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{r.cars.map((c) => c.label).join(', ')}</p>
          <p className="font-mono text-xs text-muted-foreground">{r.reference}</p>
        </div>
        <Badge tone={s.tone}>{r.reason === 'unresponsive' && r.status === 'notice' ? 'We need to hear from you' : s.label}</Badge>
      </div>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        {r.scheduledFor ? (
          <div><dt className="text-xs text-muted-foreground">Return date</dt><dd className="font-medium">{formatDate(r.scheduledFor)}</dd></div>
        ) : r.preferredDate ? (
          <div><dt className="text-xs text-muted-foreground">Date you asked for</dt><dd className="font-medium">{formatDate(r.preferredDate)}</dd></div>
        ) : null}
        {r.handoverPreference && <div><dt className="text-xs text-muted-foreground">Handover</dt><dd className="font-medium">{r.handoverPreference === 'deliver' ? `Bring to ${r.deliveryAddress}` : 'You collect it'}</dd></div>}
        {r.handover && <div><dt className="text-xs text-muted-foreground">Handed to</dt><dd className="font-medium">{r.handover.receiverName}, {formatDate(r.handover.at)}</dd></div>}
        {r.cancelled && <div><dt className="text-xs text-muted-foreground">Closed</dt><dd className="font-medium">{r.cancelled.reason}</dd></div>}
      </dl>
      {r.canRespond && (
        <div className="space-y-2 rounded-lg bg-warning/10 p-3 text-sm">
          <p>We haven’t been able to reach you. Your car is still running and your earnings are held safely for you. Press the button to let us know you’re here, and we’ll release them.</p>
          <Button size="sm" loading={respond.isPending} onClick={() => respond.mutate()}>I’m here</Button>
        </div>
      )}
      {r.canCancel && (
        <Button
          variant="outline"
          size="sm"
          loading={cancel.isPending}
          onClick={async () => {
            if (await confirm({ title: 'Withdraw this request?', description: 'Your car stays with CatoDrive and keeps earning.', confirmLabel: 'Withdraw' })) cancel.mutate();
          }}
        >
          <Undo2 className="h-4 w-4" /> Withdraw request
        </Button>
      )}
    </li>
  );
}

export default function PartnerReturnsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['asset-partner-returns'], queryFn: () => assetPartnerApi.returns() });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['asset-partner-returns'] });
    void qc.invalidateQueries({ queryKey: ['asset-partner-vehicles'] });
  };
  const open = (q.data?.exits ?? []).filter((e) => !['completed', 'cancelled'].includes(e.status));
  const busy = useMemo(() => new Set(open.flatMap((e) => e.cars.map((c) => c.vehicleId))), [open]);

  return (
    <div className="space-y-6">
      <PageHeader title="Returns" description="Ask for a car back and follow the handover." />
      {q.isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : q.isError || !q.data ? (
        <ErrorState message="We couldn’t load your returns." retry={() => void q.refetch()} />
      ) : (
        <>
          <RequestForm earliest={q.data.earliestDate} noticeDays={q.data.noticeDays} busyCars={busy} onSent={refresh} />
          <Card>
            <CardHeader><CardTitle>Your returns</CardTitle></CardHeader>
            <CardContent className="p-0">
              {q.data.exits.length === 0 ? (
                <EmptyState icon={<CalendarCheck className="h-6 w-6" />} title="No returns yet" description="When you ask for a car back, you’ll follow it here." />
              ) : (
                <ul className="divide-y divide-border">{q.data.exits.map((r) => <ReturnCard key={r._id} r={r} onChange={refresh} />)}</ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
