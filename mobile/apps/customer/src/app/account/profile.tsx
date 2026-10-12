import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react-native';
import { Avatar, Button, DateOfBirthInput, Input, Screen, ScreenHeader, Skeleton, Text, useTheme, useToast, space } from '@catodrive/ui';
import { PhoneInput, RequireAuth, usePhotoUpload } from '@catodrive/core';
import { accountApi } from '@catodrive/core/web/features/account/api';
import { ApiError } from '@catodrive/core/web/lib/api/types';

function Profile() {
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => accountApi.me() });
  const [p, setP] = useState({ firstName: '', lastName: '', phone: '', dateOfBirth: '', avatarUrl: '' });
  const photo = usePhotoUpload('avatar');

  useEffect(() => {
    if (me.data) setP({ firstName: me.data.firstName ?? '', lastName: me.data.lastName ?? '', avatarUrl: me.data.avatarUrl ?? '', phone: me.data.phone ?? '', dateOfBirth: me.data.dateOfBirth ?? '' });
  }, [me.data]);

  const save = useMutation({
    meta: { silentError: true },
    mutationFn: () => accountApi.updateProfile({ ...p, dateOfBirth: p.dateOfBirth || undefined, avatarUrl: p.avatarUrl || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me'] });
      toast({ tone: 'success', title: 'Saved ✓' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not save your profile' }),
  });


  return (
    <Screen header={<ScreenHeader title="Profile details" onBack={() => router.back()} />} footer={<Button title="Save profile" loading={save.isPending} onPress={() => save.mutate()} />}>
      {me.isPending || !me.data ? (
        <Skeleton height={300} />
      ) : (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Change profile photo" onPress={async () => {
            const up = await photo.upload();
            if (up) setP((prev) => ({ ...prev, avatarUrl: up.url }));
          }} style={{ alignSelf: 'center', alignItems: 'center', gap: space.sm }}>
            <Avatar uri={p.avatarUrl || null} name={p.firstName || me.data.email} size={96} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Camera size={16} color={c.primary} />
              <Text variant="label" tone="primary">{photo.uploading ? 'Uploading…' : 'Change photo'}</Text>
            </View>
          </Pressable>
          <Input label="First name" value={p.firstName} onChangeText={(t) => setP({ ...p, firstName: t })} autoComplete="given-name" />
          <Input label="Last name" value={p.lastName} onChangeText={(t) => setP({ ...p, lastName: t })} autoComplete="family-name" />
          <PhoneInput label="Phone" value={p.phone} onChange={(v) => setP((prev) => ({ ...prev, phone: v }))} />
          <DateOfBirthInput value={p.dateOfBirth} onChange={(v) => setP((prev) => ({ ...prev, dateOfBirth: v }))} />
          <Input label="Email" value={me.data.email ?? ''} editable={false} />
        </>
      )}
    </Screen>
  );
}

export default function ProfileScreen() {
  return (
    <RequireAuth>
      <Profile />
    </RequireAuth>
  );
}
