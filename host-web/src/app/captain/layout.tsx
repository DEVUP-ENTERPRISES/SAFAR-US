'use client';

import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/layout/auth-guard';

export default function CaptainLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard loginPath="/host/login?as=captain">
      <div className="mx-auto max-w-3xl px-4 py-6">{children}</div>
    </AuthGuard>
  );
}
