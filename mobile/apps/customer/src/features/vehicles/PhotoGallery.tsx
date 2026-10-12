import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { Text, useTheme, radius, space } from '@catodrive/ui';
import type { VehiclePhoto } from '@catodrive/core/web/features/vehicles/types';

/** Swipe through every photo; tap opens them full screen. */
export function PhotoGallery({ photos, title, fallback, overlay }: { photos: VehiclePhoto[]; title: string; fallback: string; overlay?: React.ReactNode }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const height = Math.round(width * 0.72);

  if (!photos.length) {
    return (
      <View style={[styles.empty, { height, backgroundColor: c.primary }]}>
        <Text variant="display" style={{ color: '#fff', fontSize: 72, lineHeight: 80, opacity: 0.85 }}>{fallback}</Text>
        {overlay}
      </View>
    );
  }

  return (
    <View>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p, i) => `${p.url}-${i}`}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index: i }) => (
          <Pressable accessibilityRole="imagebutton" accessibilityLabel={`Open photo ${i + 1} of ${photos.length}`} onPress={() => setOpen(i)}>
            <Image source={{ uri: item.url }} style={{ width, height }} contentFit="cover" transition={150} cachePolicy="memory-disk" accessibilityLabel={i === 0 ? title : undefined} />
          </Pressable>
        )}
      />
      {photos.length > 1 ? (
        <View style={styles.counter}>
          <Text variant="small" style={{ color: '#fff' }}>{index + 1} / {photos.length}</Text>
        </View>
      ) : null}
      {overlay}

      <Modal visible={open !== null} animationType="fade" onRequestClose={() => setOpen(null)} statusBarTranslucent>
        <SafeAreaView style={styles.lightbox}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close photos" onPress={() => setOpen(null)} hitSlop={12} style={styles.close}>
            <X size={26} color="#fff" />
          </Pressable>
          <FlatList
            data={photos}
            horizontal
            pagingEnabled
            initialScrollIndex={open ?? 0}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            keyExtractor={(p, i) => `lb-${p.url}-${i}`}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => <Image source={{ uri: item.url }} style={{ width, height: '100%' }} contentFit="contain" />}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', bottom: space.md, right: space.md, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  lightbox: { flex: 1, backgroundColor: '#000' },
  close: { position: 'absolute', top: 48, right: space.lg, zIndex: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
