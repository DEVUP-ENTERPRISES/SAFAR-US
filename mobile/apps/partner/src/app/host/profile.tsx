import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { Avatar, Button, Card, Chip, Input, Screen, ScreenHeader, Section, Skeleton, Text, space, useTheme, useToast } from '@catodrive/ui';
import { RequireAuth, usePhotoUpload } from '@catodrive/core';
import { useHostMe, useUpdateHostProfile } from '@catodrive/core/web/features/host/hooks';
import { EMPTY_HOST_PROFILE, hostProfileForm, hostProfilePatch, type HostProfileForm } from '@catodrive/core/web/features/host/profile-form';

/** The website's /host/profile: what guests see, the business profile and banking details. */
function HostProfile() {
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { data, isPending } = useHostMe();
  const update = useUpdateHostProfile();
  const photo = usePhotoUpload('avatar');
  const [form, setForm] = useState<HostProfileForm>(EMPTY_HOST_PROFILE);

  useEffect(() => {
    if (data) setForm(hostProfileForm(data));
  }, [data]);

  const set = (k: keyof HostProfileForm) => (v: string) => setForm((prev) => ({ ...prev, [k]: v }));
  const save = () => update.mutate(hostProfilePatch(form), { onSuccess: () => toast({ tone: 'success', title: 'Saved ✓' }) });

  return (
    <Screen
      header={<ScreenHeader title="Host profile" onBack={() => (router.canGoBack() ? router.back() : router.replace('/host/menu'))} />}
      footer={<Button title="Save changes" loading={update.isPending} disabled={!data} onPress={save} />}
    >
      {isPending ? <Skeleton height={360} /> : (
        <>
          <Card>
            <Text variant="heading">Public profile</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>This is what guests see on your listings and on your profile page.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              onPress={async () => {
                const up = await photo.upload();
                if (up) setForm((prev) => ({ ...prev, avatarUrl: up.url, avatarKey: up.key }));
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md }}
            >
              <Avatar uri={form.avatarUrl || null} name={form.displayName} size={72} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Camera size={16} color={c.primary} />
                <Text variant="label" tone="primary">{photo.uploading ? 'Uploading…' : 'Change photo'}</Text>
              </View>
            </Pressable>
            {form.avatarUrl ? <Button title="Remove photo" variant="ghost" size="sm" full={false} onPress={() => setForm((prev) => ({ ...prev, avatarUrl: '', avatarKey: '' }))} /> : null}
            <View style={{ gap: space.md, marginTop: space.md }}>
              <Input label="Display name" value={form.displayName} onChangeText={set('displayName')} />
              <View style={{ gap: 6 }}>
                <Text variant="label">Host type</Text>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Chip label="Individual" selected={form.hostType === 'individual'} onPress={() => setForm((p) => ({ ...p, hostType: 'individual' }))} />
                  <Chip label="Business" selected={form.hostType === 'business'} onPress={() => setForm((p) => ({ ...p, hostType: 'business' }))} />
                </View>
              </View>
              <Input label="Lives in" hint="City guests will see, e.g. Brooklyn, NY" value={form.city} onChangeText={set('city')} placeholder="Brooklyn, NY" />
              <Input label="Work" hint="Optional" value={form.work} onChangeText={set('work')} placeholder="Photographer" />
              <Input label="Languages spoken" hint="Comma separated" value={form.languages} onChangeText={set('languages')} placeholder="English, Spanish" />
              <Input
                label="About you"
                hint="A short intro builds trust - why you host, what you love to drive"
                value={form.bio}
                onChangeText={set('bio')}
                multiline
                maxLength={500}
                style={{ minHeight: 96, textAlignVertical: 'top' }}
              />
            </View>
          </Card>
          <Section title="Business profile">
            <Card>
              <View style={{ gap: space.md }}>
                <Input label="Legal name" value={form.legalName} onChangeText={set('legalName')} />
                <Input label="Registration number" value={form.registrationNumber} onChangeText={set('registrationNumber')} />
                <Input label="Tax ID (EIN / SSN)" value={form.taxId} onChangeText={set('taxId')} autoCapitalize="none" />
              </View>
            </Card>
          </Section>
          <Section title="Banking details">
            <Card>
              <View style={{ gap: space.md }}>
                <Input label="Account holder" value={form.accountHolder} onChangeText={set('accountHolder')} />
                <Input label="Bank name" value={form.bankName} onChangeText={set('bankName')} />
                <Input label="Routing number" keyboardType="number-pad" value={form.ifscOrRouting} onChangeText={set('ifscOrRouting')} />
                <Input label="Account (last 4)" hint="Store only masked digits" keyboardType="number-pad" maxLength={4} value={form.accountNumberMasked} onChangeText={set('accountNumberMasked')} />
              </View>
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}

export default function HostProfileScreen() {
  return (
    <RequireAuth>
      <HostProfile />
    </RequireAuth>
  );
}
