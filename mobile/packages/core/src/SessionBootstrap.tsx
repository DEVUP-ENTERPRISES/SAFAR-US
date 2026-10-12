import { useEffect, type ReactNode } from 'react';
import { tokenStore } from './web/lib/api/token-store';
import { isTransientError } from './web/lib/api/types';
import { useSessionBootstrap } from './web/features/auth/session';
import { useAuthStore } from './web/features/auth/store';
import { useLiveUpdates } from './web/lib/realtime/use-live-updates';
import { usePushRegistration } from './push';
import { useTimezoneSync } from './timezone-sync';

/** The website's AuthBootstrap for the apps: restore the session, then push, time zone and live updates. */
export function SessionBootstrap({ children, openLink }: { children: ReactNode; openLink: (deepLink: string | undefined) => void }) {
  usePushRegistration(openLink);
  useTimezoneSync();
  useLiveUpdates();
  const setStatus = useAuthStore((s) => s.setStatus);
  const { isError, isSuccess, error } = useSessionBootstrap();

  useEffect(() => {
    if (!tokenStore.getAccess()) setStatus('unauthenticated');
  }, [setStatus]);

  useEffect(() => {
    if (isError && !isTransientError(error)) {
      tokenStore.clear();
      setStatus('unauthenticated');
    }
    if (isSuccess) setStatus('authenticated');
  }, [isError, isSuccess, error, setStatus]);

  return <>{children}</>;
}
