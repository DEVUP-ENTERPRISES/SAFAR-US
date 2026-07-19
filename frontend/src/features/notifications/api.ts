import { api } from '@/lib/api/client';

export interface Notification {
  _id: string;
  channel: string;
  templateKey: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
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
export function notificationLink(n: Notification): string | null {
  const d = n.data ?? {};
  if (typeof d.bookingId === 'string') return `/bookings?highlight=${d.bookingId}`;
  if (typeof d.tripId === 'string') return `/trips/${d.tripId}`;
  if (typeof d.claimId === 'string') return `/claims`;
  if (typeof d.payoutId === 'string' || n.templateKey.includes('payout')) return `/host/earnings`;
  return null;
}
