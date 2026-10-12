import { useState } from 'react';
import { View } from 'react-native';
import { Button, space } from '@catodrive/ui';
import { LocationSearch } from '@catodrive/core';
import type { DeliveryLocation, Vehicle } from '@catodrive/core/web/features/vehicles/types';
import { DeliveryLocationsEditor } from './DeliveryLocationsEditor';

/** Pickup address and delivery locations; sends only what this panel owns so another panel's edits are never reverted. */
export function LocationPanel({ vehicle, onSave, saving }: { vehicle: Vehicle; onSave: (patch: Record<string, unknown>) => void; saving: boolean }) {
  const [loc, setLoc] = useState<{ lat: number; lng: number; city: string; address: string } | null>(null);
  const [locations, setLocations] = useState<DeliveryLocation[]>(vehicle.listing?.deliveryLocations ?? []);
  return (
    <View style={{ gap: space.md }}>
      <LocationSearch
        label="Pickup location"
        hint={loc ? `Will be saved as ${loc.city}` : `Currently ${vehicle.location?.city || 'unset'}`}
        placeholder="Search a new address"
        onPick={(p) => setLoc({ lat: p.lat, lng: p.lng, city: p.city, address: p.label })}
      />
      <DeliveryLocationsEditor value={locations} onChange={setLocations} home={{ address: vehicle.location.address, city: vehicle.location.city }} />
      <Button title="Save location & delivery" size="sm" loading={saving} onPress={() => onSave({ ...(loc ? { location: loc } : {}), listing: { deliveryLocations: locations } })} />
    </View>
  );
}
