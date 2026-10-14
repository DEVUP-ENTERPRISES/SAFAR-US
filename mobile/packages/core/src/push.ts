import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './web/lib/api/client';
import { useAuthStore } from './web/features/auth/store';

type NotificationsModule = typeof import('expo-notifications');

const REGISTERED_KEY = 'cato.push-token';

let loaded: NotificationsModule | null | undefined;

/**
 * The notifications module, loaded on first use rather than at import: Expo Go
 * on Android throws as soon as it loads (SDK 53+), which would take every screen
 * down with it. Null wherever push can't run; the app carries on without it.
 */
export function notificationsModule(): NotificationsModule | null {
  if (loaded !== undefined) return loaded;
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return (loaded = null);
  try {
    const mod = require('expo-notifications') as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    loaded = mod;
  } catch {
    loaded = null;
  }
  return loaded;
}

/** The phone's FCM token, the same kind the server's FCM v1 sender already delivers to. iOS needs Firebase set up first. */
async function deviceToken(N: NotificationsModule): Promise<string | null> {
  if (!Device.isDevice || Platform.OS !== 'android') return null;
  try {
    await N.setNotificationChannelAsync('default', { name: 'Trips and messages', importance: N.AndroidImportance.HIGH });
    const { data } = await N.getDevicePushTokenAsync();
    return typeof data === 'string' ? data : null;
  } catch {
    return null;
  }
}

/** Asks for permission (with the system prompt) and registers this phone. Returns whether notifications are on. */
export async function enablePush(): Promise<boolean> {
  const N = notificationsModule();
  if (!N) return false;
  try {
    const current = await N.getPermissionsAsync();
    const granted = current.granted || (current.canAskAgain && (await N.requestPermissionsAsync()).granted);
    if (!granted) return false;
    const token = await deviceToken(N);
    if (!token) return false;
    if ((await SecureStore.getItemAsync(REGISTERED_KEY)) !== token) {
      await api.post('/users/me/devices', { token });
      await SecureStore.setItemAsync(REGISTERED_KEY, token);
    }
    return true;
  } catch {
    return false;
  }
}

/** Removes this phone's token on sign-out so the next person doesn't get the last one's alerts. */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(REGISTERED_KEY);
    if (token) await api.raw('/users/me/devices', { method: 'DELETE', body: { token } });
  } catch {
    /* best effort */
  } finally {
    await SecureStore.deleteItemAsync(REGISTERED_KEY).catch(() => undefined);
  }
}

/**
 * Like the website: registers once signed in if permission was already given,
 * refreshes notifications when one arrives, and opens the right screen on tap.
 */
export function usePushRegistration(openLink: (deepLink: string | undefined) => void) {
  const status = useAuthStore((s) => s.status);
  const qc = useQueryClient();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const N = notificationsModule();
    if (status !== 'authenticated' || !N) return;
    void N.getPermissionsAsync()
      .then((p) => (p.granted ? enablePush() : false))
      .catch(() => false);
    try {
      const received = N.addNotificationReceivedListener(() => void qc.invalidateQueries({ queryKey: ['notifications'] }));
      const tapped = N.addNotificationResponseReceivedListener((r) => {
        const id = r.notification.request.identifier;
        if (handled.current === id) return;
        handled.current = id;
        openLink(r.notification.request.content.data?.deepLink as string | undefined);
      });
      const last = N.getLastNotificationResponse();
      if (last && handled.current !== last.notification.request.identifier) {
        handled.current = last.notification.request.identifier;
        openLink(last.notification.request.content.data?.deepLink as string | undefined);
      }
      return () => {
        received.remove();
        tapped.remove();
      };
    } catch {
      return undefined;
    }
  }, [status, qc, openLink]);
}
