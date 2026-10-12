import { useEffect, useRef } from 'react';
import { Animated, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/theme';
import { radius, space } from '../theme/tokens';

export function Skeleton({ height = 16, width = '100%', round = radius.md, style }: { height?: number; width?: DimensionValue; round?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ height, width, borderRadius: round, backgroundColor: c.muted, opacity: pulse }, style]} />;
}

/** A stack of placeholder cards for list screens while the first page loads. */
export function SkeletonList({ rows = 4, height = 92 }: { rows?: number; height?: number }) {
  return (
    <View style={{ gap: space.md }} accessibilityLabel="Loading" accessible>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} round={radius.xl} />
      ))}
    </View>
  );
}
