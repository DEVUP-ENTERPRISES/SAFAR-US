'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { safeNextPath } from '@/lib/sites';
import { useOnAuthSuccess } from '@/features/auth/session';
import type { AuthResult } from '@/features/auth/types';

/**
 * Lands someone arriving from CatoDrive's other website: redeems the one-time
 * code from the URL fragment for a session here, then opens the page they were
 * heading to. The fragment is wiped from the address bar before anything else.
 */
export function HandoffPage({ loginPath = '/login' }: { loginPath?: string }) {
  const router = useRouter();
  const onAuth = useOnAuthSuccess();
  const [failed, setFailed] = useState(false);
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    const frag = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const code = frag.get('code');
    const next = safeNextPath(frag.get('next'));
    window.history.replaceState(null, '', window.location.pathname);
    if (!code) {
      router.replace(next);
      return;
    }
    api
      .post<AuthResult>('/auth/handoff/redeem', { code })
      .then((result) => {
        onAuth(result);
        router.replace(next);
      })
      .catch(() => setFailed(true));
  }, [router, onAuth]);

  if (failed) {
    return (
      <div className="mx-auto max-w-md py-16">
        <ErrorState message="That link has expired. Please sign in." />
        <p className="mt-4 text-center">
          <Link href={loginPath} className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    );
  }
  return <Skeleton className="mx-auto mt-16 h-32 max-w-md rounded-2xl" />;
}
