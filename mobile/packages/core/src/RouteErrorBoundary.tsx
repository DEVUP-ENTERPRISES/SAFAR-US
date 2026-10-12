import { ErrorState, Screen } from '@catodrive/ui';

/** expo-router's per-route error boundary: the screen offers a retry instead of crashing the app. */
export function RouteErrorBoundary({ retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <Screen scroll={false} contentStyle={{ justifyContent: 'center' }}>
      <ErrorState message="This screen hit a problem. Try again, and if it keeps happening, restart the app." onRetry={() => void retry()} />
    </Screen>
  );
}
