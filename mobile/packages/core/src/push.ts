import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './web/lib/api/client';
import { useAuthStore } from './web/features/auth/store';

const REGISTERED_KEY = 'cato.push-token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** The phone's FCM token, the same kind the server's FCM v1 sender already delivers to. iOS needs Firebase set up first. */
async function deviceToken(): Promise<string | null> {
  if (!Device.isDevice || Platform.OS !== 'android') return null;
  try {
    await Notifications.setNotificationChannelAsync('default', { name: 'Trips and messages', importance: Notifications.AndroidImportance.HIGH });
    const { data } = await Notifications.getDevicePushTokenAsync();
    return typeof data === 'string' ? data : null;
  } catch {
    return null;
  }
}

/** Asks for permission (with the system prompt) and registers this phone. Returns whether notifications are on. */
export async function enablePush(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) return false;
  const token = await deviceToken();
  if (!token) return false;
  try {
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
    if (status !== 'authenticated') return;
    void Notifications.getPermissionsAsync().then((p) => (p.granted ? enablePush() : false));
    const received = Notifications.addNotificationReceivedListener(() => void qc.invalidateQueries({ queryKey: ['notifications'] }));
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => {
      const id = r.notification.request.identifier;
      if (handled.current === id) return;
      handled.current = id;
      openLink(r.notification.request.content.data?.deepLink as string | undefined);
    });
    const last = Notifications.getLastNotificationResponse();
    if (last && handled.current !== last.notification.request.identifier) {
      handled.current = last.notification.request.identifier;
      openLink(last.notification.request.content.data?.deepLink as string | undefined);
    }
    return () => {
      received.remove();
      tapped.remove();
    };
  }, [status, qc, openLink]);
}
