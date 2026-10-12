import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../theme/theme';
import { Text } from './Text';

export function Avatar({ uri, name, size = 44 }: { uri?: string | null; name?: string; size?: number }) {
  const { c } = useTheme();
  const initials = (name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={box} contentFit="cover" cachePolicy="memory-disk" accessibilityLabel={name ? `${name}'s photo` : 'Profile photo'} />;
  return (
    <View style={[styles.fallback, box, { backgroundColor: c.primarySoft }]} accessibilityLabel={name ?? 'Profile'}>
      <Text variant="label" tone="primary" style={{ fontSize: size * 0.36 }}>{initials || '•'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
