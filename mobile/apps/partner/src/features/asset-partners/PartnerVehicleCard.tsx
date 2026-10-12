import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Card, KeyValue, Text, space } from '@catodrive/ui';
import type { PartnerVehicleSummary } from '@catodrive/core/web/features/asset-partners/api';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';
import { VehiclePhoto } from './VehiclePhoto';

/** One car in the programme with this month's net, gross and trips; opens the car's own page. */
export function PartnerVehicleCard({ vehicle, currency }: { vehicle: PartnerVehicleSummary; currency: string }) {
  const router = useRouter();
  const live = vehicle.status === 'listed';
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  return (
    <Card padded={false} onPress={() => router.push(`/asset-partners/vehicles/${vehicle._id}`)} accessibilityLabel={title}>
      <VehiclePhoto url={vehicle.photo} style={{ aspectRatio: 16 / 9, width: '100%' }} />
      <View style={{ padding: space.lg, gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>{title}</Text>
          <Badge label={live ? 'Live' : vehicle.status.replace(/_/g, ' ')} tone={live ? 'success' : 'neutral'} />
        </View>
        <KeyValue label="Your net this month" value={formatMoney({ amount: vehicle.net, currency })} strong />
        <KeyValue label="Gross" value={formatMoney({ amount: vehicle.gross, currency })} tone="muted" />
        <KeyValue label="Trips" value={String(vehicle.trips)} tone="muted" />
      </View>
    </Card>
  );
}
