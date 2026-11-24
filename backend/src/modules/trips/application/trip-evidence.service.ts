import { createHash } from 'crypto';
import sharp from 'sharp';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { BookingModel, type BookingDoc } from '../../bookings/infrastructure/booking.model';
import { TripModel, PrePhotoModel, type TripDoc, type TripPhoto } from '../infrastructure/trip.model';
import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { PaymentModel } from '../../payments/infrastructure/payment.model';
import { ClaimModel } from '../../claims/infrastructure/claim.model';
import { INSPECTION_ANGLES } from './inspection.service';
import { storageGateway } from '../../../infrastructure/storage/storage.provider';
import { NotFoundError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

const MAX_PHOTOS = 80;
const W = 612;
const H = 792;
const M = 48;

const when = (d?: Date | string | null) => (d ? new Date(d).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }) + ' CT' : '-');
const usd = (cents?: number) => (cents == null ? '-' : `$${(cents / 100).toFixed(2)}`);
const angleLabel = (id?: string) => INSPECTION_ANGLES.find((a) => a.id === id)?.label ?? id ?? '-';

// pdf-lib's standard fonts only draw Latin-1; anything else is swapped for a plain character.
const clean = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[·•]/g, '|').replace(/±/g, '+/-').replace(/[^\x20-\xFF]/g, '?');

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont, private stamp: string) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([W, H]);
    this.y = H - M;
    this.page.drawText(clean(this.stamp), { x: M, y: 24, size: 7, font: this.font, color: rgb(0.45, 0.45, 0.45) });
  }
  ensure(h: number) {
    if (this.y - h < M) this.newPage();
  }
  heading(text: string) {
    this.ensure(30);
    this.y -= 8;
    this.page.drawText(clean(text), { x: M, y: this.y, size: 13, font: this.bold });
    this.y -= 18;
  }
  line(text: string, size = 9.5, f?: PDFFont) {
    const font = f ?? this.font;
    const max = W - M * 2;
    const words = clean(text).split(' ');
    let cur = '';
    const flush = () => {
      this.ensure(size + 4);
      this.page.drawText(cur, { x: M, y: this.y, size, font });
      this.y -= size + 4;
      cur = '';
    };
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > max && cur) flush();
      cur = cur ? `${cur} ${w}` : w;
    }
    if (cur) flush();
  }
  pair(label: string, value: string) {
    this.line(`${label}: ${value}`);
  }
}

