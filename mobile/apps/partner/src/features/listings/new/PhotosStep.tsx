import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Camera, ImageIcon, X } from 'lucide-react-native';
import { Button, Text, space, useTheme, useToast } from '@catodrive/ui';
import { pickPhotos, uploadPhotos, type PickSource } from '@catodrive/core';
import { withCover } from '@catodrive/core/web/features/vehicles/new-listing';
import { useListingDraft } from './draft-store';

/** Add photos (duplicates skipped by content), pick the cover, remove; the cover moves on when it is removed. */
export function PhotosStep({ minPhotos, errors }: { minPhotos: number; errors: Record<string, string> }) {
  const { c } = useTheme();
  const toast = useToast();
  const d = useListingDraft((s) => s.draft);
  const set = useListingDraft((s) => s.set);
  const patch = useListingDraft((s) => s.patch);
  const [uploading, setUploading] = useState(false);

  const add = async (source: PickSource) => {
    const picked = await pickPhotos(source, { multiple: true });
    if (!picked?.length) return;
    setUploading(true);
    try {
      const uploaded = await uploadPhotos('vehicle_photo', picked);
      const seen = new Set(d.photos.map((p) => p.fingerprint).filter(Boolean) as string[]);
      const fresh = uploaded.filter((u) => !u.sha256 || !seen.has(u.sha256));
      const duplicates = uploaded.length - fresh.length;
      if (duplicates > 0) toast({ tone: 'error', title: `${duplicates} photo${duplicates === 1 ? ' was' : 's were'} already added`, body: 'Skipped the duplicates - pick different shots of the car.' });
      patch((prev) => ({ ...prev, photos: withCover([...prev.photos, ...fresh.map((u) => ({ url: u.url, key: u.key, isCover: false, fingerprint: u.sha256 }))]) }));
    } catch (err) {
      toast({ tone: 'error', title: 'Photo upload failed', body: err instanceof Error ? err.message : 'Please try again.' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={{ gap: space.md }}>
      <Text tone="muted">Add photos of your vehicle. Select several at once. Tap “Make cover” on any photo to make it the one guests see in search.</Text>
      <Text variant="label" tone={d.photos.length >= minPhotos ? 'success' : 'warning'}>
        {d.photos.length >= minPhotos ? `${d.photos.length} photos added` : `${d.photos.length} of ${minPhotos} required photos added - ${errors.photos}`}
      </Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Button title={uploading ? 'Uploading…' : 'Take photos'} icon={<Camera size={16} color={c.primaryForeground} />} loading={uploading} onPress={() => void add('camera')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="From library" variant="outline" icon={<ImageIcon size={16} color={c.foreground} />} disabled={uploading} onPress={() => void add('library')} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {d.photos.map((p, i) => {
          const isCover = p.isCover ?? (!d.photos.some((x) => x.isCover) && i === 0);
          return (
            <View key={p.key ?? i} style={{ width: '48%', aspectRatio: 4 / 3, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: isCover ? c.primary : c.border }}>
              <Image source={{ uri: p.url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              {isCover ? (
                <View style={{ position: 'absolute', left: 6, top: 6, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: c.primary }}>
                  <Text variant="small" style={{ color: c.primaryForeground }}>Cover</Text>
                </View>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel="Make this the cover photo" onPress={() => set('photos', d.photos.map((x, j) => ({ ...x, isCover: j === i })))} style={{ position: 'absolute', left: 6, bottom: 6, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.65)' }}>
                  <Text variant="small" style={{ color: '#fff' }}>Make cover</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                onPress={() => {
                  const next = d.photos.filter((_, j) => j !== i);
                  if (isCover && next.length) next[0] = { ...next[0], isCover: true };
                  set('photos', next);
                }}
                style={{ position: 'absolute', right: 6, top: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={14} color="#fff" />
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
