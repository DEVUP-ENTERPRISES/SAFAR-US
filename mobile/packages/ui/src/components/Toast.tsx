import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/theme';
import { radius, space } from '../theme/tokens';
import { Text } from './Text';

type Tone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}

const ToastContext = createContext<(t: Omit<ToastItem, 'id'>) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const seq = useRef(0);
  const show = useCallback((t: Omit<ToastItem, 'id'>) => setItem({ ...t, id: ++seq.current }), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {item ? <ToastView key={item.id} item={item} onDone={() => setItem(null)} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const timer = setTimeout(() => Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(onDone), 3200);
    return () => clearTimeout(timer);
  }, [anim, onDone]);
  const accent = { success: c.success, error: c.destructive, info: c.primary }[item.tone];
  return (
    <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + 24 }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.toast,
          { backgroundColor: c.ink, borderLeftColor: accent, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
        ]}
      >
        <Text variant="label" style={{ color: c.inkForeground }}>{item.title}</Text>
        {item.body ? <Text variant="caption" style={{ color: c.inkForeground, opacity: 0.8 }}>{item.body}</Text> : null}
      </Animated.View>
    </View>
  );
}

/** Show a short message: toast({ tone: 'success', title: 'Saved' }). */
export function useToast() {
  const show = useContext(ToastContext);
  return useMemo(() => show, [show]);
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  toast: { width: '100%', borderRadius: radius.lg, paddingVertical: space.md, paddingHorizontal: space.lg, borderLeftWidth: 4, gap: 2 },
});
