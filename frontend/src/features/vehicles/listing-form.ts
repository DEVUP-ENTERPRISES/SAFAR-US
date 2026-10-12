import { kmToMiles, milesToKm, perKmToPerMile, perMileToPerKm } from '@/lib/utils/format';
import { api } from '@/lib/api/client';
import type { Vehicle } from './types';

/** Collapse a sorted list of YYYY-MM-DD day keys into contiguous ranges. */
export function groupRanges(days: string[]): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  const nextDay = (d: string) => {
    const t = new Date(d + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10);
  };
  for (const day of days) {
    const last = out[out.length - 1];
    if (last && nextDay(last.to) === day) last.to = day;
    else out.push({ from: day, to: day });
  }
  return out;
}

/** "Mar 3" or "Mar 3 – Mar 7" for a blocked range chip. */
export function fmtRange(from: string, to: string): string {
  const f = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return from === to ? f(from) : `${f(from)} – ${f(to)}`;
}

export interface TripPrefsForm {
  instantBook: boolean;
  minHours: string;
  maxDays: string;
  turnaround: string;
  notice: string;
  overagePerMile: string;
}

export function tripPrefsForm(v: Vehicle): TripPrefsForm {
  const l = v.listing;
  return {
    instantBook: !!l?.instantBook,
    minHours: String(l?.minTripHours ?? 24),
    // Max trip length is in days; hosts do not need hour precision for how long a trip can run.
    maxDays: String(Math.max(1, Math.round((l?.maxTripHours ?? 720) / 24))),
    turnaround: String(l?.turnaroundDays ?? 0),
    notice: String(l?.advanceNoticeHours ?? 0),
    overagePerMile: String((perKmToPerMile(v.mileageLimit?.overageFeePerKm ?? 0) / 100) || ''),
  };
}

/** Trip preferences and the mileage rule; daily miles are the platform's, never the host's. */
export function tripPrefsPatch(f: TripPrefsForm, dailyMiles: number): Record<string, unknown> {
  return {
    listing: {
      instantBook: f.instantBook,
      minTripHours: Math.min(720, Math.max(1, Number(f.minHours) || 1)),
      maxTripHours: Math.max(1, Number(f.maxDays) || 1) * 24,
      turnaroundDays: Math.min(7, Math.max(0, Number(f.turnaround) || 0)),
      advanceNoticeHours: Math.min(720, Math.max(0, Number(f.notice) || 0)),
    },
    mileageLimit: {
      perDayKm: milesToKm(dailyMiles),
      overageFeePerKm: perMileToPerKm(Math.round(Number(f.overagePerMile || 0) * 100)),
    },
  };
}

export interface DetailsForm {
  title: string;
  description: string;
  features: string[];
  plate: string;
  color: string;
  doors: string;
  odometerMiles: string;
}

export function detailsForm(v: Vehicle): DetailsForm {
  return {
    title: v.listing?.title ?? '',
    description: v.listing?.description ?? '',
    features: v.features ?? [],
    plate: v.registrationNumber ?? '',
    color: v.specs?.color ?? '',
    doors: String(v.specs?.doors ?? ''),
    odometerMiles: String(kmToMiles(v.specs?.mileageKm ?? 0) || ''),
  };
}

/** Omits empty spec fields rather than sending undefined, which would overwrite stored values in the merge. */
export function detailsPatch(f: DetailsForm): Record<string, unknown> {
  return {
    listing: { title: f.title.trim(), description: f.description },
    features: f.features,
    registrationNumber: f.plate.trim() || undefined,
    specs: {
      ...(f.color ? { color: f.color } : {}),
      ...(f.doors ? { doors: Number(f.doors) } : {}),
      ...(f.odometerMiles ? { mileageKm: milesToKm(Number(f.odometerMiles)) } : {}),
    },
  };
}

/** Pickup details; empty strings clear the field rather than saving a blank. */
export function pickupPatch(f: { instructions: string; accessCode: string; spotPhotoUrl: string }) {
  return {
    pickup: {
      ...(f.instructions.trim() ? { instructions: f.instructions.trim() } : {}),
      ...(f.accessCode.trim() ? { accessCode: f.accessCode.trim() } : {}),
      ...(f.spotPhotoUrl.trim() ? { spotPhotoUrl: f.spotPhotoUrl.trim() } : {}),
    },
  };
}

export interface Recall {
  campaignNumber: string;
  component: string;
  summary: string;
  remedy?: string;
  consequence?: string;
  reportedAt?: string;
}

export interface VehicleHistory {
  vin?: string;
  recalls: Recall[];
  title: {
    clean: boolean | null;
    brands: string[];
    stolen: boolean | null;
    odometerMiles: number | null;
    odometerSuspect: boolean | null;
  } | null;
  titleUnavailableReason?: 'not_configured' | 'lookup_failed' | 'no_vin';
  checkedAt: string;
}

export const vehicleHistory = (vehicleId: string) => api.get<VehicleHistory>(`/vehicles/${vehicleId}/history`);

/** Why title history is missing, never shown as clean. */
export function titleUnavailableText(reason?: VehicleHistory['titleUnavailableReason']): string {
  if (reason === 'no_vin') return 'Title and odometer history needs a VIN on this listing.';
  if (reason === 'lookup_failed') return 'Title history could not be checked just now.';
  return 'Title, salvage and odometer history has not been checked on this car.';
}

/** The status row's explanation under the listing. */
export function listingStatusText(v: Vehicle, photosNeeded: number): string {
  if (v.status === 'listed') return 'Your car appears in search results and can be booked.';
  if (v.verificationStatus === 'verified') return 'Verified but not listed.';
  if (photosNeeded > 0) return `Add ${photosNeeded} more photo${photosNeeded === 1 ? '' : 's'} to submit for verification.`;
  return 'Submit for verification to go live.';
}
