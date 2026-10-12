import { useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Button, Card, Input, Text, space, useConfirm } from '@catodrive/ui';
import { hostTripsApi, type HostTrip } from '@catodrive/core/web/features/host/trips.api';
import { formatMoney, kmToMiles, perKmToPerMile } from '@catodrive/core/web/lib/utils/format';

const miles = (v: number) => `${kmToMiles(v).toLocaleString()} miles`;

/** Ending a trip in progress (`mode="end"`), or confirming a return the guest already ended (`mode="confirm"`). */
export function CheckoutPanel({ t, mode, onDone }: { t: HostTrip; mode: 'end' | 'confirm'; onDone: () => void }) {
  const confirm = useConfirm();
  const [odoEnd, setOdoEnd] = useState('');
  const [fuelEnd, setFuelEnd] = useState('');
  const unlimited = t.mileage.includedKm === 0;

  const complete = useMutation({
    mutationFn: () => hostTripsApi.complete(t.tripId!, { odometerEnd: Number(odoEnd), ...(fuelEnd ? { fuelEnd: Number(fuelEnd) } : {}) }),
    onSuccess: onDone,
  });
  const confirmReturn = useMutation({
    mutationFn: () => hostTripsApi.confirmReturn(t.tripId!, { ...(odoEnd ? { odometerEnd: Number(odoEnd) } : {}), ...(fuelEnd ? { fuelEnd: Number(fuelEnd) } : {}) }),
    onSuccess: onDone,
  });

  const doEnd = async () => {
    const { ok } = await confirm({
      title: 'End this trip?',
      description: unlimited
        ? 'The trip will be marked complete and your payout scheduled.'
        : `If the guest drove past the ${miles(t.mileage.includedKm)} included, they are automatically charged ${formatMoney({ amount: perKmToPerMile(t.mileage.overageFeePerKm), currency: t.currency })} per extra mile. This cannot be undone.`,
      confirmLabel: 'End trip',
      tone: 'destructive',
    });
    if (ok) complete.mutate();
  };

  const isConfirm = mode === 'confirm';
  return (
    <Card>
      <Text variant="heading">{isConfirm ? 'Confirm return' : 'End trip'}</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
        {isConfirm
          ? 'Your guest ended the trip. Check the car, correct the readings if they are wrong, then confirm. Your payout and the guest’s deposit wait for this; report any problem instead of confirming.'
          : 'Inspect and document your car’s condition after your guest’s trip.'}
      </Text>
      <View style={{ gap: space.sm, marginTop: space.md }}>
        <Input
          label="Ending odometer (miles)"
          keyboardType="number-pad"
          value={odoEnd}
          onChangeText={(v) => setOdoEnd(v.replace(/\D/g, ''))}
          placeholder={isConfirm ? 'Leave blank to accept the guest’s' : 'e.g. 41250'}
        />
        <Input
          label="Fuel level (%)"
          keyboardType="number-pad"
          value={fuelEnd}
          onChangeText={(v) => setFuelEnd(v.replace(/\D/g, '').slice(0, 3))}
          placeholder={isConfirm ? 'Leave blank to accept the guest’s' : 'e.g. 80'}
        />
        {isConfirm ? (
          <Button title="Confirm return" loading={confirmReturn.isPending} onPress={() => confirmReturn.mutate()} />
        ) : (
          <Button title="Start checkout" disabled={!odoEnd} loading={complete.isPending} onPress={() => void doEnd()} />
        )}
      </View>
    </Card>
  );
}
