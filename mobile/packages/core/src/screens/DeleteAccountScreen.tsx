import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react-native';
import { Button, Card, Input, QueryView, Screen, ScreenHeader, Text, useTheme, useToast, space } from '@catodrive/ui';
import { accountApi } from '../web/features/account/api';
import { ApiError } from '../web/lib/api/types';
import { signOutEverywhere } from '../web/features/auth/session';
import { unregisterPush } from '../push';

/**
 * In-app account deletion (a store requirement). The server refuses while a
 * trip is live, a dispute is open, a deposit is held or a legal hold applies,
 * and asks the holder to prove it is them again: password, or a fresh code for
 * accounts that never set one.
 */
export function DeleteAccountScreen({ afterPath = '/' }: { afterPath?: string }) {
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeMode, setCodeMode] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>();

  const eligibility = useQuery({ queryKey: ['erasure-eligibility'], queryFn: () => accountApi.erasureEligibility() });

  const sendCode = useMutation({
    meta: { silentError: true },
    mutationFn: () => accountApi.requestErasureCode(),
    onSuccess: (r) => {
      setCodeMode(true);
      setDevCode(r.devCode);
      toast({ tone: 'success', title: 'Code sent', body: 'Check your email or texts for the code.' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Couldn’t send a code. Please try again.' }),
  });

  const erase = useMutation({
    meta: { silentError: true },
    mutationFn: () => accountApi.erase(codeMode ? { code } : { password }),
    onSuccess: async () => {
      await unregisterPush();
      await signOutEverywhere(qc);
      toast({ tone: 'success', title: 'Your account has been deleted' });
      router.replace(afterPath as never);
    },
  });

  return (
    <Screen header={<ScreenHeader title="Delete account" onBack={() => router.back()} />}>
      <QueryView query={eligibility}>
        {(e) =>
          !e.eligible ? (
            <Card>
              <View style={styles.row}>
                <AlertTriangle size={20} color={c.warning} />
                <Text variant="heading">You can’t delete your account yet</Text>
              </View>
              <View style={styles.list}>
                {e.blockers.map((b) => (
                  <Text key={b} tone="muted">• {b}</Text>
                ))}
              </View>
              <Text tone="muted">Once these are settled you can delete your account here, or contact support for help.</Text>
            </Card>
          ) : (
            <View style={styles.form}>
              <Text>Deleting your account is permanent. Your profile, saved cars, messages and documents are removed and your sign-in stops working.</Text>
              <Text tone="muted">Records the law requires us to keep (payments, receipts, tax) are kept without your name attached.</Text>
              {codeMode ? (
                <>
                  {devCode ? <Text variant="caption" tone="warning">Test code: {devCode}</Text> : null}
                  <Input label="Confirmation code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" autoComplete="one-time-code" />
                </>
              ) : (
                <>
                  <Input label="Your password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
                  <Button title="I signed up without a password: send me a code" variant="ghost" loading={sendCode.isPending} onPress={() => sendCode.mutate()} />
                </>
              )}
              {erase.isError ? <Text variant="caption" tone="destructive" accessibilityRole="alert">{erase.error instanceof ApiError ? erase.error.message : 'That didn’t go through. Please try again.'}</Text> : null}
              <Button
                title="Delete my account"
                variant="destructive"
                loading={erase.isPending}
                disabled={codeMode ? code.length < 4 : !password}
                onPress={() => erase.mutate()}
              />
            </View>
          )
        }
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  list: { gap: 4, marginBottom: space.sm },
  form: { gap: space.lg },
});
