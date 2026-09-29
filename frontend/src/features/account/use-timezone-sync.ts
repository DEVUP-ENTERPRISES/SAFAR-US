'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { api } from '@/lib/api/client';

/** Saves the browser's time zone once per user and zone, so quiet hours and reminders follow the guest's own clock. */
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
    const key = `cato_tz_${userId}`;
    try {
      if (localStorage.getItem(key) === tz) return;
    } catch {
      /* storage blocked: send anyway, it is idempotent */
    }
    api
      .patch('/users/me', { timezone: tz })
      .then(() => {
        try {
          localStorage.setItem(key, tz);
        } catch {
          /* ignore */
        }
      })
      .catch(() => undefined);
  }, [status, userId]);
}
