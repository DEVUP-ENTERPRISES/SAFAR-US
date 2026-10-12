import { FlatList, View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Skeleton, Text, radius, space } from '@catodrive/ui';
import { vehicleApi } from '@catodrive/core/web/features/vehicles/api';
import { VehicleCard } from './VehicleCard';

/** Other cars like this one, priced for the guest's dates when they've picked some. */
export function SimilarCars({ vehicleId, start, end }: { vehicleId: string; start?: string; end?: string }) {
  const { width } = useWindowDimensions();
  const hasDates = !!(start && end);
  const { data, isPending } = useQuery({
    queryKey: ['similar', vehicleId, start, end],
    queryFn: () => vehicleApi.similar(vehicleId, hasDates ? start : undefined, hasDates ? end : undefined, 8),
  });
  const cardWidth = Math.min(width * 0.78, 340);
  if (isPending) return <Skeleton height={300} width={cardWidth} round={radius.xl} />;
  if (!data?.length) return null;
  return (
    <View style={{ gap: space.md }}>
      <Text variant="title">{hasDates ? 'Similar cars for your dates' : 'Similar cars nearby'}</Text>
      <FlatList
        horizontal
        data={data}
        keyExtractor={(v) => v._id}
        renderItem={({ item }) => <VehicleCard vehicle={item} width={cardWidth} />}
        ItemSeparatorComponent={() => <View style={{ width: space.md }} />}
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + space.md}
        decelerationRate="fast"
        style={{ marginHorizontal: -space.lg }}
        contentContainerStyle={{ paddingHorizontal: space.lg }}
      />
    </View>
  );
}
