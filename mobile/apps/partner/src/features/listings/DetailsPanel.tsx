import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Text, space } from '@catodrive/ui';
import { vehicleApi } from '@catodrive/core/web/features/vehicles/api';
import type { Vehicle } from '@catodrive/core/web/features/vehicles/types';
import { detailsForm, detailsPatch, type DetailsForm } from '@catodrive/core/web/features/vehicles/listing-form';
import { ColorPicker } from './ColorPicker';
import { FeaturePicker } from './FeaturePicker';

/** Title, description, plate, doors, odometer, colour and features; then the VIN check. */
export function DetailsPanel({ vehicle, onSave, saving }: { vehicle: Vehicle; onSave: (patch: Record<string, unknown>) => void; saving: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<DetailsForm>(() => detailsForm(vehicle));
  const [vin, setVin] = useState('');
  const set = <K extends keyof DetailsForm>(k: K) => (v: DetailsForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const verifyVin = useMutation({
    mutationFn: () => vehicleApi.verifyVin(vehicle._id, vin),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vehicle', vehicle._id] });
      void qc.invalidateQueries({ queryKey: ['my-vehicles'] });
    },
  });

  return (
    <View style={{ gap: space.md }}>
      <Input label="Listing title" value={form.title} onChangeText={set('title')} />
      <Input label="Description" value={form.description} onChangeText={set('description')} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
      <Input label="License plate" hint="Plate number and state, e.g. XCW2O63 (TX)" value={form.plate} onChangeText={(t) => set('plate')(t.toUpperCase())} placeholder="XCW2O63 (TX)" autoCapitalize="characters" />
      <Input label="Doors" keyboardType="number-pad" value={form.doors} onChangeText={(t) => set('doors')(t.replace(/\D/g, ''))} />
      <Input label="Odometer (miles)" keyboardType="number-pad" value={form.odometerMiles} onChangeText={(t) => set('odometerMiles')(t.replace(/\D/g, ''))} />
      <Text variant="label">Color</Text>
      <Text variant="caption" tone="muted">Guests filter by this, so pick the closest match</Text>
      <ColorPicker value={form.color} onChange={set('color')} />
      <Text variant="label">Features</Text>
      <FeaturePicker value={form.features} onChange={set('features')} />
      <Button title="Save details" size="sm" loading={saving} disabled={!form.title.trim()} onPress={() => onSave(detailsPatch(form))} />
      {vehicle.vinVerified ? (
        <Text variant="label" tone="success">✓ VIN verified</Text>
      ) : (
        <View style={{ gap: space.sm }}>
          <Input label="VIN" hint="11–17 characters" value={vin} onChangeText={(t) => setVin(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={17} />
          <Button title="Verify VIN" size="sm" variant="outline" disabled={!vin.trim()} loading={verifyVin.isPending} onPress={() => verifyVin.mutate()} />
        </View>
      )}
    </View>
  );
}
