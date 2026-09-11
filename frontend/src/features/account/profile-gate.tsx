'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { accountApi } from './api';

/**
 * The account-setup gate. After login, a guest cannot use the app until they
 * have set up the identity a rental requires (legal name, DOB, phone, address,
 * photo, emergency contact). This mounts once at the app root: when the signed-in
 * user's profile is incomplete, it routes them to /account/setup and keeps them
 * there until it's done.
 *
 * Paths that must stay reachable while incomplete are allow-listed — the setup
 * page itself, auth screens, legal docs, and sign-out — so the redirect never
 * loops or traps someone trying to read the Terms or log out.
 */
const OPEN_PREFIXES = ['/account/setup', '/login', '/register', '/legal', '/logout', '/verify-email'];

export function ProfileGate() {
  const status = useAuthStore((s) => s.status);
  const pathname = usePathname();
  const router = useRouter();
  const onOpenPath = OPEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));

  const { data } = useQuery({
    queryKey: ['profile-status'],
    queryFn: () => accountApi.profileStatus(),
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });

  useEffect(() => {
    if (status === 'authenticated' && data && !data.complete && !onOpenPath) {
      router.replace('/account/setup');
    }
  }, [status, data, onOpenPath, router]);

  return null;
}
