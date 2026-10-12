import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { KeyRound, Monitor, Star } from 'lucide-react-native';
import { Badge, Button, Card, Input, Screen, ScreenHeader, Section, Skeleton, Text, useConfirm, useTheme, useToast, space } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { accountApi } from '@catodrive/core/web/features/account/api';
import { formatDate } from '@catodrive/core/web/lib/utils/format';

function shortUa(ua?: string): string {
  if (!ua) return 'Unknown device';
  if (/catodrive|expo|okhttp|cfnetwork/i.test(ua)) return 'CatoDrive app';
  if (/mobile/i.test(ua)) return 'Mobile browser';
  if (/chrome/i.test(ua)) return 'Chrome';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return ua.slice(0, 40);
}

/** Two-factor authentication and signed-in devices, as on the website's account page. */
function Security() {
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const mfa = useQuery({ queryKey: ['mfa'], queryFn: () => accountApi.mfaStatus() });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => accountApi.sessions() });
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [token, setToken] = useState('');

  const start = useMutation({ mutationFn: () => accountApi.mfaSetup(), onSuccess: setSetup });
  const enable = useMutation({
    meta: { silentError: true },
    mutationFn: () => accountApi.mfaEnable(token),
    onSuccess: () => {
      setSetup(null);
      setToken('');
      void qc.invalidateQueries({ queryKey: ['mfa'] });
    },
  });
  const disable = useMutation({
    mutationFn: () => accountApi.mfaDisable(token),
    onSuccess: () => {
      setToken('');
      void qc.invalidateQueries({ queryKey: ['mfa'] });
    },
  });
  const revoke = useMutation({ mutationFn: (id: string) => accountApi.revokeSession(id), onSuccess: () => void qc.invalidateQueries({ queryKey: ['sessions'] }) });
  const logoutOthers = useMutation({ mutationFn: () => accountApi.logoutOthers(), onSuccess: () => void qc.invalidateQueries({ queryKey: ['sessions'] }) });

  return (
    <Screen header={<ScreenHeader title="Security and devices" onBack={() => router.back()} />}>
      <Section title="Two-factor authentication">
        <Card>
          {mfa.isPending ? (
            <Skeleton height={60} />
          ) : mfa.data?.enabled ? (
            <View style={{ gap: space.md }}>
              <Badge label="Enabled" tone="success" />
              <Text variant="caption" tone="muted">Enter a code from your authenticator app to disable.</Text>
              <Input value={token} onChangeText={(t) => setToken(t.replace(/\D/g, '').slice(0, 6))} placeholder="000000" keyboardType="number-pad" maxLength={6} />
              <Button
                title="Disable 2FA"
                variant="outline"
                disabled={token.length !== 6}
                loading={disable.isPending}
                onPress={async () => {
                  const { ok } = await confirm({ title: 'Disable two-factor authentication?', description: 'Your account will be significantly less secure. Anyone with your password can sign in.', confirmLabel: 'Disable 2FA', tone: 'destructive', requireText: 'DISABLE' });
                  if (ok) disable.mutate();
                }}
              />
            </View>
          ) : setup ? (
            <View style={{ gap: space.md }}>
              <Text variant="caption" tone="muted">Add this secret to your authenticator app (Google Authenticator, Authy), then enter a code to confirm.</Text>
              <Text variant="label" selectable style={{ letterSpacing: 1 }}>{setup.secret}</Text>
              <Button
                title="Copy secret"
                size="sm"
                variant="outline"
                full={false}
                onPress={async () => {
                  await Clipboard.setStringAsync(setup.secret);
                  toast({ tone: 'success', title: 'Copied' });
                }}
              />
              <Input value={token} onChangeText={(t) => setToken(t.replace(/\D/g, '').slice(0, 6))} placeholder="000000" keyboardType="number-pad" maxLength={6} />
              <Button title="Confirm & enable" disabled={token.length !== 6} loading={enable.isPending} onPress={() => enable.mutate()} />
              {enable.isError ? <Text variant="caption" tone="destructive">Invalid code - try again.</Text> : null}
            </View>
          ) : (
            <View style={{ gap: space.md }}>
              <Text tone="muted">Protect your account with an authenticator app.</Text>
              <Button title="Set up 2FA" icon={<KeyRound size={18} color={c.primaryForeground} />} loading={start.isPending} onPress={() => start.mutate()} />
            </View>
          )}
        </Card>
      </Section>

      <Section
        title="Devices & sessions"
        action={
          <Button
            title="Log out others"
            size="sm"
            variant="outline"
            full={false}
            loading={logoutOthers.isPending}
            onPress={async () => {
              const { ok } = await confirm({ title: 'Log out all other devices?', description: 'Every other session will be signed out immediately. This device stays signed in.', confirmLabel: 'Log out others', tone: 'destructive' });
              if (ok) logoutOthers.mutate();
            }}
          />
        }
      >
        {sessions.isPending ? <Skeleton height={80} /> : null}
        {sessions.data?.map((s) => (
          <Card key={s.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Monitor size={20} color={c.mutedForeground} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                  <Text variant="label">{shortUa(s.userAgent)}</Text>
                  {s.current ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Star size={12} color={c.success} />
                      <Text variant="small" tone="success">This device</Text>
                    </View>
                  ) : null}
                </View>
                <Text variant="caption" tone="muted">Active since {formatDate(s.createdAt)}</Text>
              </View>
              {!s.current ? (
                <Button
                  title="Revoke"
                  size="sm"
                  variant="ghost"
                  full={false}
                  loading={revoke.isPending && revoke.variables === s.id}
                  onPress={async () => {
                    const { ok } = await confirm({ title: 'Revoke this session?', description: 'That device will be signed out immediately.', confirmLabel: 'Revoke session', tone: 'destructive' });
                    if (ok) revoke.mutate(s.id);
                  }}
                />
              ) : null}
            </View>
          </Card>
        ))}
      </Section>
    </Screen>
  );
}

export default function SecurityScreen() {
  return (
    <RequireAuth>
      <Security />
    </RequireAuth>
  );
}
