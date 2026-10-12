import { View } from 'react-native';
import { Checkbox, Input, Text, space } from '@catodrive/ui';
import { ADDON_PRESETS } from '@catodrive/core/web/features/vehicles/new-listing';
import { DeliveryLocationsEditor } from '../DeliveryLocationsEditor';
import { useListingDraft } from './draft-store';

/** Delivery locations, extras offered at checkout, the platform's daily miles, overage and trip rules. */
export function DeliveryStep({ errors, dailyMiles }: { errors: Record<string, string>; dailyMiles: number }) {
  const d = useListingDraft((s) => s.draft);
  const set = useListingDraft((s) => s.set);
  return (
    <View style={{ gap: space.md }}>
      <Text tone="muted">Offer delivery to earn more - each location can have its own fee.</Text>
      <DeliveryLocationsEditor value={d.deliveryLocations} onChange={(next) => set('deliveryLocations', next)} home={d.lat != null ? { address: d.address, city: d.city } : undefined} />
      <Text variant="label">Extras you offer</Text>
      {Object.entries(ADDON_PRESETS).map(([code, a]) => (
        <Checkbox
          key={code}
          checked={d.addOnCodes.includes(code)}
          onChange={() => set('addOnCodes', d.addOnCodes.includes(code) ? d.addOnCodes.filter((x) => x !== code) : [...d.addOnCodes, code])}
          right={<Text variant="label">${a.amount}{a.priceType === 'per_day' ? '/day' : '/trip'}</Text>}
        >
          <Text variant="label">{a.label}</Text>
          {a.note ? <Text variant="caption" tone="muted">{a.note}</Text> : null}
        </Checkbox>
      ))}
      <Input label="Daily mileage limit" hint="Set by CatoDrive for every car." value={`${dailyMiles} miles/day`} editable={false} />
      <Input
        label="Overage fee ($/mile)"
        hint="Charged per mile driven over the daily limit."
        error={errors.mileageOverage}
        keyboardType="decimal-pad"
        value={String(d.mileageOverage)}
        onChangeText={(t) => set('mileageOverage', Number(t.replace(/[^\d.]/g, '')) || 0)}
      />
      <Input label="Trip rules (one per line)" value={d.tripRules} onChangeText={(t) => set('tripRules', t)} multiline placeholder={'No smoking\nNo off-road driving'} style={{ minHeight: 80, textAlignVertical: 'top' }} />
    </View>
  );
}
