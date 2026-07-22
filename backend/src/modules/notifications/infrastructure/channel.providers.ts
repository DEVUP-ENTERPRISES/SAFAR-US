import { config } from '../../../config';
import { logger } from '../../../infrastructure/logging/logger';
import type { ChannelProvider, DeliveryRequest, DeliveryResult } from '../domain/notification-channel';

/**
 * Channel adapters.
 *
 * Same composition pattern as storage, maps and payments: a real provider when
 * credentials are configured, a loud local stand-in otherwise. Business logic
 * only ever sees ChannelProvider, so switching a channel on is a config change
 * and nothing else.
 *
 * The stand-ins log at WARN, not INFO. This used to be the *only* behaviour —
 * push, SMS and email were written to a log line and nothing was ever sent —
 * so a quiet, comfortable-looking log is exactly the failure mode to avoid.
 */

class LoggingProvider implements ChannelProvider {
  constructor(public readonly channel: 'push' | 'email' | 'sms') {}
  readonly enabled = false;

  async send(req: DeliveryRequest): Promise<DeliveryResult> {
    logger.warn(
      {
        channel: this.channel,
        to: this.channel === 'email' ? req.target.email : req.target.phone,
        template: req.templateKey,
      },
      `NOT DELIVERED — no ${this.channel} provider configured`,
    );
    // Not an error: local development has no Twilio account. But never report
    // success either, or the delivery log will claim things that did not happen.
    return { ok: false, error: `${this.channel}_provider_not_configured`, retryable: false };
  }
}

class SmtpEmailProvider implements ChannelProvider {
  readonly channel = 'email' as const;
  readonly enabled = true;

  async send(req: DeliveryRequest): Promise<DeliveryResult> {
    if (!req.target.email) {
      return { ok: false, error: 'no_email_on_account', retryable: false };
    }
    try {
      const res = await fetch(`${config.notifications.emailApiUrl}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.notifications.emailApiKey}`,
        },
        body: JSON.stringify({
          from: config.notifications.emailFrom,
          to: req.target.email,
          subject: req.title,
          text: req.body,
          tag: req.templateKey,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        // 4xx is our mistake and will fail identically on retry; 5xx is theirs.
        return { ok: false, error: `email_${res.status}: ${text.slice(0, 200)}`, retryable: res.status >= 500 };
      }
      const json = (await res.json().catch(() => ({}))) as { id?: string };
      return { ok: true, providerId: json.id };
    } catch (err) {
      return { ok: false, error: (err as Error).message, retryable: true };
    }
  }
}

class SmsProvider implements ChannelProvider {
  readonly channel = 'sms' as const;
  readonly enabled = true;

  async send(req: DeliveryRequest): Promise<DeliveryResult> {
    if (!req.target.phone) {
      return { ok: false, error: 'no_phone_on_account', retryable: false };
    }
    try {
      const auth = Buffer.from(
        `${config.notifications.smsAccountSid}:${config.notifications.smsAuthToken}`,
      ).toString('base64');
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.notifications.smsAccountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${auth}`,
          },
          body: new URLSearchParams({
            To: req.target.phone,
            From: config.notifications.smsFrom!,
            // SMS is billed per segment — title plus body, not a wall of text.
            Body: `${req.title}\n${req.body}`.slice(0, 320),
          }),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `sms_${res.status}: ${text.slice(0, 200)}`, retryable: res.status >= 500 };
      }
      const json = (await res.json().catch(() => ({}))) as { sid?: string };
      return { ok: true, providerId: json.sid };
    } catch (err) {
      return { ok: false, error: (err as Error).message, retryable: true };
    }
  }
}

class FcmPushProvider implements ChannelProvider {
  readonly channel = 'push' as const;
  readonly enabled = true;

  async send(req: DeliveryRequest): Promise<DeliveryResult> {
    const tokens = req.target.pushTokens ?? [];
    if (tokens.length === 0) {
      return { ok: false, error: 'no_device_registered', retryable: false };
    }
    try {
      const res = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${config.notifications.fcmServerKey}`,
        },
        body: JSON.stringify({
          registration_ids: tokens,
          notification: { title: req.title, body: req.body },
          // Deep link travels in data so the app opens the exact booking
          // rather than the home screen.
          data: { ...(req.data ?? {}), deepLink: req.deepLink ?? '', template: req.templateKey },
        }),
      });
      if (!res.ok) {
        return { ok: false, error: `push_${res.status}`, retryable: res.status >= 500 };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message, retryable: true };
    }
  }
}

const n = config.notifications;

export const channelProviders: Record<'push' | 'email' | 'sms', ChannelProvider> = {
  email: n.emailEnabled ? new SmtpEmailProvider() : new LoggingProvider('email'),
  sms: n.smsEnabled ? new SmsProvider() : new LoggingProvider('sms'),
  push: n.pushEnabled ? new FcmPushProvider() : new LoggingProvider('push'),
};

logger.info(
  {
    email: n.emailEnabled ? 'live' : 'not configured',
    sms: n.smsEnabled ? 'live' : 'not configured',
    push: n.pushEnabled ? 'live' : 'not configured',
  },
  '🔔 Notification channels',
);

if (config.env === 'production' && !(n.emailEnabled && n.smsEnabled)) {
  logger.error(
    'PRODUCTION WITHOUT EMAIL/SMS: hosts will not be told about booking requests, ' +
      'and requests will expire against hosts who were never notified.',
  );
}
