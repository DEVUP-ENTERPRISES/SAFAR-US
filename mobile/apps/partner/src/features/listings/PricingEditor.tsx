import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { BottomSheet, Button, DateRangeCalendar, Input, Text, space, useTheme } from '@catodrive/ui';
import type { Vehicle } from '@catodrive/core/web/features/vehicles/types';
import { NEW_SEASONAL_RULE, pricingForm, pricingPatch, pricingValid, type PricingField, type PricingForm } from '@catodrive/core/web/features/vehicles/pricing-form';
import { formatDay } from '@catodrive/core/web/lib/utils/format';

const digits = (t: string) => t.replace(/[^\d.]/g, '');

/** The website's PricingPanel: daily price, weekend uplift, trip-length and booking-window discounts, seasonal rules. */
export function PricingEditor({ vehicle, onSave, saving, focus, onCancel }: { vehicle: Vehicle; onSave: (patch: Record<string, unknown>) => void; saving: boolean; focus?: PricingField; onCancel?: () => void }) {
  const { c } = useTheme();
  const cur = vehicle.pricing.currency;
  const [form, setForm] = useState<PricingForm>(() => pricingForm(vehicle.pricing));
  const [dates, setDates] = useState<number | null>(null);
  const set = (k: Exclude<keyof PricingForm, 'rules'>) => (v: string) => setForm((f) => ({ ...f, [k]: digits(v) }));
  const setRule = (i: number, patch: Partial<PricingForm['rules'][number]>) => setForm((f) => ({ ...f, rules: f.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const rule = dates !== null ? form.rules[dates] : null;

  return (
    <View style={{ gap: space.md }}>
      <Input label={`Daily price (${cur})`} keyboardType="decimal-pad" autoFocus={focus === 'daily'} value={form.daily} onChangeText={set('daily')} />
      <Input label="Weekend uplift (%)" hint="Added Fri–Sun" keyboardType="number-pad" value={form.weekend} onChangeText={set('weekend')} />
      <Input label="Weekly discount (%)" hint="7+ day trips" keyboardType="decimal-pad" autoFocus={focus === 'weekly'} value={form.weekly} onChangeText={set('weekly')} />
      <Input label="Monthly discount (%)" hint="28+ day trips" keyboardType="decimal-pad" autoFocus={focus === 'monthly'} value={form.monthly} onChangeText={set('monthly')} />
      <Input label="Early-bird (%)" hint="Booked well ahead" keyboardType="number-pad" value={form.earlyBird} onChangeText={set('earlyBird')} />
      <Input label="Last-minute (%)" hint="Fills idle days" keyboardType="number-pad" value={form.lastMinute} onChangeText={set('lastMinute')} />

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="label" style={{ flex: 1 }}>Seasonal pricing</Text>
        <Button title="+ Add rule" variant="ghost" size="sm" full={false} onPress={() => setForm((f) => ({ ...f, rules: [...f.rules, NEW_SEASONAL_RULE] }))} />
      </View>
      <Text variant="caption" tone="muted">A multiplier for a date range - 150% charges half again as much (peak), 80% takes a fifth off (low season).</Text>
      {form.rules.length === 0 ? <Text variant="caption" tone="muted">No seasonal rules yet.</Text> : null}
      {form.rules.map((r, i) => (
        <View key={i} style={{ gap: space.sm, padding: space.md, borderWidth: 1, borderColor: c.border, borderRadius: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Input value={r.label} placeholder="e.g. Holiday peak" onChangeText={(t) => setRule(i, { label: t })} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Remove rule" hitSlop={10} onPress={() => setForm((f) => ({ ...f, rules: f.rules.filter((_, j) => j !== i) }))}>
              <Trash2 size={18} color={c.destructive} />
            </Pressable>
          </View>
          <Button title={r.start && r.end ? `${formatDay(r.start)} – ${formatDay(r.end)}` : 'Choose dates'} variant="outline" size="sm" onPress={() => setDates(i)} />
          <Input label="Rate (%)" keyboardType="number-pad" value={r.pct} onChangeText={(t) => setRule(i, { pct: digits(t) })} />
        </View>
      ))}

      <Button title="Save pricing" loading={saving} disabled={!pricingValid(form)} onPress={() => onSave(pricingPatch(form))} />
      {onCancel ? <Button title="Cancel" variant="outline" disabled={saving} onPress={onCancel} /> : null}

      <BottomSheet visible={dates !== null} onClose={() => setDates(null)} title="Season dates" footer={<Button title="Done" onPress={() => setDates(null)} />}>
        {rule && dates !== null ? <DateRangeCalendar from={rule.start} to={rule.end} onChange={(start, end) => setRule(dates, { start, end })} /> : null}
      </BottomSheet>
    </View>
  );
}
