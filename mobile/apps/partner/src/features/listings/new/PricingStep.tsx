import { Switch, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react-native';
import { Button, Card, Input, Text, space, useTheme } from '@catodrive/ui';
import { vehicleApi } from '@catodrive/core/web/features/vehicles/api';
import type { ListingDraft } from '@catodrive/core/web/features/vehicles/new-listing';
import { useListingDraft } from './draft-store';

const num = (t: string) => Number(t.replace(/[^\d.]/g, '')) || 0;

/** Smart Price suggestion from local comps, the daily price, weekend premium, discounts and Instant Book. */
export function PricingStep({ errors }: { errors: Record<string, string> }) {
  const { c } = useTheme();
  const d = useListingDraft((s) => s.draft);
  const set = useListingDraft((s) => s.set);
  const smartPrice = useMutation({
    mutationFn: () => vehicleApi.priceSuggestion({ lng: d.lng!, lat: d.lat!, category: d.category, fuelType: d.fuelType }),
    onSuccess: (s) => set('dailyPrice', Math.round(s.suggested / 100)),
  });
  const field = (k: keyof ListingDraft, label: string, error?: string) => (
    <Input label={label} error={error} keyboardType="decimal-pad" value={String(d[k] ?? '')} onChangeText={(t) => set(k, num(t) as never)} />
  );
  return (
    <View style={{ gap: space.md }}>
      <Card style={{ backgroundColor: c.primarySoft, borderColor: c.primary }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Sparkles size={16} color={c.primary} />
          <Text variant="label" style={{ flex: 1 }}>Smart Price AI</Text>
        </View>
        {smartPrice.data ? (
          <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
            Market median ${(smartPrice.data.median / 100).toFixed(0)} · {smartPrice.data.demand} demand · {smartPrice.data.sampleSize} comps
          </Text>
        ) : null}
        <Button
          title={smartPrice.data ? `Apply $${(smartPrice.data.suggested / 100).toFixed(0)}` : 'Suggest a price'}
          size="sm"
          variant="outline"
          disabled={d.lat === null || d.lng === null}
          loading={smartPrice.isPending}
          style={{ marginTop: space.sm }}
          onPress={() => smartPrice.mutate()}
        />
      </Card>
      {field('dailyPrice', 'Daily price ($) *', errors.dailyPrice)}
      {field('weekendPct', 'Weekend premium (%)')}
      {field('weeklyDiscountPct', 'Weekly discount (%)')}
      {field('monthlyDiscountPct', 'Monthly discount (%)')}
      {field('earlyBirdPct', 'Early-bird discount (%)')}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Text style={{ flex: 1 }}>Enable instant booking (guests book without approval)</Text>
        <Switch value={d.instantBook} onValueChange={(v) => set('instantBook', v)} trackColor={{ true: c.primary, false: c.muted }} accessibilityLabel="Instant booking" />
      </View>
    </View>
  );
}
