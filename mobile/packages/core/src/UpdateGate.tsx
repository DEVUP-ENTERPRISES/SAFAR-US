import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Download, X } from 'lucide-react-native';
import { Button, Screen, Text, useTheme, space } from '@catodrive/ui';
import { checkAppRelease, type UpdateState } from './app-release';
import { openExternal } from './links';
import { checkForOtaUpdate } from './ota';

/** Blocks a build below the minimum version; suggests an update below the latest. Never blocks when the check fails. */
export function UpdateGate({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const [state, setState] = useState<UpdateState>({ kind: 'ok' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void checkAppRelease(Platform.OS === 'ios' ? 'ios' : 'android').then(setState);
    void checkForOtaUpdate();
  }, []);

  if (state.kind === 'required') {
    return (
      <Screen scroll={false} edges={['top', 'bottom', 'left', 'right']} contentStyle={styles.center}>
        <View style={[styles.icon, { backgroundColor: c.primarySoft }]}>
          <Download size={30} color={c.primary} />
        </View>
        <Text variant="title" center>Update CatoDrive</Text>
        <Text tone="muted" center>This version is no longer supported. Update to the latest version to keep using the app.</Text>
        {state.storeUrl ? <Button title="Update" onPress={() => void openExternal(state.storeUrl)} /> : null}
      </Screen>
    );
  }

  return (
    <View style={styles.flex}>
      {children}
      {state.kind === 'optional' && !dismissed && state.storeUrl ? (
        <SafeAreaView edges={['bottom']} style={styles.bannerHost} pointerEvents="box-none">
          <View style={[styles.banner, { backgroundColor: c.ink }]}>
            <Pressable accessibilityRole="button" style={styles.bannerBody} onPress={() => void openExternal(state.storeUrl)}>
              <Text variant="label" style={{ color: c.inkForeground }}>A new version is available</Text>
              <Text variant="caption" style={{ color: c.inkForeground, opacity: 0.8 }}>Tap to update</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={12} onPress={() => setDismissed(true)}>
              <X size={20} color={c.inkForeground} />
            </Pressable>
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'stretch', gap: space.lg },
  icon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  bannerHost: { position: 'absolute', left: space.lg, right: space.lg, bottom: 72 },
  banner: { borderRadius: 16, padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md },
  bannerBody: { flex: 1 },
});
