import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, Car, Clock, FileUp, ShieldCheck, X } from 'lucide-react-native';
import { Button, Card, Chip, Input, RadioCard, Skeleton, Text, useConfirm, useTheme, radius, space } from '@catodrive/ui';
import { pickPhotos, uploadPhotos, type PickedPhoto } from '@catodrive/core';
import { bookingApi } from '@catodrive/core/web/features/bookings/api';
import { useMoveTrip, useRequestException, useShiftPickup, useSwitchCar } from '@catodrive/core/web/features/bookings/queries';
import { CANCEL_REASON_LABEL, EXCEPTION_REASON_LABEL } from '@catodrive/core/web/features/bookings/status';
import type { Booking, CancelReasonCode, ChangeOptions, ExceptionReasonCode } from '@catodrive/core/web/features/bookings/types';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatDateTime, formatMoney } from '@catodrive/core/web/lib/utils/format';
import { DateTimeSheet } from './DateTimeSheet';
import { safeMessage } from '@catodrive/core/web/lib/utils/safe-message';

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const pad = (n: number) => String(n).padStart(2, '0');
const toLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const timeOnly = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Which options lead for each reason; the rest sit under "Other options". */
const RECOMMENDED: Record<CancelReasonCode, ('shift' | 'move' | 'switch')[]> = {
  flight_delayed: ['shift', 'move'],
  plans_changed: ['move', 'shift'],
  found_other_car: ['switch'],
  price: ['switch'],
  flight_cancelled: ['move'],
  weather: ['move'],
  health: ['move'],
  other: ['move', 'shift', 'switch'],
};

export function useLeadingOptions(reason: CancelReasonCode | null, o?: ChangeOptions) {
  return useMemo(() => {
    if (!o || !reason) return [] as ('shift' | 'move' | 'switch')[];
    const can = { shift: o.shift.available, move: o.move.available, switch: o.switchCar.available };
    return RECOMMENDED[reason].filter((k) => can[k]);
  }, [reason, o]);
}

function Heading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <View style={{ gap: 4, marginBottom: space.md }}>
      <View style={styles.row}>{icon}<Text variant="heading" style={{ flex: 1 }}>{title}</Text></View>
      <Text variant="caption" tone="muted">{subtitle}</Text>
    </View>
  );
}

export function UndoBanner({ endsAt, onExpire }: { endsAt: string; onExpire: () => void }) {
  const { c } = useTheme();
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
    <View accessibilityRole="summary" style={[styles.banner, { backgroundColor: c.successSoft, borderColor: c.success }]}>
      <ShieldCheck size={20} color={c.success} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">Free cancellation for {m}:{pad(s)}</Text>
        <Text variant="caption" tone="muted">You just booked, so you can still cancel for a full refund.</Text>
      </View>
    </View>
  );
}

export function ReasonPicker({ reasons, value, onChange }: { reasons: CancelReasonCode[]; value: CancelReasonCode | null; onChange: (r: CancelReasonCode) => void }) {
  const ordered = (Object.keys(CANCEL_REASON_LABEL) as CancelReasonCode[]).filter((r) => reasons.includes(r));
  return (
    <Card>
      <Text variant="heading" style={{ marginBottom: space.md }}>What’s changed?</Text>
      <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
        {ordered.map((r) => <RadioCard key={r} selected={value === r} onPress={() => onChange(r)} title={CANCEL_REASON_LABEL[r]} />)}
      </View>
    </Card>
  );
}

export function ShiftPickupOption({ booking, options, onDone }: { booking: Booking; options: ChangeOptions['shift']; onDone: (msg: string) => void }) {
  const { c } = useTheme();
  const [picked, setPicked] = useState<string | null>(null);
  const shift = useShiftPickup(booking._id);
  return (
    <Card>
      <Heading icon={<Clock size={18} color={c.primary} />} title="Pick up later instead" subtitle={`Same car, same return time, no extra charge. Booked pickup: ${formatDateTime(booking.period.start)}.`} />
      <View style={[styles.row, { marginBottom: space.md }]}>
        {options.choices.map((ch, i) => <Chip key={ch} label={`${timeOnly(ch)} (+${i + 1}h)`} selected={picked === ch} onPress={() => setPicked(ch)} />)}
      </View>
      {shift.isError ? <Text variant="caption" tone="destructive" style={{ marginBottom: space.sm }}>{errorText(shift.error, 'We couldn’t change the pickup time. Try again.')}</Text> : null}
      <Button title="Change pickup time" disabled={!picked} loading={shift.isPending} onPress={() => picked && shift.mutate(picked, { onSuccess: () => onDone(`Pickup moved to ${formatDateTime(picked)}.`) })} />
    </Card>
  );
}

