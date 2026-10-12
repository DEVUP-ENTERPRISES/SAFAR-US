import { View } from 'react-native';
import { Star } from 'lucide-react-native';
import { Badge, Text, useTheme } from '@catodrive/ui';
import type { Vehicle } from '@catodrive/core/web/features/vehicles/types';

type RatingFields = Pick<Vehicle, 'ratingAvg' | 'ratingCount' | 'externalRating'>;

/** Own reviews first, then a rating carried over from another platform, otherwise "New". */
export function VehicleRating({ vehicle }: { vehicle: RatingFields }) {
  const { c } = useTheme();
  const own = vehicle.ratingCount > 0;
  const ext = !own ? vehicle.externalRating : undefined;
  if (!own && !ext) return <Badge label="New" tone="primary" />;
  const avg = own ? vehicle.ratingAvg : ext!.rating;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel={`Rated ${avg.toFixed(1)}`}>
      <Star size={14} color={c.primary} fill={c.primary} />
      <Text variant="label">{avg.toFixed(1)}</Text>
      <Text variant="caption" tone="muted">{own ? `(${vehicle.ratingCount})` : `on ${ext!.source}${ext!.trips > 0 ? ` · ${ext!.trips} trips` : ''}`}</Text>
    </View>
  );
}
