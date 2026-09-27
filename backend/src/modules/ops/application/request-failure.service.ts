import type { Request } from 'express';
import { RequestFailureModel, type FailureArea, type RequestFailureDoc } from '../infrastructure/request-failure.model';
import { kv } from '../../../infrastructure/cache/kv-store';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { logger } from '../../../infrastructure/logging/logger';

const AREAS: [RegExp, FailureArea][] = [
  [/^\/(bookings|trips|availability)/, 'booking'],
  [/^\/(payments|wallet|subscriptions|payouts|coupons)/, 'payment'],
  [/^\/kyc/, 'identity'],
  [/^\/auth/, 'auth'],
];
// Refusals that are normal traffic, not something ops can act on.
const IGNORED_CODES = new Set(['UNAUTHORIZED', 'AUTH_REQUIRED', 'NOT_FOUND', 'ROUTE_NOT_FOUND', 'TOO_MANY_REQUESTS']);
const ALERT_WINDOW_SECONDS = 600;

const pathOf = (req: Request) => req.originalUrl.split('?')[0].replace(/^\/api\/v\d+/, '');
const areaOf = (path: string): FailureArea => AREAS.find(([rx]) => rx.test(path))?.[1] ?? 'other';

export const requestFailureService = {
  /** Records a failed request. Never throws: recording a failure must not change the response. */
  record(req: Request, status: number, code: string, message: string): void {
    try {
      const path = pathOf(req);
      const area = areaOf(path);
      // Server errors everywhere; refusals only where a guest was trying to book or pay.
      if (status < 500 && (area === 'other' || area === 'auth' || IGNORED_CODES.has(code) || req.method === 'GET')) return;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const params = (req.params ?? {}) as Record<string, string>;
      const doc: Partial<RequestFailureDoc> = {
        area,
        method: req.method,
        path: path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id'),
        status,
        code,
        message: message.slice(0, 500),
        userId: req.principal?.userId,
        requestId: req.res?.locals?.requestId as string | undefined,
        vehicleId: typeof body.vehicleId === 'string' ? body.vehicleId : undefined,
        bookingId: params.bookingId ?? params.id ?? (typeof body.bookingId === 'string' ? body.bookingId : undefined),
        country: req.header('cf-ipcountry') ?? undefined,
        userAgent: req.header('user-agent')?.slice(0, 200),
      };
      void RequestFailureModel.create(doc).catch((err) => logger.warn({ err: (err as Error).message }, 'could not record request failure'));
      if (status >= 500) void this.alertOnce(doc);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'request failure recording failed');
    }
  },

  /** One staff alert per error code per window, so a burst of the same failure is one message, not hundreds. */
  async alertOnce(doc: Partial<RequestFailureDoc>): Promise<void> {
    const first = await kv().acquire(`ops:alert:${doc.code}:${doc.path}`, ALERT_WINDOW_SECONDS).catch(() => true);
    if (first) emit(EVENTS.OPS_REQUEST_FAILED, doc.code ?? 'unknown', doc);
  },

  async list(opts: { area?: string; days?: number; limit?: number }) {
    const since = new Date(Date.now() - Math.min(opts.days ?? 7, 90) * 86_400_000);
    const filter: Record<string, unknown> = { at: { $gte: since } };
    if (opts.area) filter.area = opts.area;
    const [items, byCode] = await Promise.all([
      RequestFailureModel.find(filter).sort({ at: -1 }).limit(Math.min(opts.limit ?? 100, 200)).lean<RequestFailureDoc[]>(),
      RequestFailureModel.aggregate<{ _id: { code: string; area: string }; count: number; last: Date; status: number; message: string }>([
        { $match: filter },
        { $sort: { at: -1 } },
        { $group: { _id: { code: '$code', area: '$area' }, count: { $sum: 1 }, last: { $first: '$at' }, status: { $first: '$status' }, message: { $first: '$message' } } },
        { $sort: { count: -1 } },
        { $limit: 30 },
      ]),
    ]);
    return {
      items,
      summary: byCode.map((r) => ({ code: r._id.code, area: r._id.area, count: r.count, lastAt: r.last, status: r.status, message: r.message })),
    };
  },
};
