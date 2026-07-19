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

function AdminShell({ children }: { children: ReactNode }) {
  // Access is proven by the server: if /admin/metrics 403s, block the panel.
  const gate = useQuery({ queryKey: ['admin-gate'], queryFn: () => adminApi.metrics(), retry: false });

  if (gate.isLoading) return <Skeleton className="h-96 w-full" />;
  if (gate.isError) {
    const denied = gate.error instanceof ApiError && (gate.error.status === 403 || gate.error.status === 401);
    return (
      <ErrorState
        message={denied ? 'You do not have access to the admin panel.' : 'Could not load the admin panel.'}
      />
    );
  }

  return (
    <div className="flex gap-8">
      <AdminSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The admin login page is public — everything else requires an admin session.
  if (pathname === '/admin/login') return <>{children}</>;
  return (
    <AuthGuard loginPath="/admin/login">
      <AdminShell>{children}</AdminShell>
    </AuthGuard>
  );
}
