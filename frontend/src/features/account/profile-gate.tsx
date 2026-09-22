'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { ADMIN_ROLES } from '@/features/auth/hooks';
import { accountApi } from './api';

/**
 * The account-setup gate. After login, a GUEST cannot use the app until they
 * have set up the identity a rental requires (legal name, DOB, phone, address,
 * photo, emergency contact). This mounts once at the app root: when the signed-in
 * guest's profile is incomplete, it routes them to /account/setup and keeps them
 * there until it's done.
 *
 * It applies to guests/hosts only — NOT staff/admins, and not the seeded House
 * Fleet account. An admin signing into the console is not a renter, so forcing
 * them through guest onboarding (which is what sent an admin login to
 * /account/setup) is wrong. House Fleet is the same story one level down: it's
 * an internal account that lists CatoDrive's own cars and will never itself
 * rent one, so it gets the same exemption — and only it, not ordinary
 * self-serve hosts, who still need this before they can book as a guest too.
 * Both are skipped entirely and never even asked for a profile status.
 *
 * Paths that must stay reachable while incomplete are allow-listed — the setup
 * page itself, auth screens, legal docs, and sign-out — so the redirect never
 * loops or traps someone trying to read the Terms or log out.
 */
const OPEN_PREFIXES = ['/account/setup', '/login', '/register', '/forgot-password', '/legal', '/logout', '/verify-email', '/verify'];

export function ProfileGate() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();
  const router = useRouter();
  const onOpenPath = OPEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
  // Staff/admins, and House Fleet specifically, are not renters — the
  // guest-onboarding gate never applies to them.
  const isStaff = !!user?.roles?.some((r) => ADMIN_ROLES.includes(r) || r === 'house_fleet');

  const { data } = useQuery({
    queryKey: ['profile-status'],
    queryFn: () => accountApi.profileStatus(),
    enabled: status === 'authenticated' && !isStaff,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (status === 'authenticated' && !isStaff && data && !data.complete && !onOpenPath) {
      router.replace('/account/setup');
    }
  }, [status, isStaff, data, onOpenPath, router]);

  return null;
}
