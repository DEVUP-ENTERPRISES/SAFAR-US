'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/store';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Client-side route guard. Redirects unauthenticated users to the given
 * login page (defaults to the customer login) — so each portal (customer,
 * host, admin) can send visitors to its own entry point.
 */
export function AuthGuard({
  children,
  loginPath = '/login',
}: {
  children: ReactNode;
  loginPath?: string;
}) {
  const status = useAuthStore((s) => s.status);
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace(loginPath);
  }, [status, router, loginPath]);

  if (status !== 'authenticated') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  return <>{children}</>;
}
