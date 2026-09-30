import { api } from '@/lib/api/client';

export interface Notification {
  _id: string;
  channel: string;
  templateKey: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  /** Where tapping the notification should go, set by the server when it is sent. */
  deepLink?: string;
  readAt?: string;
  createdAt: string;
}

export const notificationsApi = {
  list: () => api.get<Notification[]>('/notifications'),
  markRead: (ids: string[]) => api.post<{ updated: boolean }>('/notifications/read', { ids }),
};

/**
 * Turn a notification into a route. Notifications carry a free-form `data` bag;
 * we map the ones that reference a booking/trip/claim to the page that shows it,
 * so a click lands the user exactly where the event happened.
 */
/** Staff alerts, routed to the admin console page where they are acted on. */
export function adminNotificationLink(n: Notification, adminPath: (sub: string) => string): string | null {
  const d = n.data ?? {};
  const key = n.templateKey;
  if (key.startsWith('insurance.')) return adminPath('insurance');
  if (typeof d.vehicleId === 'string') return adminPath(`vehicles/${d.vehicleId}`);
  if (typeof d.claimId === 'string') return adminPath('claims');
  if (key.startsWith('kyc.')) return adminPath('kyc');
  if (key.startsWith('ops.')) return adminPath('failures');
  if (typeof d.bookingId === 'string') return adminPath('bookings');
  return null;
}

export function notificationLink(n: Notification): string | null {
  // The server's own link wins, so every notification type opens the right screen with no change here.
  // Only in-app paths are followed, never another site.
  if (n.deepLink && /^\/(?!\/)/.test(n.deepLink)) return n.deepLink;
  const d = n.data ?? {};
  if (typeof d.vehicleId === 'string') return `/host/listings/${d.vehicleId}`;
  if (typeof d.bookingId === 'string') return `/bookings?highlight=${d.bookingId}`;
  if (typeof d.tripId === 'string') return `/trips/${d.tripId}`;
  if (typeof d.claimId === 'string') return `/claims`;
  if (typeof d.payoutId === 'string' || n.templateKey.includes('payout')) return `/host/earnings`;
  return null;
}