export function MoveDatesOption({ booking, onDone }: { booking: Booking; onDone: (msg: string) => void }) {
  const { c } = useTheme();
  const confirm = useConfirm();
  const [start, setStart] = useState(() => toLocal(booking.period.start));
  const [end, setEnd] = useState(() => toLocal(booking.period.end));
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);
  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();
  const changed = startIso !== new Date(booking.period.start).toISOString() || endIso !== new Date(booking.period.end).toISOString();
  const preview = useQuery({
    queryKey: ['move-preview', booking._id, startIso, endIso],
    queryFn: () => bookingApi.movePreview(booking._id, startIso, endIso),
    enabled: changed,
    retry: false,
  });
  const move = useMoveTrip(booking._id);
  const p = preview.data;
  const diff = p?.difference?.amount ?? 0;
  const diffText = !p?.difference ? '' : diff > 0 ? `${formatMoney(p.difference)} more, charged now` : diff < 0 ? `${formatMoney({ ...p.difference, amount: -diff })} back to your card` : 'No change in price';

  return (
    <Card>
      <Heading icon={<CalendarRange size={18} color={c.primary} />} title="Change your dates" subtitle="Keep this car on new dates. You can do this once per trip." />
      <View style={{ gap: space.sm }}>
        <Button title={`Pickup: ${formatDateTime(new Date(start))}`} variant="outline" onPress={() => setPicking('start')} />
        <Button title={`Return: ${formatDateTime(new Date(end))}`} variant="outline" onPress={() => setPicking('end')} />
        {changed && preview.isFetching ? <Skeleton height={20} /> : null}
        {changed && p && !p.available ? <Text variant="caption" tone="destructive">{p.reason}</Text> : null}
        {changed && p?.available ? (
          <View style={[styles.summary, { backgroundColor: c.muted }]}>
            <Text variant="caption" tone="muted">New total {formatMoney(p.newTotal)}</Text>
            <Text variant="label">{diffText}</Text>
          </View>
        ) : null}
        {preview.isError ? <Text variant="caption" tone="destructive">We couldn’t check those dates. Try again.</Text> : null}
        {move.isError ? <Text variant="caption" tone="destructive">{errorText(move.error, 'We couldn’t change your dates. Try again.')}</Text> : null}
        <Button
          title="Change dates"
          disabled={!changed || !p?.available}
          loading={move.isPending}
          onPress={async () => {
            if (!p?.available) return;
            const { ok } = await confirm({
              title: 'Change your dates?',
              description: `Your trip moves to ${formatDateTime(p.start)} – ${formatDateTime(p.end)}. ${diffText}.`,
              confirmLabel: diff > 0 ? `Pay ${formatMoney(p.difference)} & change` : 'Change dates',
            });
            if (ok) move.mutate({ start: p.start, end: p.end }, { onSuccess: () => onDone('Your trip dates changed.') });
          }}
        />
      </View>
      <DateTimeSheet
        visible={picking !== null}
        title={picking === 'end' ? 'New return' : 'New pickup'}
        earliest={picking === 'end' ? new Date(start) : new Date()}
        initial={picking === 'end' ? end : start}
        onClose={() => setPicking(null)}
        onPick={(local) => {
          if (picking === 'start') setStart(local);
          else setEnd(local);
          setPicking(null);
        }}
      />
    </Card>
  );
}

