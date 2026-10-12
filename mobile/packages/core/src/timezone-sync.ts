import { useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from './web/lib/api/client';
import { useAuthStore } from './web/features/auth/store';

/** Saves the phone's time zone once per user and zone, so quiet hours and reminders follow the person's own clock. */
export function useTimezoneSync() {
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    if (status !== 'authenticated' || !userId) return;
    let tz: string;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!tz) return;
    const key = `cato.tz.${userId}`;
    void (async () => {
      if ((await SecureStore.getItemAsync(key).catch(() => null)) === tz) return;
      try {
        await api.patch('/users/me', { timezone: tz });
        await SecureStore.setItemAsync(key, tz);
      } catch {
        /* retried on the next launch */
      }
    })();
  }, [status, userId]);
}
