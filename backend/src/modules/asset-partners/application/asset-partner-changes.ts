import { DocumentModel } from '../../documents/infrastructure/document.model';
import { CHANGE_ITEMS, type ChangeKey } from '../domain/application-rules';
import type { AssetPartnerApplicationDoc } from '../infrastructure/asset-partner-application.model';
import type { PortalApplicationDto } from '../dto/asset-partner-application.schemas';

type Photo = AssetPartnerApplicationDoc['photos'][number];
type AppShape = Pick<AssetPartnerApplicationDoc,
  'fullName' | 'businessName' | 'partnerType' | 'phone' | 'address' | 'city' | 'state' | 'zip' | 'vehicle' | 'ownership' | 'titleStatus' | 'lienholder'
  | 'hadAccident' | 'accidentDetail' | 'photos' | 'insurance' | 'availability' | 'seasonMonths'>;

const iso = (d?: Date | string) => (d ? new Date(d).toISOString().slice(0, 10) : undefined);
const photoOf = (photos: Photo[] | undefined, label: string) => photos?.find((p) => p.label === label);
const clean = (o: Record<string, unknown>) => JSON.parse(JSON.stringify(o)) as Record<string, unknown>;

/** How one requested item looks on an application, in a form that compares reliably. */
export function sectionValue(a: AppShape, key: ChangeKey): unknown {
  if (key.startsWith('photo:')) {
    const p = photoOf(a.photos, key.slice(6));
    return p ? clean({ url: p.url, key: p.key, sha256: p.sha256 }) : null;
  }
  switch (key) {
    case 'details': {
      const v = a.vehicle;
      return clean({ vin: v.vin?.toUpperCase(), year: v.year, make: v.make, model: v.model, trim: v.trim, mileage: v.mileage, plate: v.plate?.toUpperCase() });
    }
    case 'ownership': return clean({ ownership: a.ownership, lienholder: a.lienholder, titleStatus: a.titleStatus });
    case 'condition': return clean({ hadAccident: a.hadAccident, accidentDetail: a.accidentDetail });
    case 'insurance': return clean({ carrier: a.insurance?.carrier, policyNumber: a.insurance?.policyNumber, coverageType: a.insurance?.coverageType, policyExpiry: iso(a.insurance?.policyExpiry) });
    case 'availability': return clean({ availability: a.availability, seasonMonths: a.seasonMonths });
    case 'contact': return clean({ fullName: a.fullName, businessName: a.businessName, partnerType: a.partnerType, phone: a.phone, address: a.address, city: a.city, state: a.state, zip: a.zip });
    default: return null;
  }
}

/** The latest upload in a paper category, which a requested paper must replace. */
async function latestPaper(userId: string | undefined, key: ChangeKey): Promise<string | null> {
  if (!userId) return null;
  const doc = await DocumentModel.findOne({ ownerId: userId, category: key.slice(6), deletedAt: null }).sort({ createdAt: -1 }).select('_id').lean<{ _id: string }>();
  return doc?._id ? String(doc._id) : null;
}

/** How every requested item looks now, stored with the request so the resubmission can be checked against it. */
export async function snapshot(app: AssetPartnerApplicationDoc, keys: ChangeKey[]): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = key.startsWith('paper:') ? await latestPaper(app.submittedByUserId, key) : sectionValue(app, key);
  return out;
}

