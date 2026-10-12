import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Phone } from 'lucide-react-native';
import { Button, Input, OtpInput, Screen, ScreenHeader, Text, useTheme, useToast, space } from '@catodrive/ui';
import { authApi } from '../web/features/auth/api';
import { ADMIN_ROLES, loginWithGate, useOnAuthSuccess } from '../web/features/auth/session';
import type { AuthResult } from '../web/features/auth/types';
import { ApiError } from '../web/lib/api/types';
import { usePlatformConfig } from '../web/features/platform/config';
import { LegalConsent } from './LegalConsent';

/** Only same-app paths are honoured as a return target. */
export function safeReturn(raw: unknown, fallback: string): string {
  const p = typeof raw === 'string' ? raw : '';
  return p.startsWith('/') && !p.startsWith('//') ? p : fallback;
}

export interface SignInScreenProps {
  title: string;
  subtitle: string;
  /** Where to land after signing in when there is nothing to return to. */
  home: string;
  /** Shown under the form ("New to CatoDrive? Create an account"); omitted in the partner app. */
  footer?: React.ReactNode;
  forgotPath: string;
}

export function SignInScreen({ title, subtitle, home, footer, forgotPath }: SignInScreenProps) {
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = safeReturn(params.returnTo, home);
  const onAuthSuccess = useOnAuthSuccess();
  const phoneSignIn = !!usePlatformConfig().data?.auth?.phoneSignIn;

  const [mode, setMode] = useState<'password' | 'phone' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');

  const done = (result: AuthResult) => {
    onAuthSuccess(result);
    router.replace(returnTo as never);
  };

  const login = useMutation({
    meta: { silentError: true },
    mutationFn: () => loginWithGate({ email: email.trim(), password, mfaToken: mfaToken || undefined }, { denyAnyRole: ADMIN_ROLES }),
    onSuccess: done,
  });
  const mfaRequired = login.error instanceof ApiError && login.error.code === 'MFA_REQUIRED';

  const sendCode = useMutation({
    meta: { silentError: true },
    mutationFn: () => authApi.requestPhoneOtp(phone.trim()),
    onSuccess: () => {
      setMode('code');
      toast({ tone: 'success', title: `Code sent to ${phone.trim()}` });
    },
  });
  const verifyCode = useMutation({
    meta: { silentError: true },
    mutationFn: () => authApi.verifyPhoneOtp(phone.trim(), code),
    onSuccess: done,
  });

  const errorOf = (e: unknown) => (e instanceof ApiError ? e.message : e ? 'Something went wrong. Please try again.' : undefined);

  return (
    <Screen header={<ScreenHeader onBack={router.canGoBack() ? () => router.back() : undefined} />}>
      <View style={styles.head}>
        <Text variant="display">{mode === 'code' ? 'Enter your code' : title}</Text>
        <Text tone="muted">{mode === 'code' ? `We texted a 6-digit code to ${phone.trim()}.` : subtitle}</Text>
      </View>

      {mode === 'password' ? (
        <View style={styles.form}>
          <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
          <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" />
          <Text variant="label" tone="primary" accessibilityRole="link" onPress={() => router.push(forgotPath as never)}>Forgot password?</Text>
          {mfaRequired ? (
            <Input label="Two-factor code" hint="Enter the 6-digit code from your authenticator app." value={mfaToken} onChangeText={(t) => setMfaToken(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" />
          ) : null}
          {login.isError && !mfaRequired ? <Text variant="caption" tone="destructive" accessibilityRole="alert">{errorOf(login.error)}</Text> : null}
          <Button title={mfaRequired ? 'Verify & log in' : 'Log in'} loading={login.isPending} disabled={!email.trim() || !password} onPress={() => login.mutate()} />
          {phoneSignIn ? <Button title="Continue with phone" variant="outline" icon={<Phone size={18} color={c.foreground} />} onPress={() => setMode('phone')} /> : null}
        </View>
      ) : mode === 'phone' ? (
        <View style={styles.form}>
          <Input label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="+1 555 123 4567" />
          {sendCode.isError ? <Text variant="caption" tone="destructive">{errorOf(sendCode.error)}</Text> : null}
          <Button title="Send code" loading={sendCode.isPending} disabled={phone.trim().length < 6} onPress={() => sendCode.mutate()} />
          <Button title="Use email instead" variant="ghost" onPress={() => setMode('password')} />
        </View>
      ) : (
        <View style={styles.form}>
          <OtpInput value={code} onChange={setCode} error={verifyCode.isError ? errorOf(verifyCode.error) : undefined} />
          <Button title="Verify" loading={verifyCode.isPending} disabled={code.length !== 6} onPress={() => verifyCode.mutate()} />
          <Button title="Send a new code" variant="ghost" disabled={sendCode.isPending} onPress={() => sendCode.mutate()} />
          <Button title="Change number" variant="ghost" onPress={() => { setCode(''); setMode('phone'); }} />
        </View>
      )}

      <LegalConsent />
      {footer}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.sm, marginTop: space.sm },
  form: { gap: space.lg },
});
