'use client';

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';

/**
 * Firebase web config. All of these are public by design — the web config
 * identifies the project to Google's SDK, it is not a secret, and it ships in
 * the browser bundle. The service-account key that CAN send push lives only on
 * the server.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export function pushConfigured(): boolean {
  return !!firebaseConfig.apiKey && !!firebaseConfig.messagingSenderId && !!VAPID_KEY;
}

let app: FirebaseApp | null = null;
function getFirebaseApp(): FirebaseApp {
  if (!app) app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

let messaging: Messaging | null = null;
async function getMessagingIfSupported(): Promise<Messaging | null> {
  if (!pushConfigured()) return null;
  // Safari before 16.4 and most in-app browsers don't support web push; bail
  // quietly rather than throwing on an unsupported device.
  if (!(await isSupported().catch(() => false))) return null;
  if (!messaging) messaging = getMessaging(getFirebaseApp());
  return messaging;
}

/**
 * Ask for permission (if not already decided), register the service worker,
 * and return the FCM device token — or null if the user declined or the device
 * can't do web push. Never throws to the caller.
 */
export async function requestPushToken(): Promise<string | null> {
  try {
    const m = await getMessagingIfSupported();
    if (!m) return null;

    if (Notification.permission === 'denied') return null;
    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return null;
    }

    // The SW that receives background messages must be registered explicitly so
    // getToken uses ours rather than injecting Firebase's default at the root.
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    return await getToken(m, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  } catch {
    return null;
  }
}

/** Foreground messages — while the tab is open, the SW doesn't fire. */
export async function onForegroundMessage(cb: (title: string, body: string, data?: Record<string, string>) => void) {
  const m = await getMessagingIfSupported();
  if (!m) return () => undefined;
  return onMessage(m, (payload) => {
    cb(
      payload.notification?.title ?? 'CATO',
      payload.notification?.body ?? '',
      payload.data as Record<string, string> | undefined,
    );
  });
}
