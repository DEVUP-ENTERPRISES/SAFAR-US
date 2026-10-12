import { View } from 'react-native';
import { Input, Text, space } from '@catodrive/ui';
import { LocationSearch } from '@catodrive/core';
import { ColorPicker } from '../ColorPicker';
import { FeaturePicker } from '../FeaturePicker';
import { useListingDraft } from './draft-store';

/** Pickup location (required for search), notes, colour, title, description and features. */
export function DetailsStep({ errors }: { errors: Record<string, string> }) {
  const d = useListingDraft((s) => s.draft);
  const set = useListingDraft((s) => s.set);
  const patch = useListingDraft((s) => s.patch);
  return (
    <View style={{ gap: space.md }}>
      <LocationSearch
        label="Where guests pick it up *"
        hint={errors.location ?? (d.city ? `Listed in ${d.city}` : 'Search any address - you are not limited to a fixed list of cities.')}
        placeholder="Start typing an address or city"
        onPick={(loc) => patch((prev) => ({ ...prev, lat: loc.lat, lng: loc.lng, city: loc.city || prev.city, address: loc.label }))}
      />
      {errors.location ? <Text variant="caption" tone="destructive">{errors.location}</Text> : null}
      <Input label="Pickup notes" hint="Optional - where exactly to meet, parking, gate codes" value={d.pickupNotes} onChangeText={(t) => set('pickupNotes', t)} placeholder="Garage level 2, spot 14" />
      <Text variant="label">Color</Text>
      <Text variant="caption" tone="muted">Guests filter by this, so pick the closest match</Text>
      <ColorPicker value={d.color} onChange={(v) => set('color', v)} />
      <Input label="Listing title" value={d.title} onChangeText={(t) => set('title', t)} placeholder={`${d.make} ${d.model} ${d.year}`} />
      <Input label="Description" value={d.description} onChangeText={(t) => set('description', t)} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
      <Text variant="label">Features</Text>
      <Text variant="caption" tone="muted">Guests filter by these - pick everything that applies</Text>
      <FeaturePicker value={d.features} onChange={(v) => set('features', v)} />
    </View>
  );
}