export function SwitchCarOption({ booking, onDone }: { booking: Booking; onDone: (msg: string) => void }) {
  const { c } = useTheme();
  const confirm = useConfirm();
  const options = useQuery({ queryKey: ['switch-options', booking._id], queryFn: () => bookingApi.switchOptions(booking._id), retry: false });
  const switchCar = useSwitchCar(booking._id);
  const cars = options.data?.vehicles ?? [];
  return (
    <Card>
      <Heading icon={<Car size={18} color={c.primary} />} title="Switch to a similar car" subtitle="Same dates, same price. Only cars free for your whole trip are shown." />
      {options.isLoading ? <View style={{ gap: space.sm }}><Skeleton height={72} /><Skeleton height={72} /></View> : null}
      {options.isError ? <Button title="Couldn’t load cars. Try again" variant="outline" onPress={() => void options.refetch()} /> : null}
      {options.data && cars.length === 0 ? <Text variant="caption" tone="muted">{options.data.reason ?? 'No similar car is free on your dates at the same price right now.'}</Text> : null}
      <View style={{ gap: space.sm }}>
        {cars.map((v) => {
          const photo = v.photos?.find((ph) => ph.isCover)?.url ?? v.photos?.[0]?.url;
          const name = `${v.year} ${v.make} ${v.model}`;
          return (
            <View key={v._id} style={[styles.car, { borderColor: c.border }]}>
              {photo ? <Image source={{ uri: photo }} style={styles.thumb} contentFit="cover" accessibilityIgnoresInvertColors /> : <View style={[styles.thumb, styles.center, { backgroundColor: c.muted }]}><Car size={22} color={c.mutedForeground} /></View>}
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" numberOfLines={2}>{name}</Text>
                <Text variant="caption" tone="muted">{v.seats ? `${v.seats} seats · ` : ''}{v.transmission ?? ''}</Text>
              </View>
              <Button
                title="Choose"
                size="sm"
                variant="outline"
                full={false}
                loading={switchCar.isPending && switchCar.variables === v._id}
                disabled={switchCar.isPending}
                onPress={async () => {
                  const { ok } = await confirm({ title: `Switch to the ${name}?`, description: 'Same dates and price. Your current car is released for other guests.', confirmLabel: 'Switch car' });
                  if (ok) switchCar.mutate(v._id, { onSuccess: () => onDone(`You’re now driving the ${name}.`) });
                }}
              />
            </View>
          );
        })}
      </View>
      {switchCar.isError ? <Text variant="caption" tone="destructive" style={{ marginTop: space.sm }}>{errorText(switchCar.error, 'We couldn’t switch your car. Try again.')}</Text> : null}
    </Card>
  );
}

export function CancelOption({ options, exceptionNext, pending, error, onCancel }: { options: ChangeOptions['cancel']; exceptionNext: boolean; pending: boolean; error: unknown; onCancel: (choice: 'refund' | 'credit') => void }) {
  const { c } = useTheme();
  const confirm = useConfirm();
  const [choice, setChoice] = useState<'refund' | 'credit'>('refund');
  const nothingBack = options.refund.amount === 0;
  const keptLine = options.nonRefundable.amount > 0 ? `${formatMoney(options.nonRefundable)} is kept under the cancellation policy.` : 'You get everything back.';
  return (
    <Card style={{ borderColor: c.destructive }}>
      <Heading icon={<X size={18} color={c.destructive} />} title="Cancel the trip" subtitle={`You paid ${formatMoney(options.total)}. ${keptLine}${options.fullRefundUntil && !options.isFullRefund ? ` A full refund was available until ${formatDateTime(options.fullRefundUntil)}.` : ''}`} />
      <View style={{ gap: space.sm }}>
        {!nothingBack ? (
          <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
            <RadioCard selected={choice === 'refund'} onPress={() => setChoice('refund')} title={`${formatMoney(options.refund)} to your card`} detail="Shows in 5–10 business days." />
            {options.credit.enabled ? (
              <RadioCard
                selected={choice === 'credit'}
                onPress={() => setChoice('credit')}
                title={`${formatMoney(options.credit.amount)} CatoDrive credit`}
                detail={options.credit.bonus.amount > 0 ? `Includes a ${formatMoney(options.credit.bonus)} bonus. Ready now, for any trip.` : 'Ready now, for any trip.'}
              />
            ) : null}
          </View>
        ) : null}
        {exceptionNext ? <Text variant="caption" tone="muted">After cancelling you can send us proof (like an airline email) and we’ll review whether more can be refunded.</Text> : null}
        {error ? <Text variant="caption" tone="destructive">{errorText(error, 'We couldn’t cancel your trip. Try again.')}</Text> : null}
        <Button
          title="Cancel trip"
          variant="destructive"
          loading={pending}
          onPress={async () => {
            const back = choice === 'credit' ? `${formatMoney(options.credit.amount)} goes to your CatoDrive credit now.` : nothingBack ? 'Nothing is refunded.' : `${formatMoney(options.refund)} goes back to your card.`;
            const { ok } = await confirm({ title: 'Cancel this trip?', description: `${back} This can’t be undone.`, confirmLabel: 'Cancel trip', tone: 'destructive' });
            if (ok) onCancel(choice);
          }}
        />
      </View>
    </Card>
  );
}

