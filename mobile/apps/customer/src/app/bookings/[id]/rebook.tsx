import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Check, Clock, SearchX, ShieldCheck, Star, Zap } from 'lucide-react-native';
import { Button, Card, EmptyState, Screen, ScreenHeader, Skeleton, Text, useTheme, useToast, radius, space } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { bookingApi, type RebookingOption } from '@catodrive/core/web/features/bookings/api';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';

function OptionCard({ option: o, selected, onSelect }: { option: RebookingOption; selected: boolean; onSelect: () => void }) {
  const { c } = useTheme();
  const v = o.vehicle;
  const photo = v.photos?.find((p) => p.isCover)?.url ?? v.photos?.[0]?.url;
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onSelect}>
      <Card style={selected ? { borderColor: c.primary, borderWidth: 2 } : undefined}>
        <View style={styles.option}>
          {photo ? <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" /> : <View style={[styles.photo, { backgroundColor: c.muted }]} />}
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Text variant="label" style={{ flex: 1 }}>{v.year} {v.make} {v.model}</Text>
              {selected ? <Check size={18} color={c.primary} /> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              {v.ratingCount > 0 ? (
                <View style={styles.meta}><Star size={12} color={c.primary} fill={c.primary} /><Text variant="caption">{v.ratingAvg.toFixed(1)}</Text></View>
              ) : (
                <Text variant="caption" tone="muted">New listing</Text>
              )}
              {v.listing?.instantBook ? <View style={styles.meta}><Zap size={12} color={c.warning} /><Text variant="caption">Instant</Text></View> : null}
            </View>
            {o.covered > 0 ? (
              <View>
                <Text variant="caption" tone="muted" style={{ textDecorationLine: 'line-through' }}>{formatMoney(o.total)}</Text>
                <Text variant="heading">{formatMoney(o.youPay)}</Text>
                <Text variant="caption" tone="success">
                  {o.fullyCovered ? `We cover ${formatMoney({ amount: o.covered, currency: o.total.currency })}` : `We cover ${formatMoney({ amount: o.covered, currency: o.total.currency })} of ${formatMoney({ amount: o.difference, currency: o.total.currency })}`}
                </Text>
              </View>
            ) : (
              <View>
                <Text variant="heading">{formatMoney(o.youPay)}</Text>
                {o.difference === 0 ? <Text variant="caption" tone="muted">Same as your original price</Text> : null}
              </View>
            )}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

/** After a host cancels: comparable cars for the same dates, with the price difference covered. */
function Rebook({ id }: { id: string }) {
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(null);
  const data = useQuery({ queryKey: ['rebooking-options', id], queryFn: () => bookingApi.rebookingOptions(id), retry: false });
  const rebook = useMutation({
    meta: { silentError: true },
    mutationFn: (vehicleId: string) => bookingApi.rebook(id, vehicleId),
    onSuccess: (b) => {
      toast({ tone: 'success', title: 'You’re booked' });
      router.replace(`/bookings/${b._id}`);
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not rebook' }),
  });

  const header = <ScreenHeader title="Back to booking" onBack={() => router.back()} />;
  if (data.isPending) return <Screen header={header}><Skeleton height={140} /><Skeleton height={120} /></Screen>;
  const d = data.data;
  const covered = d?.protection.enabled;
  const hoursLeft = d?.protection.expiresAt ? Math.max(0, Math.round((new Date(d.protection.expiresAt).getTime() - Date.now()) / 3_600_000)) : null;
  const choice = picked ? d?.options.find((o) => o.vehicle._id === picked) : undefined;

  return (
    <Screen
      header={header}
      footer={
        choice ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Text variant="heading">You pay {formatMoney(choice.youPay)}</Text>
              <Text variant="caption" tone="muted">Same dates as your original trip</Text>
            </View>
            <Button title="Book this car" full={false} loading={rebook.isPending} onPress={() => rebook.mutate(choice.vehicle._id)} />
          </View>
        ) : undefined
      }
    >
      <Card>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <ShieldCheck size={24} color={c.primary} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="title">{covered ? 'We’ll cover the difference' : 'Find another car'}</Text>
            <Text tone="muted">
              {covered
                ? `Your host cancelled, so you shouldn’t pay more for the same trip. Pick any car below - we make up the difference, up to ${formatMoney({ amount: d!.protection.maxCoverageCents, currency: d!.originalTotal.currency })}.`
                : 'These cars are free for your original dates.'}
            </Text>
            {covered && hoursLeft !== null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Clock size={14} color={c.warning} />
                <Text variant="caption" tone="warning">{hoursLeft > 0 ? `Cover holds for another ${hoursLeft}h` : 'Cover expires shortly'}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {d ? <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>You originally paid {formatMoney(d.originalTotal)}</Text> : null}
      </Card>
      {!d || d.options.length === 0 ? (
        <EmptyState icon={<SearchX size={28} color={c.primary} />} title="No cars free for those dates" body="Nothing comparable is available right now. Our team can help you find something - or refund you in full." actionLabel="Get help" onAction={() => router.push({ pathname: '/support', params: { bookingId: id } })} />
      ) : (
        d.options.map((o) => <OptionCard key={o.vehicle._id} option={o} selected={picked === o.vehicle._id} onSelect={() => setPicked(o.vehicle._id)} />)
      )}
    </Screen>
  );
}

export default function RebookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireAuth>
      <Rebook id={id} />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', gap: space.md },
  photo: { width: 96, height: 72, borderRadius: radius.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
