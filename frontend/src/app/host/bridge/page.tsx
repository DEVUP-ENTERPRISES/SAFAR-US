'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { tokenStore } from '@/lib/api/token-store';
import { useAuthStore } from '@/features/auth/store';

/**
 * Receives the House Fleet session minted in the admin console and drops the
 * operator into the normal Host dashboard. Admin and this app are separate
 * origins with separate localStorage, so the tokens have to cross once in the
 * URL fragment — stripped immediately via replaceState(), never left in history.
 */
function BridgeInner() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [failed, setFailed] = useState(false);
  const consumed = useRef(false);

  useEffect(() => {
    // Strict Mode runs effects twice; the fragment is gone after the first read.
    if (consumed.current) return;
    consumed.current = true;
    // The tokens arrive in the URL fragment and are wiped from the address bar and history before anything else runs.
    const frag = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const at = frag.get('at');
    const rt = frag.get('rt');
    window.history.replaceState(null, '', window.location.pathname);
    if (!at || !rt) {
      setFailed(true);
      return;
    }
    tokenStore.set(at, rt);
    // Let the app resolve who this is from the session it now holds.
    setUser(null);
    router.replace('/host');
  }, [router, setUser]);

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
