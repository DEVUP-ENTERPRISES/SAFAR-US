import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, Card, Input, Text, space, useConfirm, useTheme } from '@catodrive/ui';
import { InspectionPhotos } from '@catodrive/core';
import { usePlatformConfig } from '@catodrive/core/web/features/platform/config';
import { START_ERRORS, handoverGates } from '@catodrive/core/web/features/host/trip-handover';
import { hostTripsApi, type HostTrip } from '@catodrive/core/web/features/host/trips.api';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { HandoverStep } from './HandoverStep';
import { VerifyPickup } from './VerifyPickup';

/** The pickup checklist: photos, the guest's code, odometer and fuel, then Start trip. Each step unlocks the next. */
export function CheckInPanel({ t, onChanged }: { t: HostTrip; onChanged: () => void }) {
  const { c } = useTheme();
  const router = useRouter();
  const confirm = useConfirm();
  const cfg = usePlatformConfig().data;
  const [odoStart, setOdoStart] = useState('');
  const [fuelStart, setFuelStart] = useState('');
  const g = handoverGates(t, cfg?.handover, odoStart);

  const start = useMutation({
    meta: { silentError: true },
    mutationFn: () => hostTripsApi.start(t.bookingId, { odometerStart: Number(odoStart), ...(fuelStart ? { fuelStart: Number(fuelStart) } : {}), licenceConfirmed: true }),
    onSuccess: onChanged,
  });

  const doStart = async () => {
    const { ok } = await confirm({
      title: 'Start the trip?',
      description: `Recording ${Number(odoStart).toLocaleString()} miles as the starting odometer. Every mileage charge is measured from this - it cannot be changed afterwards.`,
      confirmLabel: 'Start trip',
    });
    if (ok) start.mutate();
  };

  const code = start.error instanceof ApiError ? start.error.code : undefined;
  const known = code ? START_ERRORS[code] : undefined;

  return (
    <Card>
      <Text variant="heading">Start check-in</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>Work down the steps in order. Each one unlocks when the one before it is done.</Text>
      <View style={{ gap: space.md, marginTop: space.md }}>
        <HandoverStep n={1} title="Inspect the car" status={g.sInspect} summary={g.insp ? `${g.insp.taken}${g.insp.required > 0 ? ` / ${g.insp.required}` : ''} photos` : undefined}>
          <InspectionPhotos bookingId={t.bookingId} phase="pre" />
        </HandoverStep>
        <HandoverStep n={2} title="Guest’s pickup code" status={g.sCode} lockedReason={g.inspectDone ? 'The guest hasn’t finished ID verification yet.' : 'Take the pickup photos first.'}>
          {g.codeDone ? (
            <Text variant="label" tone="success">Guest verified - you can hand over the keys.</Text>
          ) : (
            <VerifyPickup tripId={t.tripId} bookingId={t.bookingId} locked={g.codeLocked} onVerified={onChanged} />
          )}
        </HandoverStep>
        <HandoverStep n={3} title="Odometer and fuel" status={g.sOdo} lockedReason="Finish the steps above first." showWhenLocked>
          <View style={{ gap: space.sm }}>
            <Input label="Starting odometer (miles)" keyboardType="number-pad" value={odoStart} onChangeText={(v) => setOdoStart(v.replace(/\D/g, ''))} placeholder="e.g. 40100" />
            <Input label="Fuel level (%)" keyboardType="number-pad" value={fuelStart} onChangeText={(v) => setFuelStart(v.replace(/\D/g, '').slice(0, 3))} placeholder="e.g. 95" />
          </View>
        </HandoverStep>
        <Button title="Start trip" disabled={!g.canStart} loading={start.isPending} onPress={() => void doStart()} />
        {g.blocker ? <Text variant="caption" tone="muted" center>{g.blocker}</Text> : null}
        {start.isError ? (
          <View style={{ gap: space.xs }}>
            <Text variant="caption" style={{ color: c.destructive }}>
              {known ? known.text : start.error instanceof Error ? start.error.message : 'Could not start the trip.'}
            </Text>
            {code === 'PRE_PHOTOS_REQUIRED' ? (
              <Button title="Take pickup photos" variant="ghost" size="sm" full={false} onPress={() => router.push(`/host/trips/${t.bookingId}/photos`)} />
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
