import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Heart } from 'lucide-react-native';
import { useAuthStore } from '@catodrive/core/web/features/auth/store';
import { useFavoriteIds, useToggleFavorite } from '@catodrive/core/web/features/favorites/hooks';

const ROSE = '#f43f5e';

export function WishlistButton({ vehicleId, onDark = true }: { vehicleId: string; onDark?: boolean }) {
  const status = useAuthStore((s) => s.status);
  const router = useRouter();
  const { data: ids } = useFavoriteIds();
  const toggle = useToggleFavorite();
  const active = ids?.includes(vehicleId) ?? false;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? 'Remove from saved cars' : 'Save this car'}
      accessibilityState={{ selected: active }}
      hitSlop={8}
      onPress={() => {
        if (status !== 'authenticated') return router.push({ pathname: '/login', params: { returnTo: `/vehicles/${vehicleId}` } });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        toggle.mutate({ vehicleId, next: !active });
      }}
      style={[styles.btn, { backgroundColor: onDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.92)' }]}
    >
      <Heart size={20} color={active ? ROSE : onDark ? '#fff' : '#16130e'} fill={active ? ROSE : 'transparent'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
