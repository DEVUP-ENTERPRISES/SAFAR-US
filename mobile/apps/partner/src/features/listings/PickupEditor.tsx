import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Camera, KeyRound, Lock, MapPin, X } from 'lucide-react-native';
import { Button, Card, Input, Text, space, useTheme, useToast } from '@catodrive/ui';
import { usePhotoUpload } from '@catodrive/core';
import { vehicleApi } from '@catodrive/core/web/features/vehicles/api';
import { pickupPatch } from '@catodrive/core/web/features/vehicles/listing-form';

/** Where the car is parked and how to get in; the access code reaches the guest only once they set off. */
export function PickupEditor({ vehicleId, initial, onSaved }: { vehicleId: string; initial?: { instructions?: string; spotPhotoUrl?: string; accessCode?: string } | null; onSaved?: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const photo = usePhotoUpload('vehicle_photo', 'camera');
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [accessCode, setAccessCode] = useState(initial?.accessCode ?? '');
  const [spotPhotoUrl, setSpotPhotoUrl] = useState(initial?.spotPhotoUrl ?? '');
  const save = useMutation({
    meta: { silentError: true },
    mutationFn: () => vehicleApi.update(vehicleId, pickupPatch({ instructions, accessCode, spotPhotoUrl })),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Pickup details saved' });
      onSaved?.();
    },
    onError: () => toast({ tone: 'error', title: 'Could not save those details' }),
  });
  const dirty = instructions !== (initial?.instructions ?? '') || accessCode !== (initial?.accessCode ?? '') || spotPhotoUrl !== (initial?.spotPhotoUrl ?? '');

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <MapPin size={16} color={c.primary} />
        <Text variant="heading">Finding the car</Text>
      </View>
      <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>Shown to your guest once they are on their way. This is what stops the “I’m here, where exactly?” message.</Text>
      <View style={{ gap: space.md, marginTop: space.md }}>
        <Input
          label="Where it is parked"
          hint="Level, bay, entrance, which side of the street"
          value={instructions}
          onChangeText={setInstructions}
          multiline
          placeholder="Level 3 of the Main St garage, bay 44, blue section. Lift on the north side."
          style={{ minHeight: 80, textAlignVertical: 'top' }}
        />
        <Text variant="label">Photo of the spot</Text>
        {spotPhotoUrl ? (
          <View>
            <Image source={{ uri: spotPhotoUrl }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 12 }} contentFit="cover" accessibilityLabel="The pickup spot" />
            <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => setSpotPhotoUrl('')} style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color="#fff" />
            </Pressable>
          </View>
        ) : (
          <Button
            title="Take a photo"
            variant="outline"
            icon={<Camera size={16} color={c.foreground} />}
            loading={photo.uploading}
            onPress={async () => {
              const up = await photo.upload();
              if (up) setSpotPhotoUrl(up.url);
            }}
          />
        )}
        <Text variant="caption" tone="muted">Optional, and worth more than the description.</Text>
        <Input label="Gate or lockbox code" hint="Only your guest sees this, and only after they set off" value={accessCode} onChangeText={setAccessCode} placeholder="4417" autoComplete="off" />
        {accessCode.trim() ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Lock size={14} color={c.mutedForeground} />
            <Text variant="caption" tone="muted" style={{ flex: 1 }}>Held back until your guest taps “on my way”, so it is not sitting in their inbox for a week.</Text>
          </View>
        ) : null}
        <Button title="Save pickup details" icon={<KeyRound size={16} color={c.primaryForeground} />} disabled={!dirty} loading={save.isPending} onPress={() => save.mutate()} />
      </View>
    </Card>
  );
}
