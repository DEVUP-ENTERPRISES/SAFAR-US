import { createHash } from 'crypto';
import geoip from 'geoip-lite';
import { VisitorEventModel, type TrafficSource, type VisitorEventDoc } from '../infrastructure/visitor-event.model';
import type { TrackVisitDto } from '../dto/visitor-event.schemas';
import { config } from '../../../config';

const SEARCH_ENGINES = ['google.', 'bing.', 'yahoo.', 'duckduckgo.', 'baidu.', 'yandex.'];
const SOCIAL = ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 't.co', 'tiktok.com', 'linkedin.com', 'reddit.com', 'pinterest.com', 'youtube.com'];

function classifySource(referrerDomain: string | undefined, utmMedium: string | undefined): TrafficSource {
  if (utmMedium === 'cpc' || utmMedium === 'paid' || utmMedium === 'ppc') return 'paid';
  if (utmMedium === 'email') return 'email';
  if (utmMedium === 'social') return 'social';
  if (!referrerDomain) return 'direct';
  if (SEARCH_ENGINES.some((s) => referrerDomain.includes(s))) return 'search';
  if (SOCIAL.some((s) => referrerDomain.includes(s))) return 'social';
  return 'referral';
}

function referrerDomainOf(referrer: string | undefined): string | undefined {
  if (!referrer) return undefined;
  try {
    return new URL(referrer).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function classifyDevice(userAgent: string): 'mobile' | 'tablet' | 'desktop' {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|android|iphone/.test(ua)) return 'mobile';
  return 'desktop';
}

/** Non-reversible per-visitor identity for unique counts. Never the raw IP. */
function hashVisitor(ip: string): string {
  return createHash('sha256').update(`${config.visitorHashSalt}:${ip}`).digest('hex');
}

export interface LiveTrafficSummary {
  activeVisitors: number; // distinct sessions in the last 5 minutes
  visitsLast24h: number;
  uniqueVisitorsLast24h: number;
  recent: { path: string; source: TrafficSource; referrerDomain?: string; country?: string; city?: string; device: string; at: string }[];
  topPages: { path: string; count: number }[];
  topReferrers: { domain: string; count: number }[];
  bySource: { source: TrafficSource; count: number }[];
}

export interface GeoSummaryEntry {
  countryCode: string;
  country: string;
  city?: string;
  lat: number;
  lng: number;
  count: number;
}

export class VisitorTrackingService {
  /** Fire-and-forget from the public beacon. Never throws to the caller. */
  async track(dto: TrackVisitDto, ctx: { ip: string; userAgent: string; userId?: string }): Promise<void> {
    const geo = geoip.lookup(ctx.ip);
    const referrerDomain = referrerDomainOf(dto.referrer);

    await VisitorEventModel.create({
      sessionId: dto.sessionId,
      visitorHash: hashVisitor(ctx.ip),
      userId: ctx.userId,
      path: dto.path,
      referrer: dto.referrer,
      referrerDomain,
      source: classifySource(referrerDomain, dto.utmMedium),
      utmSource: dto.utmSource,
      utmMedium: dto.utmMedium,
      utmCampaign: dto.utmCampaign,
      country: geo?.country,
      countryCode: geo?.country,
      region: geo?.region,
      city: geo?.city,
      lat: geo?.ll?.[0],
      lng: geo?.ll?.[1],
      device: classifyDevice(ctx.userAgent),
    });
  }

  async liveSummary(): Promise<LiveTrafficSummary> {
    const now = Date.now();
    const since5m = new Date(now - 5 * 60_000);
    const since24h = new Date(now - 24 * 3_600_000);

    const [activeSessions, visitsLast24h, uniqueVisitors, recent, topPagesAgg, topReferrersAgg, bySourceAgg] =
      await Promise.all([
        VisitorEventModel.distinct('sessionId', { createdAt: { $gte: since5m } }),
        VisitorEventModel.countDocuments({ createdAt: { $gte: since24h } }),
        VisitorEventModel.distinct('visitorHash', { createdAt: { $gte: since24h } }),
        VisitorEventModel.find({}).sort({ createdAt: -1 }).limit(30).lean<VisitorEventDoc[]>(),
        VisitorEventModel.aggregate<{ _id: string; count: number }>([
          { $match: { createdAt: { $gte: since24h } } },
          { $group: { _id: '$path', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
        VisitorEventModel.aggregate<{ _id: string; count: number }>([
          { $match: { createdAt: { $gte: since24h }, referrerDomain: { $exists: true, $ne: null } } },
          { $group: { _id: '$referrerDomain', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
        VisitorEventModel.aggregate<{ _id: TrafficSource; count: number }>([
          { $match: { createdAt: { $gte: since24h } } },
          { $group: { _id: '$source', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
      ]);

    return {
      activeVisitors: activeSessions.length,
      visitsLast24h,
      uniqueVisitorsLast24h: uniqueVisitors.length,
      recent: recent.map((r) => ({
        path: r.path,
        source: r.source,
        referrerDomain: r.referrerDomain,
        country: r.country,
        city: r.city,
        device: r.device,
        at: r.createdAt.toISOString(),
      })),
      topPages: topPagesAgg.map((r) => ({ path: r._id, count: r.count })),
      topReferrers: topReferrersAgg.map((r) => ({ domain: r._id, count: r.count })),
      bySource: bySourceAgg.map((r) => ({ source: r._id, count: r.count })),
    };
  }

  /** Aggregated points for the heatmap — one row per city, capped to a window. */
  async geoSummary(days: number): Promise<GeoSummaryEntry[]> {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await VisitorEventModel.aggregate<{
      _id: { countryCode: string; city?: string };
      country: string;
      lat: number;
      lng: number;
      count: number;
    }>([
      { $match: { createdAt: { $gte: since }, lat: { $ne: null }, lng: { $ne: null } } },
      {
        $group: {
          _id: { countryCode: '$countryCode', city: '$city' },
          country: { $first: '$country' },
          lat: { $avg: '$lat' },
          lng: { $avg: '$lng' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 500 },
    ]);

    return rows.map((r) => ({
      countryCode: r._id.countryCode,
      country: r.country,
      city: r._id.city,
      lat: r.lat,
      lng: r.lng,
      count: r.count,
    }));
  }
}

export const visitorTrackingService = new VisitorTrackingService();
