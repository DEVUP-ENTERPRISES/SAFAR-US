'use client';



import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { ApiError } from '@/lib/api/types';
import { adminApi } from '@/features/admin/api';
import { AdminSidebar } from '@/features/admin/components/admin-sidebar';
import { AdminTopbar } from '@/features/admin/components/admin-topbar';
import { adminPath } from '@/lib/admin-path';

function AdminShell({ children }: { children: ReactNode }) {
  // Access is proven by the server: if /admin/metrics 403s, block the panel.
  // Only 401/403 is an answer about access — anything else is a transport
  // failure and must not masquerade as "you're not allowed in".
  const isDenied = (e: unknown) =>
    e instanceof ApiError && (e.status === 401 || e.status === 403);

  const gate = useQuery({
    queryKey: ['admin-gate'],
    queryFn: () => adminApi.metrics(),
    retry: (count, error) => !isDenied(error) && count < 2,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  if (gate.isPending || (gate.isError && gate.isFetching)) return <Skeleton className="h-96 w-full" />;

  if (gate.isError) {
    const denied = isDenied(gate.error);
    return (
      <ErrorState
        message={
          denied
            ? 'You do not have access to the admin panel.'
            : "Couldn't load the admin panel. Check your connection and try again."
        }
        // A denial isn't retryable; a transport failure is.
        retry={denied ? undefined : () => gate.refetch()}
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <AdminSidebar />
      {/* Full width — operator tables need the room the consumer container denies. */}
      <main className="min-w-0 flex-1 px-4 py-6 pb-24 sm:px-6 md:pb-6">{children}</main>
    </div>
  );
}

export function AdminChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The admin login page is public — everything else requires an admin session.
  if (pathname === adminPath('login')) {
    return <div className="flex min-h-screen items-center justify-center px-4">{children}</div>;
  }
  return (
    <AuthGuard loginPath={adminPath('login')}>
      <div className="flex min-h-screen flex-col bg-subtle/40">
        <AdminTopbar />
        <AdminShell>{children}</AdminShell>
      </div>
    </AuthGuard>
  );
}
