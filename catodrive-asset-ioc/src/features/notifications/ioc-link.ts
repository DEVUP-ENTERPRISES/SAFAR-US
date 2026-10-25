import type { Notification } from '@/features/notifications/api';

/** Where a notification opens inside the operations panel; never another site, so a reply stays here. */
export function iocNotificationLink(n: Notification): string | null {
  const d = n.data ?? {};
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const bookingId = str(d.bookingId);
  const vehicleId = str(d.vehicleId);
  const guestId = str(d.guestId);

  if (n.templateKey === 'chat.message' && bookingId) return `/ops/trips/${bookingId}?tab=messages`;
  if (n.templateKey === 'inquiry.message' && vehicleId && guestId) return `/ops/inquiries/${vehicleId}/${guestId}`;

  const link = n.deepLink && /^\/(?!\/)/.test(n.deepLink) ? n.deepLink : null;
  if (link?.startsWith('/ops/') || link === '/ops' || link?.startsWith('/captain')) return link;
  const host = link?.match(/^\/host\/(trips|listings)\/([^/?#]+)(.*)$/);
  if (host) return `/ops/${host[1]}/${host[2]}${host[3]}`;
  if (link?.startsWith('/host/earnings') || n.templateKey.includes('payout')) return '/ops/earnings';
  if (link?.startsWith('/asset-partners')) return '/ops/partners';

  if (bookingId) return `/ops/trips/${bookingId}`;
  if (vehicleId) return `/ops/listings/${vehicleId}`;
  return '/ops/inbox';
}
