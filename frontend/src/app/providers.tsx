'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { tokenStore } from '@/lib/api/token-store';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
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

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <ConfirmProvider>
          <AuthBootstrap>{children}</AuthBootstrap>
        </ConfirmProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
