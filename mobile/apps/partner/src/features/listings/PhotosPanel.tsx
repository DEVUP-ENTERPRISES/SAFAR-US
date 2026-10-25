import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Camera, Check, ImageIcon, Trash2 } from 'lucide-react-native';
import { Button, Text, space, useConfirm, useTheme, useToast } from '@catodrive/ui';
import { pickPhotos, uploadPhotos, type PickSource } from '@catodrive/core';
import { vehicleApi } from '@catodrive/core/web/features/vehicles/api';
import type { Vehicle } from '@catodrive/core/web/features/vehicles/types';
import { safeMessage } from '@catodrive/core/web/lib/utils/safe-message';

/** Add photos (camera or library), choose the cover guests see in search, and delete. */
export function PhotosPanel({ vehicle, onChanged }: { vehicle: Vehicle; onChanged: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const confirm = useConfirm();
  const [uploading, setUploading] = useState(false);
  const photos = vehicle.photos ?? [];
  const cover = photos.find((p) => p.isCover) ?? photos[0];

  const removePhoto = useMutation({ mutationFn: (key: string) => vehicleApi.removePhoto(vehicle._id, key), onSuccess: onChanged });
  const setCover = useMutation({
    mutationFn: (key: string) => vehicleApi.setCoverPhoto(vehicle._id, key),
    onSuccess: () => {
      onChanged();
      toast({ tone: 'success', title: 'Cover photo updated' });
    },
  });

  const add = async (source: PickSource) => {
    const picked = await pickPhotos(source, { multiple: true });
    if (!picked?.length) return;
    setUploading(true);
    try {
      const uploaded = await uploadPhotos('vehicle_photo', picked);
      await vehicleApi.addPhotos(vehicle._id, uploaded.map((u) => ({ url: u.url, key: u.key })));
      onChanged();
      toast({ tone: 'success', title: `${picked.length} photo${picked.length === 1 ? '' : 's'} added` });
    } catch (err) {
      toast({ tone: 'error', title: 'Photo upload failed', body: err instanceof Error ? safeMessage(err.message) : 'Please try again.' });
    } finally {
      setUploading(false);
    }
  };

  const doRemove = async (key: string, isCover: boolean) => {
    const { ok } = await confirm({
      title: 'Delete this photo?',
      description: isCover ? 'This is the cover photo - the next photo becomes the cover. This cannot be undone.' : 'This cannot be undone. You can upload it again later.',
      confirmLabel: 'Delete photo',
      tone: 'destructive',
    });
    if (ok) removePhoto.mutate(key);
  };

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Button title={uploading ? 'Uploading…' : 'Take photos'} icon={<Camera size={16} color={c.primaryForeground} />} loading={uploading} onPress={() => void add('camera')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="From library" variant="outline" icon={<ImageIcon size={16} color={c.foreground} />} disabled={uploading} onPress={() => void add('library')} />
        </View>
      </View>
      {photos.length > 0 ? (
        <>
          <Text variant="caption" tone="muted">The cover photo is what guests see in search results. Tap “Make cover” on a photo to change it.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {photos.map((p) => {
              const isCover = p.isCover || p.key === cover?.key;
              return (
                <View key={p.key ?? p.url} style={{ width: '48%', aspectRatio: 4 / 3, borderRadius: 12, overflow: 'hidden', borderWidth: isCover ? 2 : 0, borderColor: c.primary }}>
                  <Image source={{ uri: p.url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  {isCover ? (
                    <View style={{ position: 'absolute', left: 6, top: 6, flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: c.primary }}>
                      <Check size={12} color={c.primaryForeground} />
                      <Text variant="small" style={{ color: c.primaryForeground }}>Cover</Text>
                    </View>
                  ) : null}
                  {p.key && !isCover ? (
                    <Pressable accessibilityRole="button" onPress={() => setCover.mutate(p.key!)} style={{ position: 'absolute', left: 6, bottom: 6, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.65)' }}>
                      <Text variant="small" style={{ color: '#fff' }}>Make cover</Text>
                    </Pressable>
                  ) : null}
                  {p.key ? (
                    <Pressable accessibilityRole="button" accessibilityLabel="Delete photo" onPress={() => void doRemove(p.key!, isCover)} style={{ position: 'absolute', right: 6, top: 6, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={14} color="#fff" />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}
