import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ImageOff } from 'lucide-react-native';
import { Card, Text, space, useTheme } from '@catodrive/ui';
import type { Vehicle } from '@catodrive/core/web/features/vehicles/types';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';

/** One of the host's cars: cover photo with its status, rating and daily rate. Opens the listing. */
export function FleetCard({ v }: { v: Vehicle }) {
  const { c } = useTheme();
  const router = useRouter();
  const photo = v.photos?.find((p) => p.isCover)?.url ?? v.photos?.[0]?.url;
  const listed = v.status === 'listed';
  const title = `${v.year} ${v.make} ${v.model}`;
  return (
    <Card padded={false} onPress={() => router.push(`/host/listings/${v._id}`)} accessibilityLabel={title}>
      <View style={{ aspectRatio: 16 / 10, backgroundColor: c.muted, alignItems: 'center', justifyContent: 'center' }}>
        {photo ? (
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" recyclingKey={v._id} accessibilityLabel={`${v.make} ${v.model}`} />
        ) : (
          <View style={{ alignItems: 'center', gap: 4 }}>
            <ImageOff size={24} color={c.mutedForeground} />
            <Text variant="caption" tone="muted">No photo added</Text>
          </View>
        )}
        <View style={{ position: 'absolute', left: space.md, top: space.md, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: listed ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.7)' }}>
          <Text variant="small" style={{ color: '#fff', textTransform: 'uppercase' }}>{v.status}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.md, padding: space.lg }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading" numberOfLines={1}>{title}</Text>
          <Text variant="caption" tone="muted">{v.ratingCount > 0 ? `★ ${v.ratingAvg.toFixed(1)} · ${v.ratingCount} trips` : 'No trips yet'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="small" tone="muted">DAILY RATE</Text>
          <Text variant="heading">{formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency })}<Text variant="caption" tone="muted">/d</Text></Text>
        </View>
      </View>
    </Card>
  );
}
