import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { EmptyState, ErrorState, ScreenHeader, SkeletonList, useTheme, space } from '@catodrive/ui';
import { useFavorites } from '@catodrive/core/web/features/favorites/hooks';
import { useAuthStore } from '@catodrive/core/web/features/auth/store';
import { VehicleCard } from '@/features/vehicles/VehicleCard';
import { SignedOutPrompt } from '@/features/account/SignedOutPrompt';

function Saved() {
  const { c } = useTheme();
  const router = useRouter();
  const { data, isPending, isError, refetch, isRefetching } = useFavorites();
  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(v) => v._id}
      renderItem={({ item }) => <VehicleCard vehicle={item} />}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl }}
      ItemSeparatorComponent={() => <View style={{ height: space.lg }} />}
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
      ListEmptyComponent={
        isPending ? (
          <SkeletonList rows={2} height={300} />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : (
          <EmptyState icon={<Heart size={28} color={c.primary} />} title="No saved cars yet" body="Tap the heart on any car to save it here." actionLabel="Explore cars" onAction={() => router.navigate('/search')} />
        )
      }
    />
  );
}

/** The website's /wishlist. */
export default function WishlistTab() {
  const { c } = useTheme();
  const status = useAuthStore((s) => s.status);
  if (status === 'unauthenticated') {
    return <SignedOutPrompt title="Saved cars" heading="Save cars you like" body="Sign in, then tap the heart on any car to keep it here." returnTo="/wishlist" />;
  }
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title="Saved cars" large />
      {status === 'authenticated' ? <Saved /> : <View style={{ padding: space.lg }}><SkeletonList rows={2} height={300} /></View>}
    </SafeAreaView>
  );
}
