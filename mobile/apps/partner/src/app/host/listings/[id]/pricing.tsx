import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Route, ShieldCheck } from 'lucide-react-native';
import { Button, Card, ErrorState, Screen, ScreenHeader, Section, Skeleton, Text, space, useTheme, useToast } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { vehicleApi } from '@catodrive/core/web/features/vehicles/api';
import { useVehicle } from '@catodrive/core/web/features/vehicles/hooks';
import { PRICING_FIELD_HINT, competitiveness, fieldForDays, type PricingField } from '@catodrive/core/web/features/vehicles/pricing-form';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';
import { PricingEditor } from '@/features/listings/PricingEditor';

/** The website's /host/listings/[id]/pricing: take-home per trip length, how competitive the rate is, and the pricing editor. */
function Pricing({ id }: { id: string }) {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<PricingField | null>(null);
  const scroller = useRef<ScrollView>(null);
  const vehicle = useVehicle(id);
  const v = vehicle.data;
  const preview = useQuery({ queryKey: ['pricing-preview', id], queryFn: () => vehicleApi.pricingPreview(id) });
  const comps = useQuery({
    queryKey: ['price-suggestion', id, v?.location.coordinates, v?.category],
    queryFn: () => vehicleApi.priceSuggestion({ lng: v!.location.coordinates[0], lat: v!.location.coordinates[1], category: v!.category, fuelType: v!.fuelType }),
    enabled: !!v,
  });
  const update = useMutation({
    meta: { silentError: true },
    mutationFn: (patch: Record<string, unknown>) => vehicleApi.updatePricing(id, patch),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['vehicle', id] }),
        qc.invalidateQueries({ queryKey: ['pricing-preview', id] }),
        qc.invalidateQueries({ queryKey: ['price-suggestion', id] }),
        qc.invalidateQueries({ queryKey: ['my-vehicles'] }),
      ]);
      toast({ tone: 'success', title: 'Pricing updated', body: 'Your trip earnings are refreshed.' });
      setEditing(null);
    },
    onError: (e) => toast({ tone: 'error', title: 'Could not save pricing', body: e instanceof ApiError ? e.message : 'Please try again.' }),
  });

  const header = <ScreenHeader title="Pricing & discounts" onBack={() => (router.canGoBack() ? router.back() : router.replace(`/host/listings/${id}`))} />;
  if (vehicle.isPending || preview.isPending) return <Screen header={header}><Skeleton height={320} /></Screen>;
  if (vehicle.isError || !v) return <Screen header={header}><ErrorState message="Couldn't load this vehicle." onRetry={() => void vehicle.refetch()} /></Screen>;
  if (preview.isError || !preview.data) return <Screen header={header}><ErrorState message="Couldn't load pricing." onRetry={() => void preview.refetch()} /></Screen>;
  const rating = competitiveness(v.pricing.dailyPrice, comps.data);

  return (
    <Screen header={header}>
      <Section title="Attract longer trips">
        {preview.data.tiers.map((t) => (
          <Card key={t.key}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text variant="label" style={{ flex: 1 }}>{t.label}</Text>
              <Button title="Edit" size="sm" variant="outline" full={false} onPress={() => setEditing(fieldForDays(t.days))} />
            </View>
            <Text variant="title" style={{ marginTop: space.sm }}>{formatMoney({ amount: t.takeHome, currency: t.currency })}</Text>
            <Text variant="caption" tone="muted">{t.days}-day take-home earnings{t.discountPct > 0 ? ` · ${t.discountPct}% off` : ''}</Text>
            {t.distanceKm != null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm }}>
                <Route size={14} color={c.mutedForeground} />
                <Text variant="caption" tone="muted" style={{ flex: 1 }}>Distance included</Text>
                <Text variant="caption">{Math.round(t.distanceKm * 0.621371).toLocaleString()} miles</Text>
              </View>
            ) : null}
            <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>Competitiveness</Text>
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }} accessibilityLabel={`Competitiveness ${rating} of 4`}>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= rating ? (rating >= 3 ? c.success : c.warning) : c.muted }} />
              ))}
            </View>
          </Card>
        ))}
      </Section>
      <Section title="Lock in your earnings">
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={16} color={c.primary} />
            <Text variant="label">Non-refundable discount</Text>
          </View>
          <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
            Every listing offers a discount for trips booked at least 4 days in advance (your early-bird rate, set below). It protects your earnings if a guest cancels close to the trip - the discount is what they paid for booking ahead, not a refund CatoDrive owes back.
          </Text>
        </Card>
      </Section>
      {editing ? (
        <Card>
          <Text variant="caption" tone="muted" style={{ marginBottom: space.md }}>{PRICING_FIELD_HINT[editing]}</Text>
          <PricingEditor key={editing} vehicle={v} focus={editing} saving={update.isPending} onSave={(patch) => update.mutate(patch)} onCancel={() => setEditing(null)} />
        </Card>
      ) : (
        <Button title="Edit pricing" variant="outline" onPress={() => setEditing('daily')} />
      )}
    </Screen>
  );
}

export default function PricingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireAuth>
      <Pricing id={id} />
    </RequireAuth>
  );
}
