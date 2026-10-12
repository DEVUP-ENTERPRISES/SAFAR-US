import { useState } from 'react';
import { Switch, View } from 'react-native';
import { Button, Input, Text, space, useTheme } from '@catodrive/ui';
import { describeCancellation, describeLead, leadMinutes, usePlatformConfig } from '@catodrive/core/web/features/platform/config';
import type { Vehicle } from '@catodrive/core/web/features/vehicles/types';
import { tripPrefsForm, tripPrefsPatch, type TripPrefsForm } from '@catodrive/core/web/features/vehicles/listing-form';

const digits = (t: string) => t.replace(/[^\d.]/g, '');

/** Instant Book, trip length limits, turnaround, notice and overage; daily miles and cancellation are the platform's. */
export function TripPanel({ vehicle, onSave, saving }: { vehicle: Vehicle; onSave: (patch: Record<string, unknown>) => void; saving: boolean }) {
  const { c } = useTheme();
  const cfg = usePlatformConfig().data;
  const [form, setForm] = useState<TripPrefsForm>(() => tripPrefsForm(vehicle));
  const set = (k: Exclude<keyof TripPrefsForm, 'instantBook'>) => (v: string) => setForm((f) => ({ ...f, [k]: digits(v) }));
  const dailyMiles = cfg?.booking?.dailyMileageMiles ?? 200;
  const platformLead = describeLead(leadMinutes(cfg));
  const policy = vehicle.listing?.cancellationPolicy ?? 'flexible';

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">Instant Book</Text>
          <Text variant="caption" tone="muted">Guests book without waiting for your approval. Listings with it on get booked more.</Text>
        </View>
        <Switch value={form.instantBook} onValueChange={(v) => setForm((f) => ({ ...f, instantBook: v }))} trackColor={{ true: c.primary, false: c.muted }} accessibilityLabel="Instant Book" />
      </View>
      <Input label="Minimum trip (hours)" hint="As low as 1 hour for quick, local trips." keyboardType="number-pad" value={form.minHours} onChangeText={set('minHours')} />
      <Input label="Maximum trip (days)" keyboardType="number-pad" value={form.maxDays} onChangeText={set('maxDays')} />
      <Input label="Turnaround (days)" hint="Buffer kept free after each trip" keyboardType="number-pad" value={form.turnaround} onChangeText={set('turnaround')} />
      <Input
        label="Advance notice (hours)"
        hint={`Guests can already book up to ${platformLead} before pickup. Set more here to require longer notice; it cannot go lower.`}
        keyboardType="number-pad"
        value={form.notice}
        onChangeText={set('notice')}
      />
      <Input label="Miles included per day" hint="Set by CatoDrive for every car" value={`${dailyMiles} miles/day`} editable={false} />
      <Input label="Overage charge ($ per mile)" hint="Charged per mile driven past the daily limit" keyboardType="decimal-pad" value={form.overagePerMile} onChangeText={set('overagePerMile')} />
      <View style={{ gap: 2 }}>
        <Text variant="label">Cancellation policy</Text>
        <Text variant="caption" tone="muted">Set by CatoDrive for every car</Text>
        <Text variant="caption">{describeCancellation(policy, cfg).fullDetail || 'Free cancellation up to 24 hours before the trip.'}</Text>
      </View>
      <Button title="Save trip preferences" size="sm" loading={saving} onPress={() => onSave(tripPrefsPatch(form, dailyMiles))} />
    </View>
  );
}
