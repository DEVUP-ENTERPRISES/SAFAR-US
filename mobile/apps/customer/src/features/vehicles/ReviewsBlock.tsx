import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Card, Text, useTheme, radius, space } from '@catodrive/ui';
import { reviewsApi } from '@catodrive/core/web/features/reviews/api';
import { formatDate } from '@catodrive/core/web/lib/utils/format';
import type { Vehicle } from '@catodrive/core/web/features/vehicles/types';

/** Star breakdown and the latest reviews of this car's host. */
export function ReviewsBlock({ vehicle }: { vehicle: Vehicle }) {
  const { c } = useTheme();
  const reviews = useQuery({ queryKey: ['reviews', vehicle.hostId], queryFn: () => reviewsApi.forSubject(vehicle.hostId) });
  const dist = useQuery({ queryKey: ['reviews-distribution', vehicle.hostId], queryFn: () => reviewsApi.distribution(vehicle.hostId) });

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.head}>
        <Text variant="title">Reviews</Text>
        {vehicle.ratingCount > 0 ? (
          <Text variant="label">
            {vehicle.ratingAvg.toFixed(2)} ★ <Text variant="caption" tone="muted">· {vehicle.ratingCount} {vehicle.ratingCount === 1 ? 'trip' : 'trips'}</Text>
          </Text>
        ) : null}
      </View>
      {dist.data && dist.data.total > 0 ? (
        <View style={{ gap: 6 }}>
          {([5, 4, 3, 2, 1] as const).map((star) => {
            const n = dist.data!.counts[String(star) as '1' | '2' | '3' | '4' | '5'] ?? 0;
            const pct = Math.round((n / dist.data!.total) * 100);
            return (
              <View key={star} style={styles.bar} accessible accessibilityLabel={`${star} stars: ${n}`}>
                <Text variant="caption" style={{ width: 28 }}>{star} ★</Text>
                <View style={[styles.track, { backgroundColor: c.muted }]}>
                  <View style={{ width: `${pct}%`, height: '100%', backgroundColor: c.primary, borderRadius: radius.pill }} />
                </View>
                <Text variant="caption" tone="muted" style={{ width: 24, textAlign: 'right' }}>{n}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {reviews.data?.length ? (
        reviews.data.slice(0, 6).map((r) => (
          <Card key={r._id}>
            <Text variant="label">{'★'.repeat(Math.round(r.rating))}<Text tone="muted">{'★'.repeat(5 - Math.round(r.rating))}</Text></Text>
            {r.comment ? <Text style={{ marginTop: 4 }}>{r.comment}</Text> : null}
            <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>{formatDate(r.createdAt)}</Text>
          </Card>
        ))
      ) : !reviews.isPending ? (
        <Text tone="muted">No reviews yet.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: { flex: 1, height: 8, borderRadius: radius.pill, overflow: 'hidden' },
});
