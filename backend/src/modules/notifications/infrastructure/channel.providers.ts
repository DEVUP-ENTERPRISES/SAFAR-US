import nodemailer, { type Transporter } from 'nodemailer';
import { createSign } from 'crypto';
import { UserModel } from '../../users/infrastructure/user.model';
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

/** Transactional email over an HTTP API (Resend, Postmark, SendGrid, …). */
class HttpEmailProvider implements ChannelProvider {
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

/**
 * Email over SMTP — any mailbox provider: Gmail, Zoho, Fastmail, SES SMTP,
 * a self-hosted Postfix.
 *
 * The transport is created once and reused: opening a TLS connection per
 * message is slow and gets an account rate-limited quickly. Nodemailer pools
 * connections and serialises sends over them.
 */
class SmtpEmailProvider implements ChannelProvider {
  readonly channel = 'email' as const;
  readonly enabled = true;
  private transport: Transporter | null = null;

  private get mailer(): Transporter {
    if (!this.transport) {
      this.transport = nodemailer.createTransport({
        host: config.notifications.smtpHost!,
        port: config.notifications.smtpPort,
        secure: config.notifications.smtpSecure,
        auth: {
          user: config.notifications.smtpUser!,
          pass: config.notifications.smtpPass!,
        },
        pool: true,
        maxConnections: 3,
        // A mail server that hangs must not hold a notification worker open.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
    }
    return this.transport;
  }

  async send(req: DeliveryRequest): Promise<DeliveryResult> {
    if (!req.target.email) {
      return { ok: false, error: 'no_email_on_account', retryable: false };
    }
    try {
      const info = await this.mailer.sendMail({
        from: config.notifications.emailFrom,
        to: req.target.email,
        subject: req.title,
        text: req.deepLink ? `${req.body}\n\n${absolute(req.deepLink)}` : req.body,
        html: renderHtml(req),
      });
      return { ok: true, providerId: info.messageId };
    } catch (err) {
      const e = err as { responseCode?: number; message?: string };
      // 5xx SMTP replies are permanent (bad mailbox, blocked sender); 4xx are
      // transient (greylisting, rate limit) and worth another attempt.
      const permanent = typeof e.responseCode === 'number' && e.responseCode >= 500;
      return { ok: false, error: e.message ?? 'smtp_send_failed', retryable: !permanent };
    }
  }

  /** Called at boot so a wrong password surfaces then, not on first booking. */
  async verify(): Promise<void> {
    await this.mailer.verify();
  }
}

/** Relative deep links need the site origin to be clickable in an inbox. */
function absolute(deepLink: string): string {
  if (/^https?:\/\//.test(deepLink)) return deepLink;
  const base = (config.cors.origins[0] ?? '').replace(/\/+$/, '');
  return `${base}${deepLink.startsWith('/') ? '' : '/'}${deepLink}`;
}

/**
 * A plain, legible HTML email. Deliberately minimal: inbox clients strip most
 * CSS, and a booking notification's job is to be read and acted on, not admired.
 */
function renderHtml(req: DeliveryRequest): string {
  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const link = req.deepLink ? absolute(req.deepLink) : null;
  return [
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;',
    'max-width:520px;margin:0 auto;padding:24px;color:#12161c;line-height:1.6">',
    `<h1 style="font-size:20px;margin:0 0 12px">${esc(req.title)}</h1>`,
    `<p style="margin:0 0 20px;color:#46535b">${esc(req.body)}</p>`,
    link
      ? `<a href="${esc(link)}" style="display:inline-block;background:#0f9d6a;color:#fff;` +
        'text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600">View details</a>'
      : '',
    '</div>',
  ].join('');
}

class SmsProvider implements ChannelProvider {
  readonly channel = 'sms' as const;
  readonly enabled = true;

  async send(req: DeliveryRequest): Promise<DeliveryResult> {
    if (!req.target.phone) {
      return { ok: false, error: 'no_phone_on_account', retryable: false };
    }
    try {
      // Basic auth with an API key (SK…) + secret when configured, else the
      // legacy Auth Token — resolved in config. The Account SID always stays in
      // the URL path, since it (not the key) identifies the account.
      const auth = Buffer.from(
        `${config.notifications.smsAuthUser}:${config.notifications.smsAuthPass}`,
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

/**
 * Firebase Cloud Messaging over the HTTP v1 API.
 *
 * The legacy server-key endpoint (fcm.googleapis.com/fcm/send with an
 * Authorization: key=... header) was shut down by Google in 2024, so v1 is the
 * only path that works. v1 authenticates with a short-lived OAuth token minted
 * from the service account — signed here with Node's crypto (RS256), exchanged
 * for an access token, and cached until just before it expires, rather than
 * pulling in the whole firebase-admin SDK for one call.
 *
 * v1 sends to one token per request, so a user's devices are fanned out in
 * parallel and a token FCM reports as dead is pruned from the account — dead
 * tokens accumulate forever otherwise and every send wastes a call on them.
 */
class FcmV1PushProvider implements ChannelProvider {
  readonly channel = 'push' as const;
  readonly enabled = true;
  private token: { value: string; expiresAt: number } | null = null;

  private get sa() {
    return config.notifications.fcmServiceAccount!;
  }

  /** Mint (and cache) a Google OAuth2 access token for FCM. */
  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 60_000) return this.token.value;

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
      iss: this.sa.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: this.sa.tokenUri,
      iat: now,
      exp: now + 3600,
    };
    const b64 = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const signingInput = `${b64(header)}.${b64(claims)}`;
    const signature = createSign('RSA-SHA256')
      .update(signingInput)
      .sign(this.sa.privateKey, 'base64url');
    const jwt = `${signingInput}.${signature}`;

    const res = await fetch(this.sa.tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    if (!res.ok) {
      throw new Error(`FCM token exchange ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return this.token.value;
  }

  async send(req: DeliveryRequest): Promise<DeliveryResult> {
    const tokens = req.target.pushTokens ?? [];
    if (tokens.length === 0) {
      return { ok: false, error: 'no_device_registered', retryable: false };
    }

    let accessToken: string;
    try {
      accessToken = await this.accessToken();
    } catch (err) {
      return { ok: false, error: (err as Error).message, retryable: true };
    }

    const url = `https://fcm.googleapis.com/v1/projects/${this.sa.projectId}/messages:send`;
    const dead: string[] = [];
    let anyOk = false;

    await Promise.all(
      tokens.map(async (token) => {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              message: {
                token,
                notification: { title: req.title, body: req.body },
                // Deep link rides in data so a tap opens the exact screen.
                data: {
                  deepLink: req.deepLink ?? '',
                  template: req.templateKey,
                  ...stringifyData(req.data),
                },
              },
            }),
          });
          if (res.ok) {
            anyOk = true;
            return;
          }
          // 404/UNREGISTERED or 400/INVALID_ARGUMENT = the token is dead.
          if (res.status === 404 || res.status === 400) dead.push(token);
        } catch {
          /* network hiccup on one token — other tokens may still land */
        }
      }),
    );

    // Prune dead tokens so they don't waste future sends.
    if (dead.length > 0 && req.target.userId) {
      await UserModel.updateOne(
        { _id: req.target.userId },
        { $pull: { pushTokens: { $in: dead } } },
      ).catch(() => undefined);
    }

    return anyOk
      ? { ok: true }
      : { ok: false, error: dead.length ? 'all_tokens_invalid' : 'push_send_failed', retryable: dead.length === 0 };
  }
}

/** FCM data payloads must be string→string; coerce anything else. */
function stringifyData(data?: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

const n = config.notifications;

export const channelProviders: Record<'push' | 'email' | 'sms', ChannelProvider> = {
  // SMTP wins when both are configured — it is the more explicit choice.
  email: n.smtpEnabled
    ? new SmtpEmailProvider()
    : n.emailApiEnabled
      ? new HttpEmailProvider()
      : new LoggingProvider('email'),
  sms: n.smsEnabled ? new SmsProvider() : new LoggingProvider('sms'),
  push: n.pushEnabled ? new FcmV1PushProvider() : new LoggingProvider('push'),
};

logger.info(
  {
    email: n.smtpEnabled ? `SMTP ${n.smtpHost}:${n.smtpPort}` : n.emailApiEnabled ? 'HTTP API' : 'not configured',
    sms: n.smsEnabled ? `live (${n.smsUsingApiKey ? 'API key' : 'auth token'})` : 'not configured',
    push: n.pushEnabled ? 'live' : 'not configured',
  },
  '🔔 Notification channels',
);

/**
 * Prove the SMTP credentials at boot rather than on the first booking. A wrong
 * password should be a startup line, not a host who never heard about a trip.
 */
export async function verifyChannels(): Promise<void> {
  const email = channelProviders.email;
  if (email instanceof SmtpEmailProvider) {
    try {
      await email.verify();
      logger.info('✅ SMTP credentials verified');
    } catch (err) {
      logger.error({ err: (err as Error).message }, '❌ SMTP credentials rejected — email will not send');
    }
  }
}

if (config.env === 'production' && !(n.emailEnabled && n.smsEnabled)) {
  logger.error(
    'PRODUCTION WITHOUT EMAIL/SMS: hosts will not be told about booking requests, ' +
      'and requests will expire against hosts who were never notified.',
  );
}
