import { TollAccountModel, TollTransactionModel, type TollAccountDoc, type TollAgency, type TollTransactionDoc } from '../infrastructure/toll.model';
import { credentialVault } from '../infrastructure/credential-vault';
import { parseNttaStatement, normalizePlate, type NttaToll } from '../domain/ntta-statement';
import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel, type BookingDoc } from '../../bookings/infrastructure/booking.model';
import { TripModel } from '../../trips/infrastructure/trip.model';
import { incidentalsService } from '../../bookings/application/incidentals.service';
import { notificationService } from '../../notifications/application/notification.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { PaymentModel } from '../../payments/infrastructure/payment.model';
import { TOLL_PASS } from '../../vehicles/application/vehicle.service';
import { logger } from '../../../infrastructure/logging/logger';

const MIN = 60_000;
const DAY = 86_400_000;
// Bookings a toll can belong to: the car was, or was about to be, with the guest.
const LIVE = ['paid', 'confirmed', 'in_progress', 'completed', 'disputed'];

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const when = (d: Date) => d.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** An account as the admin screen sees it: never the login, only whether one is saved. */
export type TollAccountView = Omit<TollAccountDoc, 'credentials'> & { hasLogin: boolean; loginSavedAt?: Date };

const view = (a: TollAccountDoc): TollAccountView => {
  const { credentials, ...rest } = a;
  return { ...rest, hasLogin: !!credentials, loginSavedAt: credentials?.savedAt };
};

export interface ImportSummary {
  read: number;
  added: number;
  duplicates: number;
  matched: number;
  noTrip: number;
  unknownCar: number;
  skipped: number;
  errors: { line: number; reason: string }[];
}

