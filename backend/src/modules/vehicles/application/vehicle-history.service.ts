import { config } from '../../../config';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * What is publicly known about a car, from its VIN.
 *
 * Two sources with very different economics, deliberately kept apart:
 *
 *  - NHTSA is free, public, US-government-run and needs no key. Recalls come
 *    from here, so every listed car can be checked from day one at no cost.
 *  - VinAudit sells title, salvage, theft and odometer history. It is metered,
 *    so it is key-gated and simply reports "unavailable" when unconfigured
 *    rather than pretending a car has a clean history it has never checked.
 *
 * That distinction matters more than it looks. "No problems found" and "we did
 * not look" are completely different claims to put in front of a guest, and
 * collapsing them is how a platform ends up vouching for a salvage-title car.
 */

export interface Recall {
  campaignNumber: string;
  component: string;
  summary: string;
  remedy?: string;
  consequence?: string;
  reportedAt?: string;
}

export interface TitleHistory {
  /** False when a branded title (salvage, flood, lemon) is on record. */
  clean: boolean | null;
  brands: string[];
  /** Reported theft record. */
  stolen: boolean | null;
  /** Latest odometer reading on record, in miles. */
  odometerMiles: number | null;
  odometerReadAt?: string;
  /** Rollback or inconsistency detected across readings. */
  odometerSuspect: boolean | null;
}

export interface VehicleHistory {
  vin?: string;
  recalls: Recall[];
  /** Null means not checked, NOT "nothing found". */
  title: TitleHistory | null;
  /** Why title history is absent, so the UI can say which. */
  titleUnavailableReason?: 'not_configured' | 'lookup_failed' | 'no_vin';
  checkedAt: string;
}

interface NhtsaRecall {
  NHTSACampaignNumber?: string;
  Component?: string;
  Summary?: string;
  Remedy?: string;
  Consequence?: string;
  ReportReceivedDate?: string;
}

export const vehicleHistoryService = {
  /**
   * Open recalls for a make/model/year.
   *
   * NHTSA indexes recalls by vehicle rather than by VIN, so this is accurate to
   * the model year and not to the individual car — a recall listed here may
   * already have been fixed on this particular vehicle. The UI says so; quietly
   * implying otherwise would have hosts chasing work already done.
   */
  async recalls(make: string, model: string, year: number): Promise<Recall[]> {
    try {
      const url =
        `https://api.nhtsa.gov/recalls/recallsByVehicle` +
        `?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) return [];
      const body = (await res.json()) as { results?: NhtsaRecall[] };
      return (body.results ?? []).map((r) => ({
        campaignNumber: r.NHTSACampaignNumber ?? '',
        component: r.Component ?? 'Unspecified',
        summary: r.Summary ?? '',
        remedy: r.Remedy,
        consequence: r.Consequence,
        reportedAt: r.ReportReceivedDate,
      }));
    } catch (err) {
      // A recall lookup failing must never block a listing from loading.
      logger.warn(`NHTSA recall lookup failed: ${(err as Error).message}`);
      return [];
    }
  },

  /**
   * Title, theft and odometer history from VinAudit.
   *
   * Returns null when no key is configured. The caller must render that as
   * "not checked" — never as clean.
   */
  async titleHistory(vin: string): Promise<{ data: TitleHistory | null; reason?: VehicleHistory['titleUnavailableReason'] }> {
    if (!config.vinAudit.enabled) return { data: null, reason: 'not_configured' };

    try {
      const url = `https://api.vinaudit.com/query.php?key=${config.vinAudit.apiKey}&vin=${encodeURIComponent(vin)}&format=json&report=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return { data: null, reason: 'lookup_failed' };

      const body = (await res.json()) as {
        success?: boolean;
        titlerecords?: { state?: string; date?: string; meter?: string; current?: string }[];
        jsi?: { brand?: string }[];
        checks?: { salvage?: string; theft?: string; problem?: string };
      };
      if (!body.success) return { data: null, reason: 'lookup_failed' };

      const brands = Array.from(new Set((body.jsi ?? []).map((j) => j.brand).filter(Boolean) as string[]));
      const readings = (body.titlerecords ?? [])
        .map((t) => ({ miles: Number(t.meter), at: t.date }))
        .filter((r) => Number.isFinite(r.miles) && r.miles > 0)
        .sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
      const latest = readings[readings.length - 1];

      // A later reading lower than an earlier one is the classic rollback
      // signature — worth surfacing even when no brand is recorded.
      const rollback = readings.some((r, i) => i > 0 && r.miles < readings[i - 1].miles);

      return {
        data: {
          clean: brands.length === 0 && body.checks?.salvage !== 'true',
          brands,
          stolen: body.checks?.theft === 'true',
          odometerMiles: latest?.miles ?? null,
          odometerReadAt: latest?.at,
          odometerSuspect: rollback,
        },
      };
    } catch (err) {
      logger.warn(`VinAudit lookup failed: ${(err as Error).message}`);
      return { data: null, reason: 'lookup_failed' };
    }
  },

  /** Everything known about one car, from the free source and the paid one. */
  async full(input: { vin?: string; make: string; model: string; year: number }): Promise<VehicleHistory> {
    const [recalls, title] = await Promise.all([
      this.recalls(input.make, input.model, input.year),
      input.vin ? this.titleHistory(input.vin) : Promise.resolve({ data: null, reason: 'no_vin' as const }),
    ]);

    return {
      vin: input.vin,
      recalls,
      title: title.data,
      titleUnavailableReason: title.data ? undefined : title.reason,
      checkedAt: new Date().toISOString(),
    };
  },
};
