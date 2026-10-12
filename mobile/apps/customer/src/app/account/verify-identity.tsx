import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { Camera, CheckCircle2, Clock, IdCard, LockKeyhole, RefreshCw, ScanFace, ShieldCheck, XCircle } from 'lucide-react-native';
import { Badge, Button, Card, Checkbox, KeyValue, Screen, ScreenHeader, Section, Skeleton, Text, useTheme, useToast, radius, space } from '@catodrive/ui';
import { RequireAuth, pickPhotos, safeReturn, uploadPhotos, type PickedPhoto } from '@catodrive/core';
import { accountApi } from '@catodrive/core/web/features/account/api';
import { kycApi, type KycStatusView } from '@catodrive/core/web/features/kyc/api';
import { KYC_MANUAL_FIELDS, KYC_STEPS, kycReasonLabel } from '@catodrive/core/web/features/kyc/copy';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatDay } from '@catodrive/core/web/lib/utils/format';

const STEP_ICON = { license: IdCard, selfie: ScanFace, secure: LockKeyhole };

/** Camera-only fallback: three live shots, reviewed by the team. No gallery, like the website. */
function ManualUpload({ disabled, onSubmitted }: { disabled: boolean; onSubmitted: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const [shots, setShots] = useState<Record<string, PickedPhoto | undefined>>({});
  const complete = KYC_MANUAL_FIELDS.every((f) => shots[f.id]);
  const submit = useMutation({
    meta: { silentError: true },
    mutationFn: async () => {
      const uploaded = await Promise.all(KYC_MANUAL_FIELDS.map((f) => uploadPhotos('kyc', [shots[f.id]!])));
      return kycApi.submitDocuments(KYC_MANUAL_FIELDS.map((f, i) => ({ type: f.type, key: uploaded[i][0].key })));
    },
    onSuccess: onSubmitted,
    onError: (e) => toast({ title: e instanceof ApiError ? e.message : (e as Error).message, tone: 'error' }),
  });
  return (
    <Card>
      <Text variant="heading">Verify with your camera instead</Text>
      <Text variant="caption" tone="muted">Take the photos live with your camera. Each one is stamped with the date, time and place, and there is no option to upload from your gallery. Reviewed by our team, usually within a few hours, and visible only to our verification team.</Text>
      <View style={{ gap: space.sm, marginTop: space.md }}>
        {KYC_MANUAL_FIELDS.map((f) => (
          <Pressable
            key={f.id}
            accessibilityRole="button"
            accessibilityLabel={`Take ${f.label}`}
            disabled={disabled}
            onPress={async () => {
              const shot = await pickPhotos('camera', { selfie: f.type === 'selfie' });
              if (shot?.[0]) setShots((s) => ({ ...s, [f.id]: shot[0] }));
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: shots[f.id] ? c.success : c.border, borderRadius: radius.lg, padding: space.md }}
          >
            {shots[f.id] ? <Image source={{ uri: shots[f.id]!.uri }} style={{ width: 56, height: 40, borderRadius: 6 }} /> : <Camera size={22} color={c.mutedForeground} />}
            <Text variant="label" style={{ flex: 1 }}>{f.label}</Text>
            {shots[f.id] ? <CheckCircle2 size={18} color={c.success} /> : null}
          </Pressable>
        ))}
      </View>
      <Button title="Submit for review" disabled={!complete || disabled} loading={submit.isPending} style={{ marginTop: space.md }} onPress={() => submit.mutate()} />
    </Card>
  );
}

/** The website's /account/verify-identity on Stripe's hosted check, with a camera-only fallback. */
function VerifyIdentity() {
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const { returnTo: rawReturn } = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = rawReturn ? safeReturn(rawReturn, '') : '';
  const me = useQuery({ queryKey: ['me'], queryFn: () => accountApi.me(), refetchOnMount: 'always', staleTime: 0 });
  const status = useQuery({
    queryKey: ['kyc-status'],
    queryFn: () => kycApi.status(),
    refetchInterval: (q) => ((q.state.data as KycStatusView | undefined)?.status === 'pending' ? 5000 : false),
  });
  const [confirmed, setConfirmed] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['kyc-status'] });

  useEffect(() => {
    if (returnTo && status.data?.status === 'approved') router.replace(returnTo as never);
  }, [returnTo, status.data?.status, router]);

  const start = useMutation({
    meta: { silentError: true },
    mutationFn: async () => {
      const session = await kycApi.startVerification();
      if (session.url && session.url !== 'about:blank') {
        await WebBrowser.openBrowserAsync(session.url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN });
        return 'returned' as const;
      }
      return 'unavailable' as const;
    },
    onSuccess: (r) => {
      if (r === 'returned') {
        refresh();
        toast({ title: 'Thanks - checking your verification', tone: 'info' });
      } else setCaptureFailed(true);
    },
    onError: (e) => {
      setCaptureFailed(true);
      toast({ title: e instanceof ApiError ? e.message : (e as Error).message, tone: 'error' });
    },
  });

  const header = <ScreenHeader title="Verify your identity" onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />;
  if (status.isPending || me.isPending) return <Screen header={header}><Skeleton height={200} /></Screen>;

  const s = status.data?.status ?? 'not_started';
  const p = me.data;
  const nameKnown = !!(p?.firstName && p?.lastName);
  const address = p?.addresses?.find((a) => a.isDefault) ?? p?.addresses?.[0];
  const missingBasics = !nameKnown || !p?.dateOfBirth;

  return (
    <Screen header={header} onRefresh={refresh} refreshing={status.isRefetching}>
      <Text tone="muted">Every driver on CatoDrive is identity-verified against a government-issued ID. It&apos;s mandatory before you can book - so hosts and guests always know exactly who they&apos;re dealing with.</Text>

      {s === 'approved' ? (
        <Card>
          <CheckCircle2 size={32} color={c.success} />
          <Text variant="title" style={{ marginTop: space.sm }}>You’re verified</Text>
          <Text tone="muted">Your identity is confirmed. You’re all set to book.</Text>
          <Button title={returnTo ? 'Back to your car' : 'Find a car'} style={{ marginTop: space.md }} onPress={() => (returnTo ? router.replace(returnTo as never) : router.navigate('/search'))} />
        </Card>
      ) : null}

      {s === 'pending' ? (
        <Card>
          <Clock size={32} color={c.warning} />
          <Text variant="title" style={{ marginTop: space.sm }}>Under review</Text>
          <Text tone="muted">We’ve got your documents and are reviewing them now. Most checks finish in a few minutes - we’ll notify you the moment it’s done.</Text>
          <Button title="Check again" variant="outline" icon={<RefreshCw size={16} color={c.foreground} />} style={{ marginTop: space.md }} onPress={refresh} />
        </Card>
      ) : null}

      {s === 'not_started' || s === 'rejected' ? (
        <>
          {s === 'rejected' ? (
            <Card style={{ borderColor: c.destructive }}>
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <XCircle size={22} color={c.destructive} />
                <View style={{ flex: 1 }}>
                  <Text variant="label">Your last check didn’t pass</Text>
                  <Text variant="caption" tone="muted">{kycReasonLabel(status.data?.reason)} You can try again - a clear, well-lit photo of a valid license usually does it.</Text>
                </View>
              </View>
            </Card>
          ) : null}

          <Section title="Why we ask">
            <Text variant="caption" tone="muted">Every driver is checked against a government-issued ID so hosts know exactly who’s behind the wheel - and so you can trust the guests and hosts you meet. It’s how we keep fraud and unsafe drivers off the platform.</Text>
            <Text variant="caption" tone="muted">Your license images are handled by our verification partner and are never shared with hosts or stored on your profile.</Text>
          </Section>

          <Section title="What you’ll do">
            {KYC_STEPS.map((step) => {
              const Icon = STEP_ICON[step.key];
              return (
                <View key={step.key} style={{ flexDirection: 'row', gap: space.md }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primarySoft }}>
                    <Icon size={18} color={c.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="label">{step.title}</Text>
                    <Text variant="caption" tone="muted">{step.detail}</Text>
                  </View>
                </View>
              );
            })}
          </Section>

          <Card>
            <Text variant="heading">Confirm your details</Text>
            <Text variant="caption" tone="muted">These must match the license you’re about to scan.</Text>
            <View style={{ gap: space.sm, marginVertical: space.md }}>
              <KeyValue label="Legal name" value={nameKnown ? `${p!.firstName} ${p!.lastName}` : '-'} />
              <KeyValue label="Date of birth" value={p?.dateOfBirth ? formatDay(p.dateOfBirth) : '-'} />
              <KeyValue label="Address" value={address ? [address.line1, address.line2, address.city, [address.state, address.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '-'} />
            </View>
            <Text variant="caption" tone="muted">
              Something wrong? <Text variant="caption" tone="primary" onPress={() => router.push('/account/profile')}>Change it on your account</Text>, then come back. Your default saved address is the one shown here.
            </Text>
            {missingBasics ? <Text variant="caption" tone="warning" style={{ marginTop: space.sm }}>Add your legal name and date of birth on your account first.</Text> : null}
            <View style={{ marginTop: space.md }}>
              <Checkbox checked={confirmed} onChange={setConfirmed} label="The details above match my government-issued ID, and I’m ready to scan it." />
            </View>
            <Button
              title={s === 'rejected' ? 'Try again' : 'Start verification'}
              icon={<Camera size={18} color={c.primaryForeground} />}
              loading={start.isPending}
              disabled={!confirmed || missingBasics}
              style={{ marginTop: space.md }}
              onPress={() => start.mutate()}
            />
          </Card>

          {captureFailed ? <ManualUpload disabled={missingBasics} onSubmitted={() => { refresh(); toast({ title: 'Submitted for review', tone: 'success' }); }} /> : null}
        </>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm }}>
        <Badge label="Encrypted" tone="primary" />
        <Text variant="caption" tone="muted">Powered by Stripe Identity</Text>
        <ShieldCheck size={14} color={c.mutedForeground} />
      </View>
    </Screen>
  );
}

export default function VerifyIdentityScreen() {
  return (
    <RequireAuth>
      <VerifyIdentity />
    </RequireAuth>
  );
}
