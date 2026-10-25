'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, Car, Clock, FileUp, Gift, ShieldCheck, Wallet, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ApiError } from '@/lib/api/types';
import { cn } from '@/lib/utils/cn';
import { formatDateTime, formatMoney } from '@/lib/utils/format';
import { uploadFiles } from '@/features/media/upload';
import { bookingApi } from '../api';
import { useMoveTrip, useRequestException, useShiftPickup, useSwitchCar } from '../queries';
import { CANCEL_REASON_LABEL, EXCEPTION_REASON_LABEL } from '../status';
import type { Booking, CancelReasonCode, ChangeOptions, ExceptionReasonCode } from '../types';
import { safeMessage } from '@/lib/utils/safe-message';

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const timeOnly = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Which options lead for each reason; anything else still sits under "Other options". */
export const RECOMMENDED: Record<CancelReasonCode, ('shift' | 'move' | 'switch')[]> = {
  flight_delayed: ['shift', 'move'],
  plans_changed: ['move', 'shift'],
  found_other_car: ['switch'],
  price: ['switch'],
  flight_cancelled: ['move'],
  weather: ['move'],
  health: ['move'],
  other: ['move', 'shift', 'switch'],
};

/** Counts down the free-cancellation window so the guest sees exactly how long it lasts. */
export function UndoBanner({ endsAt, onExpire }: { endsAt: string; onExpire: () => void }) {
  const [left, setLeft] = useState(() => new Date(endsAt).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const ms = new Date(endsAt).getTime() - Date.now();
      setLeft(ms);
      if (ms <= 0) {
        clearInterval(t);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [endsAt, onExpire]);
  if (left <= 0) return null;
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return (
    <div role="status" className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-foreground">Free cancellation for <span className="tabular-nums">{m}:{String(s).padStart(2, '0')}</span></p>
        <p className="text-muted-foreground">You just booked, so you can still cancel for a full refund. After that the normal policy applies.</p>
      </div>
    </div>
  );
}

export function ReasonPicker({ reasons, value, onChange }: { reasons: CancelReasonCode[]; value: CancelReasonCode | null; onChange: (r: CancelReasonCode) => void }) {
  const ordered = (Object.keys(CANCEL_REASON_LABEL) as CancelReasonCode[]).filter((r) => reasons.includes(r));
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold">What’s changed?</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {ordered.map((r) => (
          <label
            key={r}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-sm border px-4 py-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring',
              value === r ? 'border-primary bg-primary/5 font-semibold' : 'border-border hover:bg-accent',
            )}
          >
            <input type="radio" name="reason" className="sr-only" checked={value === r} onChange={() => onChange(r)} />
            <span className={cn('h-4 w-4 shrink-0 rounded-full border-2', value === r ? 'border-primary bg-primary shadow-[inset_0_0_0_2px_hsl(var(--card))]' : 'border-muted-foreground/40')} aria-hidden />
            {CANCEL_REASON_LABEL[r]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function OptionCard({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

export function ShiftPickupOption({ booking, options, onDone }: { booking: Booking; options: ChangeOptions['shift']; onDone: (msg: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const shift = useShiftPickup(booking._id);
  return (
    <OptionCard icon={<Clock className="h-5 w-5 text-primary" aria-hidden />} title="Pick up later instead" subtitle={`Same car, same return time, no extra charge. Booked pickup: ${formatDateTime(booking.period.start)}.`}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="New pickup time">
        {options.choices.map((c, i) => (
          <Chip key={c} active={picked === c} onClick={() => setPicked(c)}>
            {timeOnly(c)} <span className="text-xs opacity-80">+{i + 1}h</span>
          </Chip>
        ))}
      </div>
      {shift.isError && <p role="alert" className="text-sm text-destructive">{errorText(shift.error, 'We couldn’t change the pickup time. Try again.')}</p>}
      <Button className="w-full sm:w-auto" disabled={!picked} loading={shift.isPending} onClick={() => picked && shift.mutate(picked, { onSuccess: () => onDone(`Pickup moved to ${formatDateTime(picked)}.`) })}>
        Change pickup time
      </Button>
    </OptionCard>
  );
}

export function MoveDatesOption({ booking, onDone }: { booking: Booking; onDone: (msg: string) => void }) {
  const confirm = useConfirm();
  const [start, setStart] = useState(() => toLocalInput(booking.period.start));
  const [end, setEnd] = useState(() => toLocalInput(booking.period.end));
  const startIso = start ? new Date(start).toISOString() : '';
  const endIso = end ? new Date(end).toISOString() : '';
  const changed = startIso !== new Date(booking.period.start).toISOString() || endIso !== new Date(booking.period.end).toISOString();
  const preview = useQuery({
    queryKey: ['move-preview', booking._id, startIso, endIso],
    queryFn: () => bookingApi.movePreview(booking._id, startIso, endIso),
    enabled: !!startIso && !!endIso && changed,
    retry: false,
  });
  const move = useMoveTrip(booking._id);
  const p = preview.data;
  const diff = p?.difference?.amount ?? 0;
  const diffText = !p?.difference ? '' : diff > 0 ? `${formatMoney(p.difference)} more, charged to your card now` : diff < 0 ? `${formatMoney({ ...p.difference, amount: -diff })} back to your card` : 'No change in price';

  return (
    <OptionCard icon={<CalendarRange className="h-5 w-5 text-primary" aria-hidden />} title="Change your dates" subtitle="Keep this car on new dates. You can do this once per trip.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Pickup" htmlFor="move-start"><Input id="move-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Return" htmlFor="move-end"><Input id="move-end" type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      {changed && preview.isFetching && <Skeleton className="h-5 w-48" />}
      {changed && p && !p.available && <p role="alert" className="text-sm text-destructive">{p.reason}</p>}
      {changed && p?.available && (
        <div className="flex items-center justify-between gap-3 rounded-sm bg-muted px-4 py-3 text-sm">
          <span className="text-muted-foreground">New total {formatMoney(p.newTotal)}</span>
          <span className="font-semibold tabular-nums">{diffText}</span>
        </div>
      )}
      {preview.isError && <p role="alert" className="text-sm text-destructive">We couldn’t check those dates. Try again.</p>}
      {move.isError && <p role="alert" className="text-sm text-destructive">{errorText(move.error, 'We couldn’t change your dates. Try again.')}</p>}
      <Button
        className="w-full sm:w-auto"
        disabled={!changed || !p?.available}
        loading={move.isPending}
        onClick={async () => {
          if (!p?.available) return;
          const { ok } = await confirm({
            title: 'Change your dates?',
            description: `Your trip moves to ${formatDateTime(p.start)} – ${formatDateTime(p.end)}. ${diffText}.`,
            confirmLabel: diff > 0 ? `Pay ${formatMoney(p.difference)} & change` : 'Change dates',
          });
          if (ok) move.mutate({ start: p.start, end: p.end }, { onSuccess: () => onDone('Your trip dates changed.') });
        }}
      >
        Change dates
      </Button>
    </OptionCard>
  );
}

export function SwitchCarOption({ booking, onDone }: { booking: Booking; onDone: (msg: string) => void }) {
  const confirm = useConfirm();
  const options = useQuery({ queryKey: ['switch-options', booking._id], queryFn: () => bookingApi.switchOptions(booking._id), retry: false });
  const switchCar = useSwitchCar(booking._id);
  const cars = options.data?.vehicles ?? [];
  return (
    <OptionCard icon={<Car className="h-5 w-5 text-primary" aria-hidden />} title="Switch to a similar car" subtitle="Same dates, same price. Only cars free for your whole trip are shown.">
      {options.isLoading && <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-20 w-full rounded-sm" /><Skeleton className="h-20 w-full rounded-sm" /></div>}
      {options.isError && <p role="alert" className="text-sm text-destructive">We couldn’t load similar cars. <button className="underline" onClick={() => options.refetch()}>Try again</button></p>}
      {options.data && cars.length === 0 && <p className="text-sm text-muted-foreground">{options.data.reason ?? 'No similar car is free on your dates at the same price right now.'}</p>}
      {cars.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cars.map((v) => {
            const photo = v.photos?.find((ph) => ph.isCover)?.url ?? v.photos?.[0]?.url;
            const name = `${v.year} ${v.make} ${v.model}`;
            const busy = switchCar.isPending && switchCar.variables === v._id;
            return (
              <li key={v._id} className="flex min-w-0 items-center gap-3 rounded-sm border border-border p-2">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" width={96} height={64} loading="lazy" className="h-16 w-24 shrink-0 rounded-sm object-cover" />
                ) : (
                  <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-sm bg-muted"><Car className="h-6 w-6 text-muted-foreground" aria-hidden /></div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold">{name}</p>
                  <p className="text-xs text-muted-foreground">{v.seats ? `${v.seats} seats · ` : ''}{v.transmission ?? ''}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  loading={busy}
                  disabled={switchCar.isPending}
                  onClick={async () => {
                    const { ok } = await confirm({ title: `Switch to the ${name}?`, description: 'Same dates and price. Your current car is released for other guests.', confirmLabel: 'Switch car' });
                    if (ok) switchCar.mutate(v._id, { onSuccess: () => onDone(`You’re now driving the ${name}.`) });
                  }}
                >
                  Choose
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {switchCar.isError && <p role="alert" className="text-sm text-destructive">{errorText(switchCar.error, 'We couldn’t switch your car. Try again.')}</p>}
    </OptionCard>
  );
}

/** Refund to the card, or keep it as credit with a bonus: the exact amounts, then one confirm. */
export function CancelOption({
  options,
  exceptionNext,
  pending,
  error,
  onCancel,
}: {
  options: ChangeOptions['cancel'];
  exceptionNext: boolean;
  pending: boolean;
  error: unknown;
  onCancel: (choice: 'refund' | 'credit') => void;
}) {
  const confirm = useConfirm();
  const [choice, setChoice] = useState<'refund' | 'credit'>('refund');
  const nothingBack = options.refund.amount === 0;
  const keptLine = options.nonRefundable.amount > 0 ? `${formatMoney(options.nonRefundable)} is kept under the cancellation policy.` : 'You get everything back.';

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><X className="h-5 w-5 text-destructive" aria-hidden />Cancel the trip</CardTitle>
        <p className="text-sm text-muted-foreground">
          You paid {formatMoney(options.total)}. {keptLine}
          {options.fullRefundUntil && !options.isFullRefund && <> A full refund was available until {formatDateTime(options.fullRefundUntil)}.</>}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!nothingBack && (
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Where your refund goes">
            <RefundChoice active={choice === 'refund'} onSelect={() => setChoice('refund')} icon={<Wallet className="h-4 w-4" aria-hidden />} title={`${formatMoney(options.refund)} to your card`} detail="Shows in 5–10 business days." />
            {options.credit.enabled && (
              <RefundChoice
                active={choice === 'credit'}
                onSelect={() => setChoice('credit')}
                icon={<Gift className="h-4 w-4" aria-hidden />}
                title={`${formatMoney(options.credit.amount)} CatoDrive credit`}
                detail={options.credit.bonus.amount > 0 ? `Includes a ${formatMoney(options.credit.bonus)} bonus. Ready now, for any trip.` : 'Ready now, for any trip.'}
                highlight={options.credit.bonus.amount > 0}
              />
            )}
          </div>
        )}
        {exceptionNext && (
          <p className="rounded-sm bg-muted px-4 py-3 text-sm text-muted-foreground">
            After cancelling you can send us proof (like an airline email or a doctor’s note) and we’ll review whether more can be refunded.
          </p>
        )}
        {!!error && <p role="alert" className="text-sm text-destructive">{errorText(error, 'We couldn’t cancel your trip. Try again.')}</p>}
        <Button
          variant="destructive"
          className="w-full sm:w-auto"
          loading={pending}
          onClick={async () => {
            const back = choice === 'credit' ? `${formatMoney(options.credit.amount)} goes to your CatoDrive credit now.` : nothingBack ? 'Nothing is refunded.' : `${formatMoney(options.refund)} goes back to your card.`;
            const { ok } = await confirm({ title: 'Cancel this trip?', description: `${back} This can’t be undone.`, confirmLabel: 'Cancel trip', tone: 'destructive' });
            if (ok) onCancel(choice);
          }}
        >
          Cancel trip
        </Button>
      </CardContent>
    </Card>
  );
}

function RefundChoice({ active, onSelect, icon, title, detail, highlight }: { active: boolean; onSelect: () => void; icon: React.ReactNode; title: string; detail: string; highlight?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'flex min-w-0 flex-col items-start gap-1 rounded-sm border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent',
      )}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">{icon}<span className="tabular-nums">{title}</span></span>
      <span className={cn('text-xs', highlight ? 'font-medium text-success' : 'text-muted-foreground')}>{detail}</span>
    </button>
  );
}

/** After a late cancellation: ask for a review with proof. */
export function ExceptionForm({
  bookingId,
  reasons,
  proofRequired,
  initialReason,
  onDone,
  onSkip,
}: {
  bookingId: string;
  reasons: ExceptionReasonCode[];
  proofRequired: boolean;
  initialReason?: ExceptionReasonCode;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [reason, setReason] = useState<ExceptionReasonCode>(initialReason ?? reasons[0]);
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const request = useRequestException(bookingId);
  const tooMany = files.length > 5;
  const canSend = !tooMany && (!proofRequired || files.length > 0);

  const submit = async () => {
    setUploadError(null);
    setUploading(true);
    let keys: string[] = [];
    try {
      // One file per upload: each keeps its own type (PDF or photo).
      keys = (await Promise.all(files.map((f) => uploadFiles('claim', [f])))).flat().map((u) => u.key);
    } catch (e) {
      setUploadError(e instanceof Error ? safeMessage(e.message) : 'A file could not be uploaded.');
      setUploading(false);
      return;
    }
    setUploading(false);
    request.mutate({ reasonCode: reason, note: note.trim() || undefined, proofKeys: keys }, { onSuccess: onDone });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><FileUp className="h-5 w-5 text-primary" aria-hidden />Ask us to review this cancellation</CardTitle>
        <p className="text-sm text-muted-foreground">If something outside your control stopped the trip, send proof and our team will decide within a day.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="What happened?" htmlFor="ex-reason">
          <select id="ex-reason" value={reason} onChange={(e) => setReason(e.target.value as ExceptionReasonCode)} className="h-10 w-full rounded-sm border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {reasons.map((r) => <option key={r} value={r}>{EXCEPTION_REASON_LABEL[r]}</option>)}
          </select>
        </Field>
        <Field label="Details (optional)" htmlFor="ex-note" hint="Flight number, dates, anything that helps.">
          <Textarea id="ex-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label={proofRequired ? 'Proof' : 'Proof (optional)'} htmlFor="ex-files" hint="Airline email, weather alert or doctor’s note. PDF, JPG or PNG, up to 5 files." error={tooMany ? 'Add up to 5 files.' : undefined}>
          <Input id="ex-files" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </Field>
        {(uploadError || request.isError) && <p role="alert" className="text-sm text-destructive">{uploadError ?? errorText(request.error, 'We couldn’t send your request. Try again.')}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onSkip}>Not now</Button>
          <Button disabled={!canSend} loading={uploading || request.isPending} onClick={submit}>Send for review</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** The options a reason leads with, filtered to what this trip can actually do. */
export function useLeadingOptions(reason: CancelReasonCode | null, o?: ChangeOptions) {
  return useMemo(() => {
    if (!o || !reason) return [] as ('shift' | 'move' | 'switch')[];
    const can = { shift: o.shift.available, move: o.move.available, switch: o.switchCar.available };
    return RECOMMENDED[reason].filter((k) => can[k]);
  }, [reason, o]);
}
