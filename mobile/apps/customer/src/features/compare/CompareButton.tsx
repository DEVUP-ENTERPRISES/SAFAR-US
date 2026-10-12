import { Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GitCompare } from 'lucide-react-native';
import { useTheme } from '@catodrive/ui';
import { useCompareStore } from './compare-store';

/** Adds a car to the compare tray, or takes it out. */
export function CompareButton({ vehicleId }: { vehicleId: string }) {
  const { c } = useTheme();
  const active = useCompareStore((s) => s.ids.includes(vehicleId));
  const toggle = useCompareStore((s) => s.toggle);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? 'Remove from compare' : 'Add to compare'}
      accessibilityState={{ selected: active }}
      hitSlop={8}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        toggle(vehicleId);
      }}
      style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.primary : 'rgba(0,0,0,0.35)' }}
    >
      <GitCompare size={18} color={active ? c.primaryForeground : '#fff'} />
    </Pressable>
  );
}