/** The stored application as a submission, so untouched items are carried over exactly. */
export function dtoFromApp(a: AssetPartnerApplicationDoc): PortalApplicationDto {
  return {
    fullName: a.fullName, businessName: a.businessName, partnerType: a.partnerType, phone: a.phone ?? '', address: a.address, city: a.city, state: a.state, zip: a.zip,
    referral: a.referral, vehicle: a.vehicle, ownership: a.ownership, titleStatus: a.titleStatus, lienholder: a.lienholder, lienAccountLast4: a.lienAccountLast4,
    estimatedMarketValue: a.estimatedMarketValue, accident: a.hadAccident ? 'yes' : 'no', accidentDetail: a.accidentDetail,
    hasMaintenanceRecords: a.hasMaintenanceRecords === undefined ? undefined : a.hasMaintenanceRecords ? 'yes' : 'no',
    photos: a.photos ?? [], insurance: a.insurance, availability: a.availability, seasonMonths: a.seasonMonths,
    preferredZone: a.preferredZone, targetStartDate: a.targetStartDate, notes: a.notes,
    acknowledgedAccurate: true, acknowledgedInspection: true, acknowledgedTerms: true, signature: a.signature, signDate: a.signedAt,
  } as PortalApplicationDto;
}

/** Takes only the requested items from what the partner sent; everything else stays as stored. */
export function mergeRequested(a: AssetPartnerApplicationDoc, incoming: PortalApplicationDto, keys: ChangeKey[]): PortalApplicationDto {
  const out = dtoFromApp(a);
  const has = (k: ChangeKey) => keys.includes(k);
  for (const k of keys.filter((x) => x.startsWith('photo:'))) {
    const label = k.slice(6);
    const next = photoOf(incoming.photos, label);
    out.photos = [...out.photos.filter((p) => p.label !== label), ...(next ? [next] : [])];
  }
  if (has('details')) out.vehicle = incoming.vehicle;
  if (has('ownership')) Object.assign(out, { ownership: incoming.ownership, lienholder: incoming.lienholder, titleStatus: incoming.titleStatus });
  if (has('condition')) Object.assign(out, { accident: incoming.accident, accidentDetail: incoming.accidentDetail });
  if (has('insurance')) out.insurance = incoming.insurance;
  if (has('availability')) Object.assign(out, { availability: incoming.availability, seasonMonths: incoming.seasonMonths });
  if (has('contact')) {
    Object.assign(out, {
      fullName: incoming.fullName, businessName: incoming.businessName, partnerType: incoming.partnerType, phone: incoming.phone,
      address: incoming.address, city: incoming.city, state: incoming.state, zip: incoming.zip,
    });
  }
  // A note to ops is always welcome on a resubmission.
  out.notes = incoming.notes ?? out.notes;
  return out;
}

/** Items that were asked for but not actually changed, by their plain names. */
export async function stillToChange(
  app: AssetPartnerApplicationDoc,
  after: Record<string, unknown>,
  keys: ChangeKey[],
): Promise<string[]> {
  const before = app.changeRequest?.before ?? {};
  const missing: string[] = [];
  for (const key of keys) {
    const was = before[key];
    if (key.startsWith('paper:')) {
      if ((await latestPaper(app.submittedByUserId, key)) === (was ?? null)) missing.push(CHANGE_ITEMS[key]);
      continue;
    }
    const now = after[key];
    if (key.startsWith('photo:')) {
      const w = was as { url?: string; key?: string; sha256?: string } | null;
      const n = now as { url?: string; key?: string; sha256?: string } | null;
      const same = !n || (w && (n.url === w.url || (!!n.key && n.key === w.key) || (!!n.sha256 && n.sha256 === w.sha256)));
      if (same) missing.push(CHANGE_ITEMS[key]);
      continue;
    }
    if (JSON.stringify(now) === JSON.stringify(was)) missing.push(CHANGE_ITEMS[key]);
  }
  return missing;
}

/** Two photo slots holding the same picture, named for the partner. */
export function reusedPhotos(photos: Photo[]): string | null {
  const seen = new Map<string, string>();
  for (const p of photos) {
    if (!p.sha256) continue;
    const other = seen.get(p.sha256);
    if (other) return `The ${other.toLowerCase()} and ${(p.label ?? 'another').toLowerCase()} photos are the same picture. Take a separate photo for each.`;
    seen.set(p.sha256, p.label ?? 'photo');
  }
  return null;
}
