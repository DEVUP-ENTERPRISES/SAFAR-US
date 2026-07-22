export type Channel = 'push' | 'email' | 'sms' | 'inapp';

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
