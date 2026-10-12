import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GitCompare, X } from 'lucide-react-native';
import { Button, Text, radius, space, useTheme } from '@catodrive/ui';
import { useCompareStore } from './compare-store';

/** The floating tray shown while one or more cars are queued for comparison. */
export function CompareBar() {
  const { c } = useTheme();
  const router = useRouter();
  const ids = useCompareStore((s) => s.ids);
  const clear = useCompareStore((s) => s.clear);
  if (ids.length === 0) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, paddingLeft: space.md, borderRadius: radius.pill, backgroundColor: c.ink, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}
    >
      <GitCompare size={18} color={c.inkForeground} />
      <Text variant="label" style={{ flex: 1, color: c.inkForeground }}>{ids.length} car{ids.length > 1 ? 's' : ''} to compare</Text>
      <Button title="Compare" size="sm" full={false} disabled={ids.length < 2} onPress={() => router.push({ pathname: '/compare', params: { ids: ids.join(',') } })} />
      <Pressable accessibilityRole="button" accessibilityLabel="Clear compare" hitSlop={8} onPress={clear} style={{ padding: 6 }}>
        <X size={18} color={c.inkForeground} />
      </Pressable>
    </View>
  );
}
