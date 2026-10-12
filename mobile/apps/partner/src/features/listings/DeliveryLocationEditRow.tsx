import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Button, Chip, Input, Text, space, useTheme } from '@catodrive/ui';
import { LocationSearch } from '@catodrive/core';
import type { DeliveryLocation } from '@catodrive/core/web/features/vehicles/types';
import { ACCESS_METHOD_LABEL, DELIVERY_KIND, deliveryLocationPatch } from '@catodrive/core/web/features/vehicles/listing-options';

const ACCESS = Object.keys(ACCESS_METHOD_LABEL) as DeliveryLocation['accessMethod'][];
const PARKING = [
  { value: '', label: 'Not specified' },
  { value: 'free', label: 'Free' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
];

/** Editing one delivery location: name, address or radius, fee, minimum trip, access, parking and airport spots. */
export function DeliveryLocationEditRow({ value, onSave, onCancel }: { value: DeliveryLocation; onSave: (patch: Partial<DeliveryLocation>) => void; onCancel: () => void }) {
  const { c } = useTheme();
  const [name, setName] = useState(value.name);
  const [address, setAddress] = useState(value.address);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | undefined>(value.lat !== undefined && value.lng !== undefined ? { lat: value.lat, lng: value.lng } : undefined);
  const [fee, setFee] = useState(String(value.fee / 100 || ''));
  const [minTripDays, setMinTripDays] = useState(String(value.minTripDays || ''));
  const [accessMethod, setAccessMethod] = useState(value.accessMethod);
  const [radiusMiles, setRadiusMiles] = useState(String(value.radiusMiles ?? 20));
  const [parkingRate, setParkingRate] = useState<string>(value.parkingRate ?? '');
  const [subLocations, setSubLocations] = useState(value.subLocations ?? []);
  const [subDraft, setSubDraft] = useState('');
  const kind = DELIVERY_KIND[value.kind];
  const canSave = value.kind === 'custom' ? !!name.trim() : !!name.trim() && !!address.trim();

  return (
    <View style={{ gap: space.md, padding: space.md, borderWidth: 1.5, borderColor: c.primary, borderRadius: 14 }}>
      <Text variant="label" tone="primary">{kind.label}</Text>
      <Input label="Name" hint="Shown to guests, e.g. “Dallas Love Field Airport”" value={name} onChangeText={setName} placeholder={kind.label} />
      {value.kind !== 'custom' ? (
        <LocationSearch label="Address" hint={address || undefined} placeholder={address || 'Search an address'} onPick={(p) => { setAddress(p.label); setCoords({ lat: p.lat, lng: p.lng }); }} />
      ) : (
        <Input label="Radius (miles)" hint="Deliver anywhere the guest picks within this distance" keyboardType="number-pad" value={radiusMiles} onChangeText={setRadiusMiles} />
      )}
      <Input label="Delivery fee ($)" keyboardType="decimal-pad" value={fee} onChangeText={setFee} />
      <Input label="Minimum trip (days)" hint="0 = any length" keyboardType="number-pad" value={minTripDays} onChangeText={setMinTripDays} />
      <Text variant="label">Access method</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {ACCESS.map((a) => <Chip key={a} label={ACCESS_METHOD_LABEL[a]} selected={accessMethod === a} onPress={() => setAccessMethod(a)} />)}
      </View>
      {value.kind === 'airport' || value.kind === 'hotel' ? (
        <>
          <Text variant="label">Parking rate</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {PARKING.map((p) => <Chip key={p.value || 'none'} label={p.label} selected={parkingRate === p.value} onPress={() => setParkingRate(p.value)} />)}
          </View>
        </>
      ) : null}
      {value.kind === 'airport' ? (
        <View style={{ gap: space.sm }}>
          <Text variant="label">Required locations</Text>
          <Text variant="caption" tone="muted">Specific terminals or counters a guest may be sent to</Text>
          {subLocations.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Text variant="caption" style={{ flex: 1 }}>{s.name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${s.name}`} hitSlop={10} onPress={() => setSubLocations(subLocations.filter((_, j) => j !== i))}>
                <X size={16} color={c.mutedForeground} />
              </Pressable>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Input value={subDraft} onChangeText={setSubDraft} placeholder="e.g. Terminal C, Cell Phone Lot" />
            </View>
            <Button title="Add" size="sm" variant="secondary" full={false} disabled={!subDraft.trim()} onPress={() => { setSubLocations([...subLocations, { name: subDraft.trim() }]); setSubDraft(''); }} />
          </View>
        </View>
      ) : null}
      <Button
        title="Save location"
        size="sm"
        disabled={!canSave}
        onPress={() => onSave(deliveryLocationPatch(value.kind, { name, address, coords, fee, minTripDays, accessMethod, radiusMiles, parkingRate, subLocations }))}
      />
      <Button title="Cancel" variant="ghost" size="sm" onPress={onCancel} />
    </View>
  );
}