async function photoBytes(p: TripPhoto): Promise<Buffer | null> {
  try {
    const src = p.key ? await storageGateway.createDownloadUrl(p.key) : p.url;
    const res = await fetch(src, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const raw = Buffer.from(await res.arrayBuffer());
    return await sharp(raw).rotate().resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  } catch {
    return null;
  }
}

// One PDF holding everything an insurer or adjuster needs for one booking: who, what car, every timestamp and reading, and the photos.
export const tripEvidenceService = {
  async build(bookingId: string, requestedBy: string): Promise<{ pdf: Buffer; filename: string; sha256: string }> {
    const booking = await BookingModel.findById(bookingId).lean<BookingDoc>();
    if (!booking) throw new NotFoundError('Booking');
    const [trip, prePhotos, vehicle, guest, kyc, deposit, claims] = await Promise.all([
      TripModel.findOne({ bookingId }).lean<TripDoc>(),
      PrePhotoModel.find({ bookingId, movedToTripId: { $exists: false } }).lean<TripPhoto[]>(),
      VehicleModel.findById(booking.vehicleId).lean<VehicleDoc>(),
      UserModel.findById(booking.guestId).select('firstName lastName email phone dateOfBirth').lean<{ firstName?: string; lastName?: string; email: string; phone?: string; dateOfBirth?: Date }>(),
      KycModel.findOne({ userId: booking.guestId }).sort({ createdAt: -1 }).lean<{ status: string; decisionAt?: Date; licenceExpiry?: Date; verifiedDob?: Date; provider?: string }>(),
      PaymentModel.findOne({ bookingId, type: 'deposit' }).sort({ createdAt: -1 }).lean<{ status: string; amount: number; releasedReason?: string }>(),
      ClaimModel.find({ bookingId }).select('type status amountClaimed amountApproved createdAt').lean<{ type: string; status: string; amountClaimed?: number; amountApproved?: number; createdAt: Date }[]>(),
    ]);
    const photos = [...(trip?.photos ?? []), ...prePhotos].sort((a, b) => +new Date(a.at) - +new Date(b.at));

    const ids = new Set<string>([booking.guestId, ...photos.map((p) => p.byUserId), ...(booking.statusHistory ?? []).map((h) => h.by), trip?.returnConfirmedBy, booking.pickupVerifiedBy, booking.depositWaiver?.by].filter((x): x is string => !!x && x !== 'system'));
    const people = await UserModel.find({ _id: { $in: [...ids] } }).select('firstName lastName email').lean<{ _id: string; firstName?: string; lastName?: string; email: string }[]>();
    const name = (id?: string) => {
      if (!id) return '-';
      if (id === 'system') return 'System';
      if (id === booking.guestId) return 'Guest';
      const u = people.find((x) => x._id === id);
      return u ? `${[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email} (staff/host)` : 'Staff/host';
    };

    const doc = await PDFDocument.create();
    doc.setTitle(`Trip evidence ${booking.code}`);
    doc.setProducer('CatoDrive');
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const generated = new Date();
    const w = new Writer(doc, font, bold, `CatoDrive trip evidence | ${booking.code} | generated ${when(generated)} | confidential`);

    w.line('Trip evidence file', 18, bold);
    w.line(`Booking ${booking.code}. Every time below is recorded by the server, in Central Time. Photos are taken live in the app, stamped with time and GPS at capture, and stored with a SHA-256 fingerprint; they cannot be edited or deleted after upload.`);

    w.heading('Booking');
    w.pair('Status', booking.status);
    w.pair('Booked dates', `${when(booking.period.start)} to ${when(booking.period.end)}`);
    w.pair('Created', when((booking as { createdAt?: Date }).createdAt));
    w.pair('Total charged', usd(booking.priceBreakdown?.total?.amount));
    w.pair('Instant book', booking.instantBook ? 'yes' : 'no');
    if (booking.depositWaiver) w.pair('Deposit', `waived by ${name(booking.depositWaiver.by)} on ${when(booking.depositWaiver.at)}: ${booking.depositWaiver.reason}`);
    else w.pair('Deposit', deposit ? `${usd(deposit.amount)} - ${deposit.status}${deposit.releasedReason ? ` (${deposit.releasedReason})` : ''}` : 'none recorded');

    w.heading('Vehicle');
    w.pair('Car', vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : '-');
    w.pair('Plate', vehicle?.registrationNumber ?? '-');
    w.pair('VIN', vehicle?.vin ?? '-');

    w.heading('Driver');
    w.pair('Name', guest ? [guest.firstName, guest.lastName].filter(Boolean).join(' ') || '-' : '-');
    w.pair('Email', guest?.email ?? '-');
    w.pair('Phone', guest?.phone ? `ending ${guest.phone.slice(-4)}` : '-');
    w.pair('Identity check', kyc ? `${kyc.status}${kyc.decisionAt ? ` on ${when(kyc.decisionAt)}` : ''} (document + live selfie)` : 'none');
    w.pair("Driver's licence valid until", kyc?.licenceExpiry ? new Date(kyc.licenceExpiry).toLocaleDateString('en-US') : '-');
    const dob = kyc?.verifiedDob ?? guest?.dateOfBirth;
    if (dob) w.pair('Age at pickup', String(Math.floor((+new Date(booking.period.start) - +new Date(dob)) / (365.25 * 86_400_000))));
    if (booking.additionalDrivers?.length) w.pair('Approved extra drivers', booking.additionalDrivers.map((d) => d.name).join(', '));

    w.heading('Pickup (check-in)');
    w.pair('Pickup code verified', booking.pickupVerifiedAt ? `${when(booking.pickupVerifiedAt)} by ${name(booking.pickupVerifiedBy)}` : 'no');
    if (booking.identityCheck) w.pair('Face check at handover', `${booking.identityCheck.result} on ${when(booking.identityCheck.at)}`);
    w.pair('Trip started', trip ? when(trip.handover.at) : 'not started');
    w.pair('Odometer / fuel at start', trip ? `${trip.handover.odometerStart ?? '-'} mi / ${trip.handover.fuelStart ?? '-'}%` : '-');
    if (trip?.licenseCheck) w.pair('Licence checked at handover', `${trip.licenseCheck.verifiedName ?? ''} valid until ${trip.licenseCheck.licenceExpiry ? new Date(trip.licenseCheck.licenceExpiry).toLocaleDateString('en-US') : '-'}`);

    w.heading('Changes to the trip');
    if (booking.extensions?.length) {
      for (const e of booking.extensions as { prevEnd?: Date; newEnd?: Date; days?: number; total?: { amount: number } }[]) w.line(`Extension: ${when(e.prevEnd)} -> ${when(e.newEnd)} (${e.days ?? '?'} day(s), ${usd(e.total?.amount)})`);
    } else w.line('No extensions.');

    w.heading('Return (check-out)');
    w.pair('Returned', trip?.return ? when(trip.return.at) : 'not returned');
    if (trip?.return?.arrivedAt) w.pair('Arrival recorded', `${when(trip.return.arrivedAt)} (${trip.return.arrivedBasis?.replace('_', ' ')})`);
    w.pair('Odometer / fuel at return', trip?.return ? `${trip.return.odometerEnd ?? '-'} mi / ${trip.return.fuelEnd ?? '-'}%` : '-');
    w.pair('Distance', trip ? `${Math.round(trip.distanceKm * 0.621371)} mi` : '-');
    w.pair('Return confirmed by staff', trip?.returnConfirmed ? `${when(trip.returnConfirmedAt)} by ${name(trip.returnConfirmedBy)}` : 'no');

    w.heading('Incidents, charges and claims');
    const incidents = trip?.incidents ?? [];
    const damage = trip?.damageReports ?? [];
    if (!incidents.length && !damage.length && !trip?.sosEvents?.length && !booking.incidentals?.length && !claims.length) w.line('None recorded.');
    for (const i of incidents) w.line(`Incident (${i.type}, ${i.status}) ${when(i.at)} by ${name(i.byUserId)}: ${i.note ?? ''}`);
    for (const d of damage) w.line(`Damage report ${when(d.at)} by ${name(d.byUserId)}: ${d.description} (${d.photos.length} photo(s))`);
    for (const s of trip?.sosEvents ?? []) w.line(`SOS pressed ${when(s.at)} by ${name(s.byUserId)}`);
    for (const c of booking.incidentals ?? []) w.line(`Charge: ${c.type} ${usd(c.amount)}${c.note ? ` - ${c.note}` : ''}`);
    for (const c of claims) w.line(`Claim (${c.type}) opened ${when(c.createdAt)}: ${c.status}, claimed ${usd(c.amountClaimed)}, approved ${usd(c.amountApproved)}`);

    w.heading('Status history');
    for (const h of booking.statusHistory ?? []) w.line(`${when(h.at)}  ${h.from ?? 'new'} -> ${h.to}  by ${name(h.by)}${h.reason ? `  (${h.reason})` : ''}`, 8.5);

    w.heading(`Photo log (${photos.length})`);
    for (const p of photos) {
      const loc = p.lat != null && p.lng != null ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)} (+/-${Math.round(p.accuracyM ?? 0)} m)` : 'no location';
      w.line(`${p.phase === 'pre' ? 'Pickup' : 'Return'} | ${angleLabel(p.angle)} | ${name(p.byUserId)} | ${when(p.at)} | ${loc} | sha256 ${p.sha256 ? p.sha256.slice(0, 16) + '...' : '-'}`, 7.5);
    }

    const shown = photos.slice(0, MAX_PHOTOS);
    let col = 0;
    let row = 0;
    const cellW = (W - M * 2 - 16) / 2;
    const cellH = 300;
    let page: PDFPage | null = null;
    for (const p of shown) {
      const bytes = await photoBytes(p);
      if (!bytes) continue;
      if (!page || row === 2) {
        page = doc.addPage([W, H]);
        page.drawText(clean(`CatoDrive trip evidence | ${booking.code} | photos`), { x: M, y: 24, size: 7, font, color: rgb(0.45, 0.45, 0.45) });
        row = 0;
        col = 0;
      }
      const img = await doc.embedJpg(bytes);
      const scale = Math.min(cellW / img.width, (cellH - 30) / img.height);
      const x = M + col * (cellW + 16);
      const top = H - M - row * (cellH + 10);
      page.drawImage(img, { x, y: top - img.height * scale, width: img.width * scale, height: img.height * scale });
      page.drawText(clean(`${p.phase === 'pre' ? 'Pickup' : 'Return'} | ${angleLabel(p.angle)} | ${name(p.byUserId)}`), { x, y: top - img.height * scale - 11, size: 7.5, font: bold });
      page.drawText(clean(`${when(p.at)}${p.lat != null ? ` | ${p.lat.toFixed(5)}, ${p.lng!.toFixed(5)}` : ' | no location'}`), { x, y: top - img.height * scale - 21, size: 7, font });
      col += 1;
      if (col === 2) {
        col = 0;
        row += 1;
      }
    }
    if (photos.length > MAX_PHOTOS) w.line(`Only the first ${MAX_PHOTOS} photos are printed; the photo log lists all ${photos.length}.`);

    const pdf = Buffer.from(await doc.save());
    const sha256 = createHash('sha256').update(pdf).digest('hex');
    logger.info({ bookingId, requestedBy, photos: photos.length, bytes: pdf.length }, 'trip evidence file built');
    return { pdf, filename: `catodrive-trip-evidence-${booking.code}.pdf`, sha256 };
  },
};
