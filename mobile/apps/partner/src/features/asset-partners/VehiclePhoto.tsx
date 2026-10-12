import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Car } from 'lucide-react-native';
import { useTheme } from '@catodrive/ui';

/** A partner car's cover photo, or a car mark when none is uploaded yet. */
export function VehiclePhoto({ url, style }: { url?: string; style: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ backgroundColor: c.muted, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} cachePolicy="memory-disk" />
      ) : (
        <Car size={32} color={c.mutedForeground} />
      )}
    </View>
  );
}
