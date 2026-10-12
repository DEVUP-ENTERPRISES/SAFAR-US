import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { signOutEverywhere } from './web/features/auth/session';
import { unregisterPush } from './push';

/** Signs out on the server and this phone: push token removed first (it needs the session), then everything else. */
export function useSignOut(afterPath = '/') {
  const qc = useQueryClient();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const signOut = useCallback(async () => {
    setPending(true);
    try {
      await unregisterPush();
      await signOutEverywhere(qc);
    } finally {
      setPending(false);
      router.replace(afterPath as never);
    }
  }, [qc, router, afterPath]);
  return { signOut, pending };
}
