import { AppState, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, MutationCache, onlineManager, QueryClient } from '@tanstack/react-query';
import { ApiError } from './web/lib/api/types';

let wired = false;

/** React Query learns when the phone goes offline or the app comes back to the front. */
function wireNativeManagers() {
  if (wired) return;
  wired = true;
  onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)));
  AppState.addEventListener('change', (state) => {
    if (Platform.OS !== 'web') focusManager.setFocused(state === 'active');
  });
}

/** A refusal (4xx) is an answer, not a blip: only network failures and server errors are retried. */
const shouldRetry = (count: number, err: unknown) => count < 2 && !(err instanceof ApiError && err.status >= 400 && err.status < 500);

/** Same defaults as the website's client, plus app-focus refetch; failed mutations surface through `onMutationError`. */
export function createQueryClient(onMutationError: (message: string) => void): QueryClient {
  wireNativeManagers();
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        if (mutation.meta?.silentError) return;
        let message = error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.';
        if (error instanceof ApiError && error.details?.length) {
          message = error.details.map((d) => (d.field ? `${d.field}: ${d.issue}` : d.issue)).join(' · ');
        }
        onMutationError(message);
      },
    }),
  });
}
