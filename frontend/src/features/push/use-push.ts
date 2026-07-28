'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { pushConfigured, requestPushToken, onForegroundMessage } from './firebase';

const REGISTERED_KEY = 'cato_push_token';

/**
 * Registers this browser for push once the user is signed in.
 *
 * Deliberately quiet and idempotent: it only acts when push is configured, the
 * user is authenticated, and permission is already granted (it never nags on
 * load — a prompt is a deliberate action elsewhere). The token is registered
 * with the backend and cached so the same token isn't re-sent every mount. A
 * foreground message, which the service worker doesn't handle, surfaces as a
 * toast.
 */
export function usePushRegistration() {
  const status = useAuthStore((s) => s.status);
  const notify = useToast();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    if (status !== 'authenticated' || !pushConfigured()) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    done.current = true;

    let unsub: (() => void) | undefined;

    (async () => {
      const token = await requestPushToken();
      if (!token) return;
      if (localStorage.getItem(REGISTERED_KEY) !== token) {
        try {
          await api.post('/users/me/devices', { token });
          localStorage.setItem(REGISTERED_KEY, token);
        } catch {
          /* a failed registration retries on the next load */
        }
      }
      unsub = await onForegroundMessage((title, body) => {
        notify({ tone: 'info', title, description: body });
      });
    })();

    return () => unsub?.();
  }, [status, notify]);
}

/**
 * Explicit opt-in — call from a button. Prompts for permission, registers the
 * token, and reports the outcome. This is where the permission ask belongs, not
 * on page load.
 */
export async function enablePush(
  notify: (t: { tone: 'success' | 'error'; title: string; description?: string }) => void,
): Promise<boolean> {
  if (!pushConfigured()) {
    notify({ tone: 'error', title: 'Push isn’t available', description: 'Not configured for this site.' });
    return false;
  }
  const token = await requestPushToken();
  if (!token) {
    notify({ tone: 'error', title: 'Notifications not enabled', description: 'Permission was denied or unavailable.' });
    return false;
  }
  try {
    await api.post('/users/me/devices', { token });
    localStorage.setItem(REGISTERED_KEY, token);
    notify({ tone: 'success', title: 'Notifications on', description: 'We’ll alert you about your trips.' });
    return true;
  } catch {
    notify({ tone: 'error', title: 'Couldn’t enable notifications', description: 'Please try again.' });
    return false;
  }
}
