'use client';

import { use, useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/utils/format';
import { bookingApi } from '@/features/bookings/api';
import { useCancelBooking, useChangeOptions } from '@/features/bookings/queries';
import { CANCEL_REASON_LABEL, EXCEPTION_ELIGIBLE } from '@/features/bookings/status';
import type { CancelReasonCode, ExceptionReasonCode } from '@/features/bookings/types';
import {
  CancelOption,
  ExceptionForm,
  MoveDatesOption,
  ReasonPicker,
  ShiftPickupOption,
  SwitchCarOption,
  UndoBanner,
  useLeadingOptions,
} from '@/features/bookings/components/change-trip';

type Step = 'options' | 'exception' | 'done';

function ChangeTrip({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const booking = useQuery({ queryKey: ['booking', id], queryFn: () => bookingApi.getById(id), retry: false });
  const options = useChangeOptions(id);
  const cancel = useCancelBooking();
  const [reason, setReason] = useState<CancelReasonCode | null>(null);
  const [step, setStep] = useState<Step>('options');
  const [doneText, setDoneText] = useState('');
  const leading = useLeadingOptions(reason, options.data);
  const refetchOptions = useCallback(() => void options.refetch(), [options]);

  const finished = (msg: string) => {
    toast({ tone: 'success', title: msg });
    router.push(`/bookings/${id}`);
  };

  if (booking.isLoading || options.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }
  if (booking.isError || options.isError || !booking.data || !options.data) {
    return (
      <div className="mx-auto max-w-3xl py-6">
        <ErrorState message="We couldn’t load your trip options." retry={() => { booking.refetch(); options.refetch(); }} />
      </div>
    );
  }

  const b = booking.data;
  const o = options.data;
  const back = (
    <Link href={`/bookings/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to trip
    </Link>
  );

  if (step === 'done') {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-6">
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6 text-success" aria-hidden />}
          title="Request sent"
          description={doneText}
          action={<Button onClick={() => router.push(`/bookings/${id}`)}>Back to trip</Button>}
        />
      </div>
    );
  }

  if (step === 'exception') {
    const initial = reason && (o.exception.reasons as string[]).includes(reason) ? (reason as ExceptionReasonCode) : undefined;
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-6">
        <PageHeader title="Trip cancelled" description="Your refund is on its way. If something outside your control caused this, tell us below." />
        <ExceptionForm
          bookingId={id}
          reasons={o.exception.reasons}
          proofRequired={o.exception.proofRequired}
          initialReason={initial}
          onDone={() => {
            setDoneText('We’ll review your proof and reply within a day. Any extra refund goes back to your card.');
            setStep('done');
          }}
          onSkip={() => router.push(`/bookings/${id}`)}
        />
      </div>
    );
  }

  if (!o.cancel.cancellable) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-6">
        {back}
        <EmptyState title="This trip can’t be changed" description="It has already started, ended or been cancelled. Message support if you need help." action={<Button variant="outline" onClick={() => router.push(`/support?bookingId=${id}`)}>Get help</Button>} />
      </div>
    );
  }

  const others = (['shift', 'move', 'switch'] as const).filter(
    (k) => !leading.includes(k) && (k === 'shift' ? o.shift.available : k === 'move' ? o.move.available : o.switchCar.available),
  );
  const render = (k: 'shift' | 'move' | 'switch') =>
    k === 'shift' ? <ShiftPickupOption key={k} booking={b} options={o.shift} onDone={finished} />
      : k === 'move' ? <MoveDatesOption key={k} booking={b} onDone={finished} />
        : <SwitchCarOption key={k} booking={b} onDone={finished} />;
  const exceptionNext = !!reason && EXCEPTION_ELIGIBLE.includes(reason) && o.exception.enabled;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6 pb-24">
      {back}
      <PageHeader title="Cancel or change trip" description={`${b.code} · ${formatDateTime(b.period.start)} – ${formatDateTime(b.period.end)}`} />

      {o.cancel.undo.active && o.cancel.undo.endsAt && <UndoBanner endsAt={o.cancel.undo.endsAt} onExpire={refetchOptions} />}

      <Card>
        <CardContent className="py-5">
          <ReasonPicker reasons={o.reasons} value={reason} onChange={setReason} />
        </CardContent>
      </Card>

      {reason && (
        <>
          {leading.length > 0 && (
            <section className="space-y-3" aria-label="Suggested for you">
              <h2 className="text-sm font-semibold text-muted-foreground">Keep your trip instead</h2>
              {leading.map(render)}
            </section>
          )}
          <CancelOption
            options={o.cancel}
            exceptionNext={exceptionNext && !o.cancel.isFullRefund}
            pending={cancel.isPending}
            error={cancel.error}
            onCancel={(choice) =>
              cancel.mutate(
                { id, reason: CANCEL_REASON_LABEL[reason], reasonCode: reason, choice },
                {
                  onSuccess: () => {
                    if (exceptionNext && !o.cancel.isFullRefund && o.cancel.nonRefundable.amount > 0) setStep('exception');
                    else finished('Trip cancelled.');
                  },
                },
              )
            }
          />
          {others.length > 0 && (
            <section className="space-y-3" aria-label="Other options">
              <h2 className="text-sm font-semibold text-muted-foreground">Other options</h2>
              {others.map(render)}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <ChangeTrip id={id} />
    </AuthGuard>
  );
}