export function ExceptionForm({ bookingId, reasons, proofRequired, initialReason, onDone, onSkip }: { bookingId: string; reasons: ExceptionReasonCode[]; proofRequired: boolean; initialReason?: ExceptionReasonCode; onDone: () => void; onSkip: () => void }) {
  const { c } = useTheme();
  const [reason, setReason] = useState<ExceptionReasonCode>(initialReason ?? reasons[0]);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const request = useRequestException(bookingId);
  const canSend = photos.length <= 5 && (!proofRequired || photos.length > 0);

  const add = async () => {
    const picked = await pickPhotos('library');
    if (picked?.length) setPhotos((p) => [...p, ...picked].slice(0, 5));
  };
  const submit = async () => {
    setUploadError(null);
    setUploading(true);
    let keys: string[] = [];
    try {
      keys = (await uploadPhotos('claim', photos)).map((u) => u.key);
    } catch (e) {
      setUploadError(e instanceof Error ? safeMessage(e.message) : 'A photo didn’t upload.');
      setUploading(false);
      return;
    }
    setUploading(false);
    request.mutate({ reasonCode: reason, note: note.trim() || undefined, proofKeys: keys }, { onSuccess: onDone });
  };

  return (
    <Card>
      <Heading icon={<FileUp size={18} color={c.primary} />} title="Ask us to review this cancellation" subtitle="If something outside your control stopped the trip, send proof and our team will decide within a day." />
      <View style={{ gap: space.sm }}>
        <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
          {reasons.map((r) => <RadioCard key={r} selected={reason === r} onPress={() => setReason(r)} title={EXCEPTION_REASON_LABEL[r]} />)}
        </View>
        <Input label="Details (optional)" placeholder="Flight number, dates, anything that helps" value={note} onChangeText={setNote} multiline maxLength={1000} />
        <Text variant="label">{proofRequired ? 'Proof' : 'Proof (optional)'}</Text>
        <Text variant="caption" tone="muted">A photo or screenshot of the airline email, weather alert or doctor’s note. Up to 5.</Text>
        {photos.length ? (
          <View style={styles.row}>
            {photos.map((ph, i) => (
              <View key={ph.uri} style={styles.proof}>
                <Image source={{ uri: ph.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <Button title="Remove" size="sm" variant="ghost" full={false} onPress={() => setPhotos((p) => p.filter((_, j) => j !== i))} />
              </View>
            ))}
          </View>
        ) : null}
        {photos.length < 5 ? <Button title={photos.length ? 'Add another' : 'Add photo'} variant="outline" onPress={() => void add()} /> : null}
        {uploadError || request.isError ? <Text variant="caption" tone="destructive">{uploadError ?? errorText(request.error, 'We couldn’t send your request. Try again.')}</Text> : null}
        <Button title="Send for review" disabled={!canSend} loading={uploading || request.isPending} onPress={() => void submit()} />
        <Button title="Not now" variant="ghost" onPress={onSkip} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  banner: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, alignItems: 'flex-start' },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md },
  car: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, borderWidth: 1, borderRadius: radius.md },
  thumb: { width: 84, height: 56, borderRadius: radius.sm },
  center: { alignItems: 'center', justifyContent: 'center' },
  proof: { width: 96, height: 96, borderRadius: radius.md, overflow: 'hidden', justifyContent: 'flex-end' },
});
