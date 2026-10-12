import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ScreenCapture from 'expo-screen-capture';
import { EyeOff, FileText, X } from 'lucide-react-native';
import { Text, radius, space } from '@catodrive/ui';
import { ApiError } from '../web/lib/api/types';

type Loaded = { contentType: 'image/jpeg' | 'application/pdf'; data: string };
type Page = { id: string; label: string; state: 'loading' | 'ready' | 'error' | 'pdf'; uri?: string; message?: string };

export interface TimedViewerProps {
  title: string;
  subtitle: string;
  seconds: number;
  items: { id: string; label: string }[];
  load: (id: string) => Promise<Loaded>;
  onClose: () => void;
}

const CAPTURE_KEY = 'timed-viewer';

/**
 * Watermarked documents shown for a limited time, then closed. Screenshots and
 * screen recording are blocked while it's open, and the pages are hidden the
 * moment the app leaves the foreground, like the website's viewer on blur.
 */
export function TimedViewer({ title, subtitle, seconds, items, load, onClose }: TimedViewerProps) {
  const { width } = useWindowDimensions();
  const deadline = useRef(Date.now() + seconds * 1000);
  const [left, setLeft] = useState(seconds);
  const [covered, setCovered] = useState(false);
  const [pages, setPages] = useState<Page[]>(items.map((d) => ({ id: d.id, label: d.label, state: 'loading' })));

  const close = useCallback(() => {
    void ScreenCapture.allowScreenCaptureAsync(CAPTURE_KEY).catch(() => undefined);
    onClose();
  }, [onClose]);

  useEffect(() => {
    void ScreenCapture.preventScreenCaptureAsync(CAPTURE_KEY).catch(() => undefined);
    const sub = AppState.addEventListener('change', (s) => setCovered(s !== 'active'));
    const t = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0) close();
    }, 250);
    return () => {
      clearInterval(t);
      sub.remove();
      void ScreenCapture.allowScreenCaptureAsync(CAPTURE_KEY).catch(() => undefined);
    };
  }, [close]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const d of items) {
        try {
          const f = await load(d.id);
          if (cancelled) return;
          setPages((p) =>
            p.map((x) =>
              x.id === d.id
                ? f.contentType === 'application/pdf'
                  ? { ...x, state: 'pdf' }
                  : { ...x, state: 'ready', uri: `data:image/jpeg;base64,${f.data}` }
                : x,
            ),
          );
        } catch (e) {
          if (!cancelled) setPages((p) => p.map((x) => (x.id === d.id ? { ...x, state: 'error', message: e instanceof ApiError ? e.message : 'This document didn’t load.' } : x)));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');

  return (
    <Modal visible animationType="fade" onRequestClose={close} statusBarTranslucent>
      <SafeAreaView style={styles.root}>
        <View style={styles.bar}>
          <View style={{ flex: 1 }}>
            <Text variant="heading" style={styles.light}>{title}</Text>
            <Text variant="caption" style={styles.dim}>{subtitle}</Text>
          </View>
          <View style={styles.timer} accessibilityLabel={`Closes in ${mm} minutes ${ss} seconds`}>
            <Text variant="label" style={styles.light}>{mm}:{ss}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={12} style={styles.close}>
            <X size={24} color="#fff" />
          </Pressable>
        </View>
        {covered ? (
          <View style={styles.cover}>
            <EyeOff size={32} color="#fff" />
            <Text style={styles.light}>Hidden while CatoDrive is in the background.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.pages}>
            {pages.map((p) => (
              <View key={p.id} style={{ gap: space.sm }}>
                <Text variant="label" style={styles.light}>{p.label}</Text>
                {p.state === 'loading' ? <ActivityIndicator color="#fff" /> : null}
                {p.state === 'ready' && p.uri ? <Image source={{ uri: p.uri }} style={{ width: width - space.lg * 2, height: (width - space.lg * 2) * 1.35, borderRadius: radius.md }} contentFit="contain" /> : null}
                {p.state === 'pdf' ? (
                  <View style={styles.note}>
                    <FileText size={20} color="#fff" />
                    <Text variant="caption" style={styles.light}>This document is a PDF. Show it from your trip on catodrive.com.</Text>
                  </View>
                ) : null}
                {p.state === 'error' ? <Text variant="caption" style={{ color: '#fca5a5' }}>{p.message}</Text> : null}
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0a09' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  light: { color: '#fff' },
  dim: { color: 'rgba(255,255,255,0.65)' },
  timer: { borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: space.md, paddingVertical: 4 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  cover: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  pages: { padding: space.lg, gap: space.xl },
  note: { flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.08)' },
});
