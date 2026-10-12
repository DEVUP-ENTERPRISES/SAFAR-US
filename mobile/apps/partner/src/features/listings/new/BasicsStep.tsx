import { useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Check } from 'lucide-react-native';
import { Button, Input, Text, space, useTheme } from '@catodrive/ui';
import { hostApi, type RowPreview } from '@catodrive/core/web/features/host/api';
import { BODY_TYPE_OPTIONS, CATEGORY_OPTIONS, FUEL_OPTIONS, TRANSMISSION_OPTIONS, applyVinDecode, type ListingDraft } from '@catodrive/core/web/features/vehicles/new-listing';
import { US_STATES } from '@catodrive/core/web/lib/data/us-states';
import { useListingDraft } from './draft-store';
import { OptionChips } from './OptionChips';

const int = (t: string) => Number(t.replace(/\D/g, '')) || 0;

/** VIN first (fills the rest), then make, model, year, seats, doors, type, fuel, odometer and plate. */
export function BasicsStep({ errors }: { errors: Record<string, string> }) {
  const { c } = useTheme();
  const d = useListingDraft((s) => s.draft);
  const set = useListingDraft((s) => s.set);
  const patch = useListingDraft((s) => s.patch);
  const [vinResult, setVinResult] = useState<RowPreview | null>(null);
  const vinDecode = useMutation({
    mutationFn: (vin: string) => hostApi.importPreview([vin]),
    onSuccess: ([r]) => {
      setVinResult(r);
      patch((prev) => applyVinDecode(prev, r));
    },
  });

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Input
            label="VIN"
            hint="Enter it first - we'll fill in make, model, year and the rest from it."
            value={d.vin}
            onChangeText={(t) => {
              set('vin', t.toUpperCase());
              setVinResult(null);
            }}
            placeholder="1GNERFKWXPJ24O667"
            maxLength={17}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
        <Button title="Decode" variant="outline" full={false} disabled={d.vin.trim().length < 11} loading={vinDecode.isPending} onPress={() => vinDecode.mutate(d.vin.trim())} />
      </View>
      {vinResult?.ok ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Check size={14} color={c.success} />
          <Text variant="caption" tone="success" style={{ flex: 1 }}>
            {vinResult.year} {vinResult.make} {vinResult.model}{vinResult.trim ? ` ${vinResult.trim}` : ''} - details filled in below.
            {vinResult.missing.length > 0 ? ` Check ${vinResult.missing.join(', ')} - the VIN didn't include it.` : ''}
          </Text>
        </View>
      ) : null}
      {vinResult?.duplicate ? <Text variant="caption" tone="warning">This VIN is already on one of your listings.</Text> : null}
      {vinResult && !vinResult.ok ? <Text variant="caption" tone="destructive">{vinResult.error ?? "Couldn't decode that VIN - enter the details below manually."}</Text> : null}

      <Input label="Make *" error={errors.make} value={d.make} onChangeText={(t) => set('make', t)} placeholder="Toyota" />
      <Input label="Model *" error={errors.model} value={d.model} onChangeText={(t) => set('model', t)} placeholder="Camry" />
      <Input label="Year *" error={errors.year} keyboardType="number-pad" value={String(d.year || '')} onChangeText={(t) => set('year', int(t))} maxLength={4} />
      <Input label="Seats *" error={errors.seats} keyboardType="number-pad" value={String(d.seats || '')} onChangeText={(t) => set('seats', int(t))} />
      <Input label="Doors" keyboardType="number-pad" value={String(d.doors || '')} onChangeText={(t) => set('doors', int(t))} />
      <OptionChips label="Category" value={d.category} options={CATEGORY_OPTIONS} onChange={(v) => set('category', v)} />
      <OptionChips label="Body type" value={d.bodyType} options={BODY_TYPE_OPTIONS} onChange={(v) => set('bodyType', v)} />
      <OptionChips label="Transmission" value={d.transmission} options={TRANSMISSION_OPTIONS} onChange={(v) => set('transmission', v as ListingDraft['transmission'])} />
      <OptionChips label="Fuel" value={d.fuelType} options={FUEL_OPTIONS} onChange={(v) => set('fuelType', v as ListingDraft['fuelType'])} />
      <Input label="Odometer (miles)" hint="Optional" keyboardType="number-pad" value={d.odometerMiles === '' ? '' : String(d.odometerMiles)} onChangeText={(t) => set('odometerMiles', t.replace(/\D/g, '') === '' ? '' : int(t))} />
      <Input label="License plate number" value={d.licensePlate} onChangeText={(t) => set('licensePlate', t.toUpperCase())} placeholder="XCW2O63" autoCapitalize="characters" />
      <OptionChips label="State" value={d.licensePlateState} options={US_STATES.map((s) => ({ value: s, label: s }))} onChange={(v) => set('licensePlateState', v)} scroll />
    </View>
  );
}
