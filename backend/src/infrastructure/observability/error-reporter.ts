import { config } from '../../config';
import { logger } from '../logging/logger';

/**
 * Error reporting to Sentry, over plain HTTP.
 *
 * Deliberately no SDK: the whole surface we need is "post one JSON envelope",
 * and the codebase already talks to Twilio and FCM the same way. That keeps the
 * dependency footprint (and its transitive supply-chain risk) at zero for a
 * feature that must never itself break the request it is reporting on.
 *
 * With no DSN configured this degrades to structured logging, so development
 * and self-hosted deployments lose nothing but the dashboard.
 */

interface ReportContext {
  requestId?: string;
  userId?: string;
  path?: string;
  method?: string;
  /** Anything else worth seeing next to the stack trace. */
  extra?: Record<string, unknown>;
}

/** Parsed from a DSN like https://<key>@o123.ingest.sentry.io/456 */
interface Dsn {
  envelopeUrl: string;
  publicKey: string;
}

function parseDsn(raw: string): Dsn | null {
  try {
    const url = new URL(raw);
    const projectId = url.pathname.replace(/^\//, '');
    if (!url.username || !projectId) return null;
    return {
      envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

const dsn = config.observability.sentryDsn ? parseDsn(config.observability.sentryDsn) : null;

if (config.observability.sentryDsn && !dsn) {
  logger.warn('SENTRY_DSN is set but could not be parsed — error reporting is disabled');
}

/**
 * Report an error. Never throws and never rejects: a failure to report must not
 * turn a handled 500 into an unhandled crash, so the send is fire-and-forget.
 */
export function reportError(err: unknown, ctx: ReportContext = {}): void {
  const error = err instanceof Error ? err : new Error(String(err));

  // Always log locally — the dashboard is an addition, not a replacement.
  logger.error(
    { err: error.message, stack: error.stack, ...ctx },
    'error reported',
  );
  if (!dsn) return;

  const eventId = crypto.randomUUID().replace(/-/g, '');
  const sentAt = new Date().toISOString();

  const event = {
    event_id: eventId,
    timestamp: sentAt,
    platform: 'node',
    level: 'error',
    environment: config.env,
    release: config.observability.release,
    server_name: undefined, // deliberately omitted: it is host PII we don't need
    transaction: ctx.path,
    request: ctx.path ? { url: ctx.path, method: ctx.method } : undefined,
    // Sentry groups on the exception; the id is what ties it to our own logs.
    tags: { requestId: ctx.requestId ?? '' },
    user: ctx.userId ? { id: ctx.userId } : undefined,
    extra: ctx.extra,
    exception: {
      values: [
        {
          type: error.name,
          value: error.message,
          stacktrace: { frames: parseStack(error.stack) },
        },
      ],
    },
  };

  const body = [
    JSON.stringify({ event_id: eventId, sent_at: sentAt }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n');

  void fetch(dsn.envelopeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=cato/1.0`,
    },
    body,
  }).catch((e: Error) => {
    // Reporting is best-effort by design; log at debug so a Sentry outage does
    // not itself fill the error log.
    logger.debug({ err: e.message }, 'sentry report failed');
  });
}

/**
 * Sentry expects frames oldest-first, opposite to a JS stack. Parsed loosely —
 * a malformed frame is not worth losing the whole report over.
 */
function parseStack(stack?: string): { filename: string; function: string; lineno?: number }[] {
  if (!stack) return [];
  return stack
    .split('\n')
    .slice(1)
    .map((line) => {
      const m = /at (?:(.+?) )?\(?(.+?):(\d+):\d+\)?$/.exec(line.trim());
      if (!m) return null;
      return { function: m[1] ?? '<anonymous>', filename: m[2], lineno: Number(m[3]) };
    })
    .filter((f): f is { filename: string; function: string; lineno: number } => !!f)
    .reverse();
}

/**
 * Catch what Express cannot.
 *
 * An unhandled rejection or uncaught exception bypasses the error middleware
 * entirely — the process simply dies, and with no handler nothing is recorded,
 * so the first anyone knows is a user complaining. We report, then let the
 * process exit on a genuinely uncaught exception (its state is no longer
 * trustworthy) while allowing a stray rejection to be survivable.
 */
export function installCrashHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    reportError(reason, { extra: { kind: 'unhandledRejection' } });
  });

  process.on('uncaughtException', (err) => {
    reportError(err, { extra: { kind: 'uncaughtException' } });
    // Give the report a moment to leave, then exit so the orchestrator restarts
    // us cleanly rather than leaving a half-broken process serving traffic.
    setTimeout(() => process.exit(1), 1000).unref();
  });

  logger.info(
    `🔭 Error reporting: ${dsn ? 'Sentry (live)' : 'local logs only — set SENTRY_DSN to enable'}`,
  );
}
