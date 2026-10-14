import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Car, Check, ShieldCheck } from 'lucide-react-native';
import { Button, Card, ErrorState, Input, Screen, SkeletonList, Text, radius, space, useTheme } from '@catodrive/ui';
import { ABILITY_LABELS, captainApi } from '@catodrive/core/web/features/host/team-api';
import { authApi } from '@catodrive/core/web/features/auth/api';
import { useAuthStore } from '@catodrive/core/web/features/auth/store';
import { tokenStore } from '@catodrive/core/web/lib/api/token-store';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { config } from '@catodrive/core/web/lib/config';

/** The website's /host/accept-invite: a captain joins a host's team from the link in their invite. */
export default function AcceptInvite() {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { token: raw } = useLocalSearchParams<{ token?: string }>();
  const token = typeof raw === 'string' ? raw : '';
  const authStatus = useAuthStore((s) => s.status);
  const setUser = useAuthStore((s) => s.setUser);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const preview = useQuery({ queryKey: ['captain-invite', token], queryFn: () => captainApi.invitePreview(token), enabled: !!token, retry: false });
  const accept = useMutation({
    mutationFn: () => captainApi.accept(token, preview.data?.needsPassword ? password : undefined),
    onSuccess: async (res) => {
      // A new captain gets a session with the answer; an existing account was already signed in.
      if (res.tokens) {
        tokenStore.set(res.tokens.accessToken, res.tokens.refreshToken);
        const me = await authApi.me().catch(() => null);
        if (me) setUser({ id: me.id, email: me.email, roles: me.roles });
      }
      void qc.invalidateQueries({ queryKey: ['captain-queue'] });
      router.replace('/captain');
    },
    meta: { silentError: true },
  });

  const header = <Text variant="title" center>You&apos;re a Captain</Text>;
  if (!token) {
    return (
      <Screen contentStyle={{ justifyContent: 'center' }}>
        <ErrorState message="This link is missing its invite code. Open the link from your email again." />
      </Screen>
    );
  }
  if (preview.isPending) {
    return (
      <Screen>
        <SkeletonList rows={3} />
      </Screen>
    );
  }
  if (preview.isError) {
    return (
      <Screen contentStyle={{ justifyContent: 'center' }}>
        <ErrorState
          message={preview.error instanceof ApiError ? preview.error.message : "Couldn't load this invite. Check your connection and try again."}
          onRetry={() => void preview.refetch()}
        />
      </Screen>
    );
  }

  const inv = preview.data;
  const mismatch = inv.needsPassword && confirm.length > 0 && password !== confirm;
  // An existing account must be signed in as that person; the link alone never signs anyone in.
  const needsSignIn = !inv.needsPassword && authStatus !== 'authenticated';
  const canSubmit = needsSignIn ? false : inv.needsPassword ? password.length >= 8 && password === confirm : true;

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: space.sm, marginTop: space.lg }}>
        <View style={{ width: 56, height: 56, borderRadius: radius.lg, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck size={28} color={c.primaryForeground} />
        </View>
        {header}
        <Text tone="muted" center>{`${inv.fleetName} added you to their team${inv.title ? ` as ${inv.title}` : ''}.`}</Text>
      </View>

      <Card>
        <Text variant="small" tone="muted" style={{ letterSpacing: 2 }}>WHAT YOU CAN DO</Text>
        <View style={{ gap: space.md, marginTop: space.md }}>
          {inv.abilities.map((a) => (
            <View key={a} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
              <Check size={16} color={c.primary} />
              <View style={{ flex: 1 }}>
                <Text variant="label">{ABILITY_LABELS[a].label}</Text>
                <Text variant="caption" tone="muted">{ABILITY_LABELS[a].detail}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: c.muted }}>
          <Car size={16} color={c.mutedForeground} />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            {inv.vehicleCount === 0 ? 'Every car in the fleet, including ones added later' : `${inv.vehicleCount} ${inv.vehicleCount === 1 ? 'car' : 'cars'} assigned to you`}
          </Text>
        </View>
      </Card>

      <Input label="Your sign-in email" value={inv.email} editable={false} />
      {inv.needsPassword ? (
        <>
          <Input label="Choose a password" hint="At least 8 characters. You'll use this with the email above." value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
          <Input label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" error={mismatch ? 'Passwords do not match' : undefined} />
        </>
      ) : (
        <Text variant="caption" tone="muted">{`You already have a ${config.appName} account with this email - accepting links it to this fleet. Your existing password keeps working.`}</Text>
      )}

      {accept.isError ? (
        <Text variant="caption" tone="destructive">{accept.error instanceof ApiError ? accept.error.message : "Couldn't accept this invite"}</Text>
      ) : null}

      {needsSignIn ? (
        <Card>
          <Text variant="caption" tone="muted">You already have an account with this email. Sign in first, then you&apos;ll come back here to accept.</Text>
          <Button
            title="Sign in"
            variant="outline"
            style={{ marginTop: space.md }}
            onPress={() => router.push({ pathname: '/login', params: { returnTo: `/host/accept-invite?token=${encodeURIComponent(token)}` } })}
          />
        </Card>
      ) : (
        <Button title="Accept and continue" disabled={!canSubmit} loading={accept.isPending} onPress={() => accept.mutate()} />
      )}
    </Screen>
  );
}
