'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { tokenStore } from '@/lib/api/token-store';
import { useAuthStore } from '@/features/auth/store';

/**
 * Receives the House Fleet session minted in the admin console and drops the
 * operator into the normal Host dashboard. Admin and this app are separate
 * origins with separate localStorage, so the tokens have to cross once in the
 * URL — stripped immediately via replace(), never left in history.
 */
function BridgeInner() {
  const qp = useSearchParams();
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const at = qp.get('at');
    const rt = qp.get('rt');
    if (!at || !rt) {
      setFailed(true);
      return;
    }
    tokenStore.set(at, rt);
    // Let the app resolve who this is from the session it now holds.
    setUser(null);
    router.replace('/host');
  }, [qp, router, setUser]);

  if (failed) {
    return (
      <ErrorState message="That House Fleet link is missing its session. Launch it again from the admin console." />
    );
  }
  return <Skeleton className="h-64 w-full rounded-2xl" />;
}

export default function HostBridgePage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <BridgeInner />
    </Suspense>
  );
}
