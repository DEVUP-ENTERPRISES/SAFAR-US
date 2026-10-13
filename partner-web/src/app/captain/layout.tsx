'use client';

import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/layout/auth-guard';

export default function CaptainLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard loginPath="/host/login">
      <div className="mx-auto max-w-2xl px-4 py-6">{children}</div>
    </AuthGuard>
  );
}
