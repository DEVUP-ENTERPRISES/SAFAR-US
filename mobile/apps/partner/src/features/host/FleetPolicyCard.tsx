import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Chip, Input, Text, space, useToast } from '@catodrive/ui';
import { LocationSearch, type PickedPlace } from '@catodrive/core';
import { hostApi, type Fleet } from '@catodrive/core/web/features/host/api';

const DELIVERY_MODES = [
  ['home', 'Guest address'],
  ['airport', 'Airport'],
  ['hotel', 'Hotel'],
  ['business', 'Business'],
] as const;

/** Fleet-wide delivery and parking defaults; saving never touches a car - "Apply to all vehicles" is a separate step. */
export function FleetPolicyCard({ fleet }: { fleet: Fleet }) {
  const qc = useQueryClient();
  const toast = useToast();
  const d = fleet.defaultDelivery;
  const [delivery, setDelivery] = useState({ airport: !!d?.airport, home: !!d?.home, hotel: !!d?.hotel, business: !!d?.business, fee: String(((d?.fee ?? 0) / 100) || '') });
  const [loc, setLoc] = useState<{ lat: number; lng: number; city: string; address: string } | null>(null);

  const savePolicy = useMutation({
    mutationFn: () => hostApi.updateFleetPolicy(fleet._id, { delivery: { ...delivery, fee: Math.round(Number(delivery.fee || 0) * 100) }, ...(loc ? { location: loc } : {}) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['fleets'] });
      toast({ tone: 'success', title: 'Fleet policy saved' });
    },
  });
  const applyPolicy = useMutation({
    mutationFn: () => hostApi.applyFleetPolicy(fleet._id),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['my-vehicles'] });
      toast({ tone: r.failed ? 'error' : 'success', title: r.failed ? `Applied to ${r.applied} vehicles, ${r.failed} failed` : `Applied to ${r.applied} vehicles` });
    },
  });
  const hasPolicy = !!(fleet.defaultDelivery || fleet.defaultLocation);

  return (
    <Card>
      <Text variant="heading">Delivery & pickup policy</Text>
      <View style={{ gap: space.md, marginTop: space.md }}>
        <LocationSearch
          label="Default parking address"
          hint={loc ? `Will be saved as ${loc.city}` : fleet.defaultLocation ? `Currently ${fleet.defaultLocation.city}` : 'Not set'}
          placeholder="Search an address"
          onPick={(p: PickedPlace) => setLoc({ lat: p.lat, lng: p.lng, city: p.city, address: p.label })}
        />
        <Text variant="label">Delivery options</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {DELIVERY_MODES.map(([key, label]) => <Chip key={key} label={label} selected={delivery[key]} onPress={() => setDelivery((s) => ({ ...s, [key]: !s[key] }))} />)}
        </View>
        <Input label="Delivery fee ($)" hint="Flat fee charged when a guest requests delivery" keyboardType="decimal-pad" value={delivery.fee} onChangeText={(t) => setDelivery({ ...delivery, fee: t })} />
        <Button title="Save policy" size="sm" loading={savePolicy.isPending} onPress={() => savePolicy.mutate()} />
        <Button title="Apply to all vehicles in this fleet" size="sm" variant="secondary" loading={applyPolicy.isPending} disabled={!hasPolicy} onPress={() => applyPolicy.mutate()} />
      </View>
    </Card>
  );
}
