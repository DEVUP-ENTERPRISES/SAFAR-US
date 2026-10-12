import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, Card, Input, Screen, ScreenHeader, Text, useToast, space } from '@catodrive/ui';
import { authApi } from '../web/features/auth/api';
import { ApiError } from '../web/lib/api/types';

/** Same as the website: never reveals whether an email has an account; the request step always reports "sent". */
export function ForgotPasswordScreen({ signInPath }: { signInPath: string }) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();

  const request = useMutation({
    meta: { silentError: true },
    mutationFn: () => authApi.forgotPassword(email.trim()),
    onSuccess: (r) => {
      setDevCode(r.devCode);
      setStep('reset');
    },
  });
  const reset = useMutation({
    meta: { silentError: true },
    mutationFn: () => authApi.resetPassword(email.trim(), code.trim(), password),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Password updated', body: 'Sign in with your new password.' });
      router.replace(signInPath as never);
    },
    onError: (e) => toast({ tone: 'error', title: 'Couldn’t reset', body: e instanceof ApiError ? e.message : 'Check the code and try again.' }),
  });

  return (
    <Screen header={<ScreenHeader onBack={() => router.back()} />}>
      <View style={styles.head}>
        <Text variant="display">{step === 'email' ? 'Reset your password' : 'Enter your code'}</Text>
        <Text tone="muted">{step === 'email' ? 'Enter your email and we’ll send a 6-digit code to reset it.' : `We sent a code to ${email}. It expires in 5 minutes.`}</Text>
      </View>
      {step === 'email' ? (
        <View style={styles.form}>
          <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          {request.isError ? <Text variant="caption" tone="destructive">{request.error instanceof ApiError ? request.error.message : 'Please try again.'}</Text> : null}
          <Button title="Send reset code" loading={request.isPending} disabled={!email.trim()} onPress={() => request.mutate()} />
        </View>
      ) : (
        <View style={styles.form}>
          {devCode ? (
            <Card>
              <Text variant="caption" tone="warning">Email isn’t configured yet, so here’s your code for testing: {devCode}</Text>
            </Card>
          ) : null}
          <Input label="6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" />
          <Input label="New password" hint="At least 8 characters." value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
          <Button title="Set new password" loading={reset.isPending} disabled={!code.trim() || password.length < 8} onPress={() => reset.mutate()} />
          <Button title="Use a different email" variant="ghost" onPress={() => setStep('email')} />
        </View>
      )}
      <Text tone="muted" center>
        Remembered it?{' '}
        <Text tone="primary" variant="label" accessibilityRole="link" onPress={() => router.replace(signInPath as never)}>Back to sign in</Text>
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.sm, marginTop: space.sm },
  form: { gap: space.lg },
});
