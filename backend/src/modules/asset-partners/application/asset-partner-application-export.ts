import { AssetPartnerApplicationModel, type AssetPartnerApplicationDoc } from '../infrastructure/asset-partner-application.model';
import { mapsProvider } from '../../maps/infrastructure/maps.provider';
import { logger } from '../../../infrastructure/logging/logger';

export const addressLine = (a: Pick<AssetPartnerApplicationDoc, 'address' | 'city' | 'state' | 'zip'>) => `${a.address}, ${a.city}, ${a.state} ${a.zip}`;
export const mapsLink = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

/** Looks the applicant's address up on the map once and keeps the result; a provider failure leaves it unchecked to retry later. */
export async function locateApplication(app: Pick<AssetPartnerApplicationDoc, '_id' | 'address' | 'city' | 'state' | 'zip' | 'geo'>): Promise<AssetPartnerApplicationDoc['geo']> {
  if (app.geo?.checkedAt) return app.geo;
  try {
    const [hit] = await mapsProvider.geocode(addressLine(app));
    const geo = hit ? { lat: hit.lat, lng: hit.lng, formatted: hit.formatted, matched: true, checkedAt: new Date() } : { matched: false, checkedAt: new Date() };
    await AssetPartnerApplicationModel.updateOne({ _id: app._id }, { $set: { geo } });
    return geo;
  } catch (err) {
    logger.warn({ err, applicationId: app._id }, 'application address lookup failed');
    return app.geo;
  }
}

/** Straight-line distance in miles between two points. */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** How far the applicant's device was from the address they typed, when both are known. */
export function submittedFromMiles(a: Pick<AssetPartnerApplicationDoc, 'geo' | 'submittedFrom'>): number | undefined {
  if (!a.submittedFrom || a.geo?.lat == null || a.geo.lng == null) return undefined;
  return Math.round(milesBetween(a.submittedFrom, { lat: a.geo.lat, lng: a.geo.lng }) * 10) / 10;
}

const COLUMNS: [string, (a: AssetPartnerApplicationDoc) => unknown][] = [
  ['Reference', (a) => a.reference],
  ['Status', (a) => a.status.replace(/_/g, ' ')],
  ['Type', (a) => (a.kind === 'vehicle' ? 'Extra car' : 'New partner')],
  ['Submitted', (a) => a.createdAt.toISOString().slice(0, 10)],
  ['Name', (a) => a.fullName],
  ['Business', (a) => a.businessName],
  ['Joining as', (a) => a.partnerType],
  ['Email', (a) => a.email],
  ['Phone', (a) => a.phone],
  ['Address', (a) => addressLine(a)],
  ['Address found on map', (a) => (a.geo?.checkedAt ? (a.geo.matched ? 'Yes' : 'No') : 'Not checked')],
  ['Map link', (a) => mapsLink(addressLine(a))],
  ['Applied from (miles from address)', (a) => submittedFromMiles(a) ?? ''],
  ['Year', (a) => a.vehicle.year],
  ['Make', (a) => a.vehicle.make],
  ['Model', (a) => a.vehicle.model],
  ['Trim', (a) => a.vehicle.trim],
  ['VIN', (a) => a.vehicle.vin],
  ['Plate', (a) => a.vehicle.plate?.replace(/\s+/g, '').toUpperCase()],
  ['Mileage', (a) => a.vehicle.mileage],
  ['Ownership', (a) => a.ownership],
  ['Title', (a) => a.titleStatus],
  ['Lienholder', (a) => a.lienholder],
  ['Insurance carrier', (a) => a.insurance?.carrier],
  ['Policy number', (a) => a.insurance?.policyNumber],
  ['Accident', (a) => (a.hadAccident ? `Yes: ${a.accidentDetail ?? ''}` : 'No')],
  ['Availability', (a) => (a.availability === 'seasonal' ? `Seasonal, ${a.seasonMonths ?? ''} months` : 'Full time')],
  ['Preferred zone', (a) => a.preferredZone],
  ['Notes', (a) => a.notes],
  ['Photos', (a) => a.photos.map((p) => p.url).join(' ')],
  ['Review notes', (a) => a.reviewNotes],
];

// A leading = + - @ would run as a formula in Excel; a leading quote keeps it as text.
const cell = (v: unknown): string => {
  if (v === undefined || v === null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Applications as a spreadsheet file Excel, Google Sheets and Numbers open with a double click. */
export function applicationsCsv(apps: AssetPartnerApplicationDoc[]): string {
  const rows = [COLUMNS.map(([h]) => h), ...apps.map((a) => COLUMNS.map(([, get]) => get(a)))];
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
