import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Briefcase, Building2, Car, MapPinned, Plane, Plus, Trash2 } from 'lucide-react-native';
import { Button, Text, space, useTheme } from '@catodrive/ui';
import type { DeliveryLocation, DeliveryLocationKind } from '@catodrive/core/web/features/vehicles/types';
import { ACCESS_METHOD_LABEL, DELIVERY_KIND, blankDeliveryLocation } from '@catodrive/core/web/features/vehicles/listing-options';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';
import { DeliveryLocationEditRow } from './DeliveryLocationEditRow';

const KIND_ICON: Record<DeliveryLocationKind, typeof Plane> = { airport: Plane, hotel: Building2, business: Briefcase, custom: MapPinned };

/** The website's delivery setup: the free home location, then a priced, editable list of delivery locations. */
export function DeliveryLocationsEditor({ value, onChange, home }: { value: DeliveryLocation[]; onChange: (next: DeliveryLocation[]) => void; home?: { address: string; city: string } }) {
  const { c } = useTheme();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const update = (id: string, patch: Partial<DeliveryLocation>) => onChange(value.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const remove = (id: string) => {
    onChange(value.filter((l) => l.id !== id));
    if (editingId === id) setEditingId(null);
  };
  const startAdd = (kind: DeliveryLocationKind) => {
    const draft = blankDeliveryLocation(kind);
    onChange([...value, draft]);
    setEditingId(draft.id);
    setPicking(false);
  };

  return (
    <View style={{ gap: space.md }}>
      {home ? (
        <View style={{ flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: 12, backgroundColor: c.subtle }}>
          <Car size={18} color={c.primary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label">{home.address || home.city}</Text>
            <Text variant="caption" tone="muted">Pickup & return at your home location is included in the trip price for no additional fee.</Text>
          </View>
        </View>
      ) : null}
      {value.length > 0 ? <Text variant="label">Delivery locations</Text> : null}
      {value.map((loc) => {
        if (editingId === loc.id) {
          return <DeliveryLocationEditRow key={loc.id} value={loc} onSave={(patch) => { update(loc.id, patch); setEditingId(null); }} onCancel={() => remove(loc.id)} />;
        }
        const Icon = KIND_ICON[loc.kind];
        return (
          <View key={loc.id} style={{ flexDirection: 'row', gap: space.sm, padding: space.md, borderWidth: 1, borderColor: c.border, borderRadius: 12 }}>
            <Icon size={18} color={c.primary} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label">{loc.name || DELIVERY_KIND[loc.kind].label}</Text>
              <Text variant="caption" tone="muted">
                {loc.fee > 0 ? formatMoney({ amount: loc.fee, currency: 'USD' }) : 'Free'} delivery{loc.minTripDays > 0 ? `. ${loc.minTripDays}+ day trips.` : ''}
              </Text>
              <Text variant="caption" tone="muted">{ACCESS_METHOD_LABEL[loc.accessMethod]}</Text>
              {loc.kind === 'airport' && loc.subLocations?.length ? <Text variant="caption" tone="muted">{loc.subLocations.length} required location{loc.subLocations.length === 1 ? '' : 's'}</Text> : null}
              {loc.parkingRate ? <Text variant="caption" tone="muted">Parking rate: {loc.parkingRate}</Text> : null}
              {loc.kind === 'custom' && loc.radiusMiles ? <Text variant="caption" tone="muted">Within {loc.radiusMiles} miles</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: space.sm }}>
              <Button title="Edit" variant="ghost" size="sm" full={false} onPress={() => setEditingId(loc.id)} />
              <Pressable accessibilityRole="button" accessibilityLabel="Remove location" hitSlop={10} onPress={() => remove(loc.id)}>
                <Trash2 size={16} color={c.destructive} />
              </Pressable>
            </View>
          </View>
        );
      })}
      {picking ? (
        <View style={{ gap: space.sm }}>
          <Text variant="label">What kind of location?</Text>
          {(Object.keys(DELIVERY_KIND) as DeliveryLocationKind[]).map((k) => {
            const Icon = KIND_ICON[k];
            return (
              <Pressable key={k} accessibilityRole="button" onPress={() => startAdd(k)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderWidth: 1, borderColor: c.border, borderRadius: 12 }}>
                <Icon size={18} color={c.primary} />
                <Text variant="label">{DELIVERY_KIND[k].label}</Text>
              </Pressable>
            );
          })}
          <Button title="Cancel" variant="ghost" size="sm" onPress={() => setPicking(false)} />
        </View>
      ) : (
        <Button title="Add a delivery location" variant="secondary" size="sm" icon={<Plus size={16} color={c.foreground} />} onPress={() => setPicking(true)} />
      )}
    </View>
  );
}
