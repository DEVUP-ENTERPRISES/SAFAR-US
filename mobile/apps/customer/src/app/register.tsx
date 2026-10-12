import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Gift } from 'lucide-react-native';
import { LegalConsent, safeReturn } from '@catodrive/core';
import { authApi } from '@catodrive/core/web/features/auth/api';
import { useOnAuthSuccess } from '@catodrive/core/web/features/auth/session';
import { usePrograms } from '@catodrive/core/web/features/platform/config';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { Button, Card, Input, Screen, ScreenHeader, Text, useTheme, space } from '@catodrive/ui';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string; ref?: string }>();
  const returnTo = safeReturn(params.returnTo, '/');
  const bookingReturn = returnTo.startsWith('/vehicles/');
  const programs = usePrograms();
  const onAuthSuccess = useOnAuthSuccess();

  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState(params.ref ?? '');
  const [touched, setTouched] = useState(false);

  const errors = {
    firstName: !firstName.trim() ? 'Required' : undefined,
    email: !EMAIL.test(email.trim()) ? 'Enter a valid email' : undefined,
    password: password.length < 8 ? 'At least 8 characters' : undefined,
  };
  const valid = !errors.firstName && !errors.email && !errors.password;

  const register = useMutation({
    meta: { silentError: true },
    mutationFn: () =>
      authApi.register({
        firstName: firstName.trim(),
        email: email.trim(),
        password,
        ...(programs.referral && referralCode.trim() ? { referralCode: referralCode.trim() } : {}),
      }),
    onSuccess: (result) => {
      onAuthSuccess(result);
      router.replace(returnTo as never);
    },
  });

  const submit = () => {
    setTouched(true);
    if (valid) register.mutate();
  };

  return (
    <Screen header={<ScreenHeader onBack={() => router.back()} />}>
      <View style={styles.head}>
        <Text variant="display">{bookingReturn ? 'Almost yours' : 'Create your account'}</Text>
        <Text tone="muted">{bookingReturn ? 'Create an account to confirm this trip. Your dates and options are waiting.' : 'One account for booking, hosting and everything in between.'}</Text>
      </View>

      {programs.referral && referralCode.trim() ? (
        <Card>
          <View style={styles.row}>
            <Gift size={20} color={c.primary} />
            <Text variant="label">Referral {referralCode.trim()} applied - you&apos;ll get welcome credit!</Text>
          </View>
        </Card>
      ) : null}

      <View style={styles.form}>
        <Input label="First name" value={firstName} onChangeText={setFirstName} autoComplete="given-name" textContentType="givenName" error={touched ? errors.firstName : undefined} />
        <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={touched ? errors.email : undefined} />
        <Input label="Password" hint="Use at least 8 characters." value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" error={touched ? errors.password : undefined} />
        {programs.referral ? <Input label="Referral code (optional)" placeholder="Have a code?" value={referralCode} onChangeText={setReferralCode} autoCapitalize="characters" /> : null}
        {register.isError ? <Text variant="caption" tone="destructive" accessibilityRole="alert">{register.error instanceof ApiError ? register.error.message : 'Registration failed'}</Text> : null}
        <Button title="Create account" loading={register.isPending} onPress={submit} />
      </View>

      <LegalConsent action="creating an account" />
      <Text tone="muted" center>
        Already have an account?{' '}
        <Text variant="label" tone="primary" accessibilityRole="link" onPress={() => router.replace({ pathname: '/login', params: { returnTo } })}>Log in</Text>
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.sm, marginTop: space.sm },
  form: { gap: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
