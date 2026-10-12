import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ShieldCheck } from 'lucide-react-native';
import { Avatar, Button, Card, DateOfBirthInput, Input, ScreenHeader, Section, Text, useTheme, useToast, radius, space } from '@catodrive/ui';
import { PhoneInput, RequireAuth, safeReturn, usePhotoUpload } from '@catodrive/core';
import { accountApi } from '@catodrive/core/web/features/account/api';
import { EMPTY_SETUP, onboardingInput, setupChecklist, type SetupForm } from '@catodrive/core/web/features/account/setup-form';
import { usePlatformConfig } from '@catodrive/core/web/features/platform/config';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native';

/** The website's /account/setup: everything a rental and its insurer need, before the first booking. */
function Setup() {
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const minAge = usePlatformConfig().data?.legal?.minAgeYears ?? 18;
  const [form, setForm] = useState<SetupForm>(EMPTY_SETUP);
  const [avatar, setAvatar] = useState<{ url: string; key: string } | null>(null);
  const photo = usePhotoUpload('avatar');
  const [attempted, setAttempted] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const set = (k: keyof SetupForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const me = useQuery({ queryKey: ['me-prefill'], queryFn: () => accountApi.me() });
  useEffect(() => {
    if (!me.data) return;
    setForm((f) => ({ ...f, firstName: f.firstName || me.data.firstName || '', lastName: f.lastName || me.data.lastName || '', phone: f.phone || me.data.phone || '', dateOfBirth: f.dateOfBirth || me.data.dateOfBirth || '' }));
    if (me.data.avatarUrl && !avatar) setAvatar({ url: me.data.avatarUrl, key: '' });
  }, [me.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = useMutation({
    meta: { silentError: true },
    mutationFn: () => accountApi.completeOnboarding(onboardingInput(form, avatar?.url)),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['profile-status'] });
      toast({ tone: 'success', title: 'You’re all set', body: 'Your account is ready.' });
      router.replace(safeReturn(returnTo, '/') as never);
    },
    onError: (err) => toast({ tone: 'error', title: 'Couldn’t save', body: err instanceof ApiError ? err.message : 'Please check your details and try again.' }),
  });

  const required = setupChecklist(form);
  const missing = required.filter((r) => !r.ok);
  const done = required.length - missing.length;
  const bad = (key: string) => (attempted && missing.some((m) => m.key === key) ? 'Required' : undefined);

  const trySubmit = () => {
    if (missing.length === 0) return submit.mutate();
    setAttempted(true);
    toast({ tone: 'error', title: `${missing.length} required ${missing.length === 1 ? 'item is' : 'items are'} missing`, body: 'They are highlighted in red.' });
    scroller.current?.scrollTo({ y: 0, animated: true });
  };


  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title="Account setup" onBack={router.canGoBack() ? () => router.back() : undefined} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView ref={scroller} contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={16} color={c.primary} />
              <Text variant="small" tone="primary">ACCOUNT SETUP</Text>
            </View>
            <Text variant="display">Finish setting up your account</Text>
            <Text tone="muted">We need a few details before you can book - this is what a rental (and its insurer) requires. You must be at least {minAge}.</Text>
            <Text variant="caption" tone="muted">Everything is required except your profile photo.</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="caption">{done} of {required.length} required items done</Text>
              <Text variant="caption">{Math.round((done / required.length) * 100)}%</Text>
            </View>
            <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: c.muted, overflow: 'hidden' }}>
              <View style={{ width: `${(done / required.length) * 100}%`, height: '100%', backgroundColor: c.primary }} />
            </View>
          </View>

          {attempted && missing.length ? (
            <Card style={{ borderColor: c.destructive }}>
              <Text variant="label" tone="destructive">Still needed:</Text>
              {missing.map((m) => <Text key={m.key} variant="caption">• {m.label}</Text>)}
            </Card>
          ) : null}

          <Pressable accessibilityRole="button" accessibilityLabel="Add a profile photo" onPress={async () => {
            const up = await photo.upload();
            if (up) setAvatar(up);
          }} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Avatar uri={avatar?.url} name={form.firstName} size={64} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Camera size={16} color={c.primary} />
                <Text variant="label" tone="primary">{photo.uploading ? 'Uploading…' : 'Profile photo (optional)'}</Text>
              </View>
              <Text variant="caption" tone="muted">Optional, but a clear photo of your face helps hosts recognise you at handover.</Text>
            </View>
          </Pressable>

          <Section title="Legal identity">
            <Input label="Legal first name" value={form.firstName} onChangeText={set('firstName')} autoComplete="given-name" error={bad('firstName')} />
            <Input label="Legal last name" value={form.lastName} onChangeText={set('lastName')} autoComplete="family-name" error={bad('lastName')} />
            <DateOfBirthInput value={form.dateOfBirth} onChange={set('dateOfBirth')} error={bad('dateOfBirth')} />
            <PhoneInput label="Mobile number" value={form.phone} onChange={set('phone')} error={bad('phone')} />
          </Section>

          <Section title="Home address">
            <Input label="Street address" value={form.line1} onChangeText={set('line1')} autoComplete="street-address" error={bad('line1')} />
            <Input label="Apt, suite, unit (optional)" value={form.line2} onChangeText={set('line2')} placeholder="Apt 4B" />
            <Input label="City" value={form.city} onChangeText={set('city')} autoComplete="postal-address-locality" error={bad('city')} />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}><Input label="State / province" value={form.state} onChangeText={set('state')} autoComplete="postal-address-region" error={bad('state')} /></View>
              <View style={{ flex: 1 }}><Input label="ZIP / postal code" value={form.zip} onChangeText={set('zip')} autoComplete="postal-code" error={bad('zip')} /></View>
            </View>
            <Input label="Country" value={form.country} onChangeText={set('country')} autoComplete="postal-address-country" error={bad('country')} />
          </Section>

          <Section title="Emergency contact">
            <Input label="Full name" value={form.ecName} onChangeText={set('ecName')} error={bad('ecName')} />
            <PhoneInput label="Phone" value={form.ecPhone} onChange={set('ecPhone')} error={bad('ecPhone')} />
            <Input label="Relationship (optional)" value={form.ecRelation} onChangeText={set('ecRelation')} placeholder="Parent, partner, friend…" />
          </Section>

          <Button title="Complete setup" loading={submit.isPending} onPress={trySubmit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function SetupScreen() {
  return (
    <RequireAuth>
      <Setup />
    </RequireAuth>
  );
}
