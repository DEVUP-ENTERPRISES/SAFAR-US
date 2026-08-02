export type Channel = 'push' | 'email' | 'sms' | 'inapp';

/** User-facing grouping for per-category preferences and the admin routing matrix. */
export type NotificationCategory = 'trips' | 'messages' | 'payments' | 'promotions' | 'reviews' | 'account';
export const NOTIFICATION_CATEGORIES: NotificationCategory[] = ['trips', 'messages', 'payments', 'promotions', 'reviews', 'account'];

/** Map a templateKey to its category — drives user toggles and the routing matrix. */
export function categoryFor(templateKey: string): NotificationCategory {
  const k = templateKey.toLowerCase();
  if (k.includes('chat') || k.includes('message')) return 'messages';
  if (k.includes('payout') || k.includes('payment') || k.includes('refund') || k.includes('wallet') || k.includes('earning') || k.includes('incidental') || k.includes('receipt') || k.includes('tax')) return 'payments';
  if (k.includes('promo') || k.includes('referral') || k.includes('reengage') || k.includes('offer') || k.includes('reward')) return 'promotions';
  if (k.includes('review')) return 'reviews';
  if (k.includes('security') || k.includes('login') || k.includes('account') || k.includes('otp') || k.includes('verif')) return 'account';
  return 'trips'; // booking.* / trip.* / vehicle.* — the transactional default
}

/** Per-category channel allow-list (the admin-editable routing matrix). inapp is always on. */
export type CategoryChannelMatrix = Record<NotificationCategory, { push: boolean; email: boolean; sms: boolean }>;

/** A user's notification preferences. Missing fields default to allowed. */
export interface NotificationPrefs {
  push?: boolean;
  email?: boolean;
  sms?: boolean;
  /** SMS only for critical messages even when a category allows it. */
  smsCriticalOnly?: boolean;
  /** Respect 22:00–08:00 quiet hours for non-urgent messages. */
  quietHours?: boolean;
  /** Per-category master switch. */
  categories?: Partial<Record<NotificationCategory, boolean>>;
}

/**
 * Resolve the channels a message actually goes out on:
 *   urgency (priority)  ∩  admin routing matrix (category)  ∩  user preferences.
 * A critical message bypasses the user's opt-outs (a failed deposit or an
 * emergency must reach them) but still honours the admin matrix. inapp is always
 * included — it is the durable feed.
 */
export function resolveChannels(
  priority: Priority,
  category: NotificationCategory,
  matrix: CategoryChannelMatrix,
  prefs: NotificationPrefs = {},
): Channel[] {
  const byPriority = new Set(CHANNELS_BY_PRIORITY[priority]);
  const allow = matrix[category] ?? { push: true, email: true, sms: true };
  const critical = priority === 'critical';
  const out: Channel[] = ['inapp'];

  for (const ch of ['push', 'email', 'sms'] as const) {
    if (!byPriority.has(ch)) continue; // urgency doesn't call for it
    if (!allow[ch]) continue; // admin routes this category away from it
    if (!critical) {
      if (prefs[ch] === false) continue; // user turned the channel off
      if (prefs.categories && prefs.categories[category] === false) continue; // user muted the category
      if (ch === 'sms' && prefs.smsCriticalOnly) continue; // user: SMS for critical only
    }
    out.push(ch);
  }
  return out;
}

/** How urgent a message is — decides channels, retries and quiet hours. */
export type Priority = 'critical' | 'high' | 'normal' | 'low';

export interface DeliveryTarget {
  userId: string;
  email?: string;
  phone?: string;
  pushTokens?: string[];
  locale?: string;
  timezone?: string;
}

export interface DeliveryRequest {
  target: DeliveryTarget;
  templateKey: string;
  title: string;
  body: string;
  /** Where tapping the notification should land. */
  deepLink?: string;
  data?: Record<string, unknown>;
}

export interface DeliveryResult {
  ok: boolean;
  providerId?: string;
  error?: string;
  /** False for permanent failures — a bad number is not worth retrying. */
  retryable?: boolean;
}

export interface ChannelProvider {
  readonly channel: Exclude<Channel, 'inapp'>;
  readonly enabled: boolean;
  send(req: DeliveryRequest): Promise<DeliveryResult>;
}

/**
 * Which channels carry a message, by urgency.
 *
 * A booking request that only ever reached the in-app feed is a booking
 * request the host never saw — and with a 24-hour expiry job running behind
 * it, that silently becomes a lost trip and an unhappy guest. Anything a
 * counterparty is waiting on has to leave the app.
 */
export const CHANNELS_BY_PRIORITY: Record<Priority, Channel[]> = {
  critical: ['inapp', 'push', 'sms', 'email'],
  high: ['inapp', 'push', 'email'],
  normal: ['inapp', 'push'],
  low: ['inapp'],
};

/** Backoff per attempt, in milliseconds. Length = max attempts. */
export const RETRY_SCHEDULE: Record<Priority, number[]> = {
  critical: [5 * 60_000, 15 * 60_000, 60 * 60_000],
  high: [15 * 60_000, 60 * 60_000],
  normal: [15 * 60_000],
  low: [],
};

/**
 * Quiet hours suppress only what can wait. A trip starting in an hour, a failed
 * deposit, or a damage claim wakes you up; a review reminder does not.
 */
export function respectsQuietHours(priority: Priority): boolean {
  return priority === 'normal' || priority === 'low';
}

export const QUIET_HOURS = { startHour: 22, endHour: 8 };

/** Is it currently quiet where this person is? */
export function isQuietTime(timezone?: string, now = new Date()): boolean {
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone || 'UTC',
      }).format(now),
    );
  } catch {
    // An unknown timezone must not swallow a notification.
    return false;
  }
  return hour >= QUIET_HOURS.startHour || hour < QUIET_HOURS.endHour;
}
