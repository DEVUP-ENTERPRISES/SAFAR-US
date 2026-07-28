/* Firebase Cloud Messaging service worker — receives push while the app is
 * closed or backgrounded. A service worker can't read NEXT_PUBLIC_* env, so the
 * (public) web config is inlined here; none of it is secret. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAFUQrF62WRKJqF5jWgVJGDRByHcBcOlNg',
  authDomain: 'cato-3a935.firebaseapp.com',
  projectId: 'cato-3a935',
  storageBucket: 'cato-3a935.firebasestorage.app',
  messagingSenderId: '19153683249',
  appId: '1:19153683249:web:1c6cf30801f9168156a610',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'CATO';
  const body = (payload.notification && payload.notification.body) || '';
  const deepLink = (payload.data && payload.data.deepLink) || '/';
  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { deepLink },
  });
});

// Tapping the notification opens (or focuses) the deep-linked page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.deepLink) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) { w.navigate(url); return w.focus(); }
      }
      return clients.openWindow(url);
    }),
  );
});