export const tollService = {
  // ── Accounts ───────────────────────────────────────────────────────────

  async accounts(): Promise<TollAccountView[]> {
    return (await TollAccountModel.find().sort({ createdAt: 1 }).lean<TollAccountDoc[]>()).map(view);
  },

  async createAccount(input: { agency: TollAgency; nickname: string; hostId?: string }): Promise<TollAccountView> {
    const doc = await TollAccountModel.create({ agency: input.agency, nickname: input.nickname.trim(), hostId: input.hostId });
    return view(doc.toObject());
  },

  async updateAccount(id: string, patch: { nickname?: string; vehicleIds?: string[] }): Promise<TollAccountView> {
    const set: Record<string, unknown> = {};
    if (patch.nickname?.trim()) set.nickname = patch.nickname.trim();
    if (patch.vehicleIds) set.vehicleIds = [...new Set(patch.vehicleIds)];
    const doc = await TollAccountModel.findByIdAndUpdate(id, { $set: set }, { new: true }).lean<TollAccountDoc>();
    if (!doc) throw new NotFoundError('Toll account');
    return view(doc);
  },

  /** Save the agency login, sealed; it is never returned. Replacing it resets the status until the next fetch. */
  async saveLogin(id: string, username: string, password: string, staffId: string): Promise<TollAccountView> {
    if (!username.trim() || !password) throw new ValidationError('Enter the account number or username and the password');
    const credentials = { username: credentialVault.seal(username.trim()), password: credentialVault.seal(password), savedAt: new Date(), savedBy: staffId };
    const doc = await TollAccountModel.findByIdAndUpdate(id, { $set: { credentials, status: 'manual' }, $unset: { lastError: 1 } }, { new: true }).lean<TollAccountDoc>();
    if (!doc) throw new NotFoundError('Toll account');
    logger.info({ accountId: id, by: staffId }, 'toll account login saved');
    return view(doc);
  },

  async removeLogin(id: string): Promise<TollAccountView> {
    const doc = await TollAccountModel.findByIdAndUpdate(id, { $unset: { credentials: 1 }, $set: { status: 'manual' } }, { new: true }).lean<TollAccountDoc>();
    if (!doc) throw new NotFoundError('Toll account');
    return view(doc);
  },

  async setVehicleTag(vehicleId: string, tagId: string | null): Promise<void> {
    const res = await VehicleModel.updateOne({ _id: vehicleId }, tagId?.trim() ? { $set: { tollTagId: tagId.trim().toUpperCase() } } : { $unset: { tollTagId: 1 } });
    if (!res.matchedCount) throw new NotFoundError('Vehicle');
  },

  // ── Import & match ─────────────────────────────────────────────────────

  /** Read an NTTA statement, store each new toll once, and match it to the trip it happened on. */
  async importNtta(text: string, staffId: string, accountId?: string): Promise<ImportSummary> {
    const parsed = parseNttaStatement(text);
    const out: ImportSummary = { read: parsed.tolls.length, added: 0, duplicates: 0, matched: 0, noTrip: 0, unknownCar: 0, skipped: parsed.skipped, errors: parsed.errors };
    if (!parsed.tolls.length) return out;

    const known = new Set(
      (await TollTransactionModel.find({ agency: 'ntta', externalId: { $in: parsed.tolls.map((t) => t.externalId) } }).select('externalId').lean<{ externalId: string }[]>()).map((t) => t.externalId),
    );
    const finder = await this.vehicleFinder();
    const buffer = (await platformConfigService.get()).tolls.matchBufferMinutes * MIN;

    for (const t of parsed.tolls) {
      if (known.has(t.externalId)) { out.duplicates++; continue; }
      known.add(t.externalId);
      const placed = await this.place(t, finder, buffer);
      // Two imports at once can race on the same toll; the unique index keeps one.
      const created = await TollTransactionModel.create({ agency: 'ntta', accountId, ...t, ...placed, importedBy: staffId }).catch((err: { code?: number }) => {
        if (err.code === 11000) return null;
        throw err;
      });
      if (!created) { out.duplicates++; continue; }
      out.added++;
      if (placed.status === 'matched') out.matched++;
      else if (placed.status === 'no_trip') out.noTrip++;
      else out.unknownCar++;
    }
    if (accountId) await TollAccountModel.updateOne({ _id: accountId }, { $set: { lastImportAt: new Date() } });
    logger.info({ ...out, errors: out.errors.length }, 'NTTA statement imported');
    return out;
  },

  /** Cars by TollTag and by plate, read once per import. */
  async vehicleFinder() {
    const cars = await VehicleModel.find({ deletedAt: null, $or: [{ tollTagId: { $exists: true } }, { registrationNumber: { $exists: true } }] })
      .select('tollTagId registrationNumber')
      .lean<Pick<VehicleDoc, '_id' | 'tollTagId' | 'registrationNumber'>[]>();
    const byTag = new Map<string, string>();
    const byPlate = new Map<string, string>();
    for (const c of cars) {
      if (c.tollTagId) byTag.set(c.tollTagId.toUpperCase(), c._id);
      if (c.registrationNumber) byPlate.set(normalizePlate(c.registrationNumber), c._id);
    }
    return (t: Pick<NttaToll, 'tagId' | 'plate'>) => (t.tagId && byTag.get(t.tagId.toUpperCase())) || (t.plate && byPlate.get(t.plate)) || undefined;
  },

  /** Which car and which trip a toll belongs to. A toll outside every trip is the fleet's own. */
  async place(t: Pick<NttaToll, 'tagId' | 'plate' | 'occurredAt'>, findCar: (t: Pick<NttaToll, 'tagId' | 'plate'>) => string | undefined, buffer: number) {
    const vehicleId = findCar(t);
    if (!vehicleId) return { status: 'unknown_car' as const };
    const at = t.occurredAt.getTime();
    const trip = await TripModel.findOne({
      vehicleId,
      'handover.at': { $lte: new Date(at + buffer) },
      $or: [{ 'return.at': { $gte: new Date(at - buffer) } }, { 'return.at': { $exists: false } }],
    })
      .sort({ 'handover.at': -1 })
      .select('bookingId')
      .lean<{ bookingId: string }>();
    const bookingId =
      trip?.bookingId ??
      (await BookingModel.findOne({
        vehicleId,
        status: { $in: LIVE },
        'period.start': { $lte: new Date(at + buffer) },
        'period.end': { $gte: new Date(at - buffer) },
      })
        .select('_id')
        .lean<{ _id: string }>())?._id;
    return bookingId ? { status: 'matched' as const, vehicleId, bookingId } : { status: 'no_trip' as const, vehicleId };
  },

  /** Staff point an unknown toll at a car, and it is matched again. */
  async assign(transactionId: string, vehicleId: string): Promise<TollTransactionDoc> {
    const t = await TollTransactionModel.findById(transactionId).lean<TollTransactionDoc>();
    if (!t) throw new NotFoundError('Toll');
    if (t.status === 'billed') throw new ValidationError('This toll is already billed');
    const buffer = (await platformConfigService.get()).tolls.matchBufferMinutes * MIN;
    const placed = await this.place(t, () => vehicleId, buffer);
    return (await TollTransactionModel.findByIdAndUpdate(transactionId, { $set: { ...placed }, $unset: placed.status === 'matched' ? {} : { bookingId: 1 } }, { new: true }).lean<TollTransactionDoc>())!;
  },

  async waive(transactionId: string, note: string): Promise<TollTransactionDoc> {
    const t = await TollTransactionModel.findOneAndUpdate({ _id: transactionId, status: { $ne: 'billed' } }, { $set: { status: 'waived', note } }, { new: true }).lean<TollTransactionDoc>();
    if (!t) throw new ValidationError('This toll is already billed or does not exist');
    return t;
  },

  async list(filter: { status?: string; bookingId?: string }): Promise<TollTransactionDoc[]> {
    return TollTransactionModel.find({ ...(filter.status ? { status: filter.status } : {}), ...(filter.bookingId ? { bookingId: filter.bookingId } : {}) })
      .sort({ occurredAt: -1 })
      .limit(500)
      .lean<TollTransactionDoc[]>();
  },

  // ── Billing ────────────────────────────────────────────────────────────

  /**
   * Charge the guest for a trip's matched tolls in one line (plus the flat fee once per trip), through the
   * same post-trip charge path as fuel or late return: card first, then deposit, credited to the host.
   */
  /**
   * Settle a finished trip's matched tolls. With a toll pass, each Texas calendar day is covered up to the
   * pass's daily amount and only the excess is charged; without one, every toll is charged. Charges go through
   * the post-trip charge path in one line; preferDeposit takes it from the deposit hold first (it is about
   * to be released), so the guest's money is already set aside and nothing can decline.
   */
  async bill(bookingId: string, opts: { preferDeposit?: boolean } = {}): Promise<{ billed: number; covered: number; totalCents: number; collected: boolean } | null> {
    const cfg = (await platformConfigService.get()).tolls;
    const booking = await BookingModel.findById(bookingId).select('status period guestId code priceBreakdown').lean<BookingDoc>();
    if (!booking || booking.status !== 'completed') return null;
    const tolls = await TollTransactionModel.find({ bookingId, status: 'matched' }).sort({ occurredAt: 1 }).lean<TollTransactionDoc[]>();
    if (!tolls.length) return null;

    if (Date.now() > +new Date(booking.period.end) + cfg.billingWindowDays * DAY) {
      await TollTransactionModel.updateMany({ _id: { $in: tolls.map((t) => t._id) } }, { $set: { status: 'too_late' } });
      return null;
    }

    const hasPass = (booking.priceBreakdown?.selectedAddOns ?? []).some((a) => a.code === TOLL_PASS);
    const { covered, billable, excessCents } = hasPass ? await this.applyPass(bookingId, tolls, cfg.passDailyCapCents) : { covered: [], billable: tolls, excessCents: null };

    if (covered.length) {
      await TollTransactionModel.updateMany({ _id: { $in: covered.map((t) => t._id) } }, { $set: { status: 'covered', note: 'Covered by the toll pass' } });
    }
    if (!billable.length) {
      await this.tellGuest(booking, { covered, billable: [], fee: 0, total: 0, collected: true });
      return { billed: 0, covered: covered.length, totalCents: 0, collected: true };
    }

    const sum = excessCents ?? billable.reduce((s, t) => s + t.amountCents, 0);
    const feeAlready = await TollTransactionModel.exists({ bookingId, status: 'billed' });
    // Pass holders already paid for tolls, so no processing fee on top.
    const fee = !hasPass && cfg.feeCents > 0 && !feeAlready ? cfg.feeCents : 0;
    const label = hasPass
      ? `Tolls above your toll pass (${usd(cfg.passDailyCapCents)} a day)`
      : `${billable.length} toll${billable.length === 1 ? '' : 's'} (NTTA) during your trip`;
    // One line when taking from the deposit: a hold can be captured only once.
    const items = opts.preferDeposit || !fee
      ? [{ type: 'toll' as const, amount: sum + fee, note: fee ? `${label}, incl. ${usd(fee)} processing fee` : label }]
      : [{ type: 'toll' as const, amount: sum, note: label }, { type: 'other' as const, amount: fee, note: 'Toll processing fee' }];
    const result = await incidentalsService.charge(bookingId, items, 'system', { notify: false, preferDeposit: opts.preferDeposit });
    const tollLine = result.items.find((i) => i.type === 'toll');
    await TollTransactionModel.updateMany(
      { _id: { $in: billable.map((t) => t._id) } },
      { $set: { status: 'billed', billedAt: new Date(), incidentalId: tollLine?.id } },
    );
    const collected = result.items.every((i) => i.collected);
    await this.tellGuest(booking, { covered, billable, fee, total: result.total, collected });
    return { billed: billable.length, covered: covered.length, totalCents: result.total, collected };
  },

  /** Split a pass holder's tolls into those the pass covers and the days that went over its daily amount. */
  async applyPass(bookingId: string, tolls: TollTransactionDoc[], capCents: number) {
    // Days already settled count toward that day's allowance, so a late toll can't reuse it.
    const earlier = await TollTransactionModel.find({ bookingId, status: { $in: ['covered', 'billed'] } }).select('occurredAt amountCents').lean<TollTransactionDoc[]>();
    const day = (d: Date) => d.toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
    const used = new Map<string, number>();
    for (const t of earlier) used.set(day(t.occurredAt), (used.get(day(t.occurredAt)) ?? 0) + t.amountCents);
    const covered: TollTransactionDoc[] = [];
    const billable: TollTransactionDoc[] = [];
    let excessCents = 0;
    for (const t of tolls) {
      const d = day(t.occurredAt);
      const before = used.get(d) ?? 0;
      const room = Math.max(0, capCents - before);
      used.set(d, before + t.amountCents);
      if (t.amountCents <= room) covered.push(t);
      else { billable.push(t); excessCents += t.amountCents - room; }
    }
    return { covered, billable, excessCents };
  },

  /** One message listing every toll on the trip: covered, charged, and how. */
  async tellGuest(
    booking: Pick<BookingDoc, '_id' | 'guestId'>,
    r: { covered: TollTransactionDoc[]; billable: TollTransactionDoc[]; fee: number; total: number; collected: boolean },
  ): Promise<void> {
    const line = (t: TollTransactionDoc, tail: string) => ({ label: when(t.occurredAt), value: `${t.location.split(' - ').slice(0, 2).join(' · ')} · ${usd(t.amountCents)}${tail}` });
    const charged = r.total > 0;
    await notificationService
      .send({
        userId: booking.guestId,
        priority: charged ? 'high' : 'normal',
        templateKey: charged ? 'booking.tolls_charged' : 'booking.tolls_covered',
        title: !charged ? 'Your toll pass covered your tolls' : r.collected ? `Tolls from your trip: ${usd(r.total)}` : 'Tolls from your trip need a card',
        body: !charged
          ? `${r.covered.length} toll${r.covered.length === 1 ? '' : 's'} on your trip ${r.covered.length === 1 ? 'was' : 'were'} covered by your toll pass. Nothing more to pay.`
          : (r.collected ? `We charged ${usd(r.total)} for tolls on your trip.` : 'We could not take payment for tolls on your trip; please update your card.') +
            (r.covered.length ? ` Your toll pass covered ${r.covered.length} more.` : '') +
            ' If a toll isn’t yours, dispute it from your booking.',
        deepLink: `/bookings/${booking._id}`,
        actionLabel: 'View booking',
        data: { bookingId: booking._id },
        facts: [
          ...r.covered.map((t) => line(t, ' · covered')),
          ...r.billable.map((t) => line(t, '')),
          ...(r.fee ? [{ label: 'Processing fee', value: usd(r.fee) }] : []),
          ...(charged ? [{ label: 'Charged', value: usd(r.total) }] : []),
        ],
      })
      .catch((err) => logger.warn({ err, bookingId: booking._id }, 'toll notice failed'));
  },

  /**
   * Bill finished trips whose tolls are due. A trip whose deposit is still held is left for the deposit release,
   * which takes the tolls from it first; once the deposit is gone, later tolls go to the card.
   */
  async billDue(): Promise<{ trips: number; tolls: number }> {
    const cfg = (await platformConfigService.get()).tolls;
    if (!cfg.enabled || !cfg.autoCharge) return { trips: 0, tolls: 0 };
    const bookingIds = await TollTransactionModel.distinct('bookingId', { status: 'matched' });
    let trips = 0;
    let tolls = 0;
    for (const id of bookingIds) {
      const b = await BookingModel.findById(id).select('status period').lean<Pick<BookingDoc, 'status' | 'period'>>();
      if (!b || b.status !== 'completed' || Date.now() < +new Date(b.period.end) + cfg.reviewHours * 3_600_000) continue;
      if (await PaymentModel.exists({ bookingId: id, type: 'deposit', status: 'authorized', deletedAt: null })) continue;
      const r = await this.bill(id).catch((err) => { logger.warn({ err, bookingId: id }, 'toll billing failed'); return null; });
      if (r) { trips++; tolls += r.billed + r.covered; }
    }
    return { trips, tolls };
  },
};
