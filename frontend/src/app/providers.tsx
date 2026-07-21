'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { tokenStore } from '@/lib/api/token-store';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
import { useSessionBootstrap } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';

function AuthBootstrap({ children }: { children: ReactNode }) {
  const setStatus = useAuthStore((s) => s.setStatus);
  const { isError, isSuccess } = useSessionBootstrap();

  useEffect(() => {
    if (!tokenStore.getAccess()) setStatus('unauthenticated');
  }, [setStatus]);

  useEffect(() => {
    if (isError) {
      tokenStore.clear();
      setStatus('unauthenticated');
    }
    if (isSuccess) setStatus('authenticated');
  }, [isError, isSuccess, setStatus]);

  return <>{children}</>;
}

/**
 * Creates the QueryClient with a global mutation-error handler.
 *
 * Most action pages never rendered `mutation.isError`, so a failed
 * "Suspend user" / "Approve KYC" / "Save policy" did nothing visible — the
 * operator couldn't tell a failure from a no-op. Catching it centrally means
 * every mutation, including future ones, reports its own failure.
 */
function createQueryClient(notify: (t: { tone: 'error'; title: string; description?: string }) => void) {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
    },
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        // A page that surfaces its own error inline can opt out.
        if (mutation.meta?.silentError) return;
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Something went wrong.';
        notify({ tone: 'error', title: "That didn't go through", description: message });
      },
    }),
  });
}

function QueryProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [queryClient] = useState(() => createQueryClient(toast));
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <QueryProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ConfirmProvider>
            <AuthBootstrap>{children}</AuthBootstrap>
          </ConfirmProvider>
        </ThemeProvider>
      </QueryProvider>
    </ToastProvider>
  );
}
