import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react-native';
import { Button, EmptyState, ErrorState, Screen, ScreenHeader, Skeleton, Text, useTheme, useToast, space } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { bookingApi } from '@catodrive/core/web/features/bookings/api';
import { useCancelBooking, useChangeOptions } from '@catodrive/core/web/features/bookings/queries';
import { CANCEL_REASON_LABEL, EXCEPTION_ELIGIBLE } from '@catodrive/core/web/features/bookings/status';
import type { CancelReasonCode, ExceptionReasonCode } from '@catodrive/core/web/features/bookings/types';
import { formatDateTime } from '@catodrive/core/web/lib/utils/format';
import { CancelOption, ExceptionForm, MoveDatesOption, ReasonPicker, ShiftPickupOption, SwitchCarOption, UndoBanner, useLeadingOptions } from '@/features/bookings/ChangeTrip';

type Step = 'options' | 'exception' | 'done';

function ChangeTrip({ id }: { id: string }) {
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const booking = useQuery({ queryKey: ['booking', id], queryFn: () => bookingApi.getById(id), retry: false });
  const options = useChangeOptions(id);
  const cancel = useCancelBooking();
  const [reason, setReason] = useState<CancelReasonCode | null>(null);
  const [step, setStep] = useState<Step>('options');
  const leading = useLeadingOptions(reason, options.data);
  const refetchOptions = useCallback(() => void options.refetch(), [options]);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/bookings/${id}`));
  const header = <ScreenHeader title="Cancel or change trip" onBack={goBack} />;

  const finished = (msg: string) => {
    toast({ tone: 'success', title: msg });
    router.replace(`/bookings/${id}`);
  };

  if (booking.isPending || options.isPending) {
    return (
      <Screen header={header}>
        <Skeleton height={80} />
        <Skeleton height={260} />
      </Screen>
    );
  }
  if (booking.isError || options.isError || !booking.data || !options.data) {
    return (
      <Screen header={header}>
        <ErrorState message="We couldn’t load your trip options." onRetry={() => { void booking.refetch(); void options.refetch(); }} />
      </Screen>
    );
  }

  const b = booking.data;
  const o = options.data;

  if (step === 'done') {
    return (
      <Screen header={header}>
        <EmptyState icon={<CheckCircle2 size={28} color={c.success} />} title="Request sent" body="We’ll review your proof and reply within a day. Any extra refund goes back to your card." actionLabel="Back to trip" onAction={() => router.replace(`/bookings/${id}`)} />
      </Screen>
    );
  }

  if (step === 'exception') {
    const initial = reason && (o.exception.reasons as string[]).includes(reason) ? (reason as ExceptionReasonCode) : undefined;
    return (
      <Screen header={<ScreenHeader title="Trip cancelled" onBack={() => router.replace(`/bookings/${id}`)} />}>
        <Text tone="muted">Your refund is on its way. If something outside your control caused this, tell us below.</Text>
        <ExceptionForm
          bookingId={id}
          reasons={o.exception.reasons}
          proofRequired={o.exception.proofRequired}
          initialReason={initial}
          onDone={() => setStep('done')}
          onSkip={() => router.replace(`/bookings/${id}`)}
        />
      </Screen>
    );
  }

  if (!o.cancel.cancellable) {
    return (
      <Screen header={header}>
        <EmptyState title="This trip can’t be changed" body="It has already started, ended or been cancelled. Message support if you need help." actionLabel="Get help" onAction={() => router.push({ pathname: '/support', params: { bookingId: id } })} />
      </Screen>
    );
  }

  const others = (['shift', 'move', 'switch'] as const).filter((k) => !leading.includes(k) && (k === 'shift' ? o.shift.available : k === 'move' ? o.move.available : o.switchCar.available));
  const render = (k: 'shift' | 'move' | 'switch') =>
    k === 'shift' ? <ShiftPickupOption key={k} booking={b} options={o.shift} onDone={finished} />
      : k === 'move' ? <MoveDatesOption key={k} booking={b} onDone={finished} />
        : <SwitchCarOption key={k} booking={b} onDone={finished} />;
  const exceptionNext = !!reason && EXCEPTION_ELIGIBLE.includes(reason) && o.exception.enabled && !o.cancel.isFullRefund;

  return (
    <Screen header={header}>
      <Text variant="caption" tone="muted">{b.code} · {formatDateTime(b.period.start)} – {formatDateTime(b.period.end)}</Text>
      {o.cancel.undo.active && o.cancel.undo.endsAt ? <UndoBanner endsAt={o.cancel.undo.endsAt} onExpire={refetchOptions} /> : null}
      <ReasonPicker reasons={o.reasons} value={reason} onChange={setReason} />
      {reason ? (
        <View style={{ gap: space.lg }}>
          {leading.length ? <Text variant="label" tone="muted">Keep your trip instead</Text> : null}
          {leading.map(render)}
          <CancelOption
            options={o.cancel}
            exceptionNext={exceptionNext}
            pending={cancel.isPending}
            error={cancel.error}
            onCancel={(choice) =>
              cancel.mutate(
                { id, reason: CANCEL_REASON_LABEL[reason], reasonCode: reason, choice },
                { onSuccess: () => (exceptionNext && o.cancel.nonRefundable.amount > 0 ? setStep('exception') : finished('Trip cancelled.')) },
              )
            }
          />
          {others.length ? <Text variant="label" tone="muted">Other options</Text> : null}
          {others.map(render)}
        </View>
      ) : null}
      {!reason ? <Button title="Back to trip" variant="ghost" onPress={goBack} /> : null}
    </Screen>
  );
}

export default function ChangeTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireAuth>
      <ChangeTrip id={id} />
    </RequireAuth>
  );
}
