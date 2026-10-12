import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { Screen, SkeletonList } from '@catodrive/ui';
import { useAuthStore } from './web/features/auth/store';

/** Signed-in screens: while the session resolves show a skeleton; signed out, go to sign-in and come back after. */
export function RequireAuth({ children, loginPath = '/login' }: { children: ReactNode; loginPath?: string }) {
  const status = useAuthStore((s) => s.status);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace({ pathname: loginPath as never, params: { returnTo: pathname } });
  }, [status, router, pathname, loginPath]);

  if (status !== 'authenticated') {
    return (
      <Screen>
        <SkeletonList rows={3} />
      </Screen>
    );
  }
  return <>{children}</>;
}
