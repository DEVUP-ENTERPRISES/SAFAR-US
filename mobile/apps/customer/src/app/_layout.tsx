import { Stack } from 'expo-router';
import { AppShell, RouteErrorBoundary } from '@catodrive/core';
import { resolveLink } from '@/routes';

export { RouteErrorBoundary as ErrorBoundary };

export default function RootLayout() {
  return (
    <AppShell resolveLink={resolveLink}>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="register" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </AppShell>
  );
}
