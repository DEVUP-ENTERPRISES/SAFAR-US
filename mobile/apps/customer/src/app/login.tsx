import { useLocalSearchParams, useRouter } from 'expo-router';
import { SignInScreen, safeReturn } from '@catodrive/core';
import { Text } from '@catodrive/ui';

export default function LoginScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const target = safeReturn(returnTo, '/');
  const bookingReturn = target.startsWith('/vehicles/');
  return (
    <SignInScreen
      title={bookingReturn ? 'One step left' : 'Welcome back'}
      subtitle={bookingReturn ? 'Sign in to confirm your trip. Nothing you picked has been lost.' : 'Sign in to pick up your trips, messages and saved cars.'}
      home="/"
      forgotPath="/forgot-password"
      footer={
        <Text tone="muted" center>
          New to CatoDrive?{' '}
          <Text variant="label" tone="primary" accessibilityRole="link" onPress={() => router.replace({ pathname: '/register', params: { returnTo: target } })}>
            Create an account
          </Text>
        </Text>
      }
    />
  );
}
