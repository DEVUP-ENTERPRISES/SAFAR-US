import { VehicleModel, type VehicleDoc } from '../infrastructure/vehicle.model';
import { VehiclePauseModel, OPEN_PAUSE, type VehiclePauseDoc, type PauseStatus } from '../infrastructure/vehicle-pause.model';
import { availabilityService } from '../../availability/application/availability.service';
import { assetPartnerService } from '../../asset-partners/application/asset-partner.service';
import { AssetPartnerModel } from '../../asset-partners/infrastructure/asset-partner.model';
import { notificationService } from '../../notifications/application/notification.service';
import { notifyHouseFleet } from '../../notifications/application/notify-house-fleet';
import { vehicleService } from './vehicle.service';
import { localDateKey, zonedMidnight } from '../../../shared/utils/us-timezone';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

const MAX_DAYS = 366;
const SWEEP_BATCH = 200;

/** The calendar days from `from` up to, not including, `backOn`. */
export function pauseDays(from: string, backOn: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) < backOn && out.length <= MAX_DAYS; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

const carName = (v: Pick<VehicleDoc, 'year' | 'make' | 'model'>) => `${v.year} ${v.make} ${v.model}`;
const usDay = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const isDuplicate = (err: unknown) => (err as { code?: number })?.code === 11000;

export interface PauseListItem extends VehiclePauseDoc {
  vehicleLabel: string;
  plate?: string;
  partnerName?: string;
  /** Trips booked on the requested days; a request can't be approved until this is zero. */
  tripsInWindow: number;
}

export class VehiclePauseService {
  private async vehicle(vehicleId: string): Promise<VehicleDoc> {
    const v = await VehicleModel.findOne({ _id: vehicleId, deletedAt: null }).lean<VehicleDoc>();
    if (!v) throw new NotFoundError('Vehicle');
    return v;
  }

  private async create(doc: Omit<VehiclePauseDoc, '_id' | 'open' | 'createdAt' | 'updatedAt'>): Promise<VehiclePauseDoc> {
    try {
      return (await VehiclePauseModel.create({ ...doc, open: OPEN_PAUSE.includes(doc.status) })).toObject();
    } catch (err) {
      if (isDuplicate(err)) throw new ConflictError('This car already has a pause in place or waiting for review.', 'PAUSE_EXISTS');
      throw err;
    }
  }

  private async move(id: string, from: PauseStatus[], to: PauseStatus, set: Partial<VehiclePauseDoc> = {}): Promise<VehiclePauseDoc | null> {
    return VehiclePauseModel.findOneAndUpdate({ _id: id, status: { $in: from } }, { $set: { ...set, status: to, open: OPEN_PAUSE.includes(to) } }, { new: true }).lean<VehiclePauseDoc>();
  }

  /** The car's pause in place or waiting, else its latest decided one. */
  async latest(vehicleId: string): Promise<VehiclePauseDoc | null> {
    return (await VehiclePauseModel.findOne({ vehicleId, open: true }).lean<VehiclePauseDoc>()) ?? VehiclePauseModel.findOne({ vehicleId }).sort({ createdAt: -1 }).lean<VehiclePauseDoc>();
  }

  /** Validates a date range in the car's time zone and returns its days and instants. */
  private async window(vehicleId: string, fromDay: string, backOnDay: string) {
    const tz = await availabilityService.timeZoneOf(vehicleId);
    if (fromDay < localDateKey(new Date(), tz)) throw new ValidationError('The first day off can’t be in the past.');
    if (backOnDay <= fromDay) throw new ValidationError('The return date must be after the first day off.');
    const days = pauseDays(fromDay, backOnDay);
    if (days.length > MAX_DAYS) throw new ValidationError('A pause can be up to one year.');
    return { days, startsAt: zonedMidnight(fromDay, tz), endsAt: zonedMidnight(backOnDay, tz), tz };
  }

  // ── Operations team (the car's host account) ──

  /** Takes a listed car offline now; with a return date it comes back by itself. */
  async pauseNow(userId: string, vehicleId: string, input: { reason: string; backOnDay?: string }): Promise<VehiclePauseDoc> {
    await vehicleService.assertOwnerById(userId, vehicleId);
    const v = await this.vehicle(vehicleId);
    if (v.status !== 'listed') throw new ConflictError('Only a live car can be paused.', 'INVALID_STATE');
    const tz = await availabilityService.timeZoneOf(vehicleId);
    const today = localDateKey(new Date(), tz);
    const until = input.backOnDay ? await this.window(vehicleId, today, input.backOnDay) : undefined;
    const now = new Date();
    const pause = await this.create({
      vehicleId, assetPartnerId: v.assetPartnerId, source: 'ops', status: 'active', reason: input.reason, fromDay: today,
      backOnDay: input.backOnDay, startsAt: now, endsAt: until?.endsAt, requestedBy: userId, decidedBy: userId, decidedAt: now, startedAt: now,
    });
    const r = await VehicleModel.updateOne({ _id: vehicleId, status: 'listed' }, { $set: { status: 'paused', pauseId: pause._id } });
    if (!r.modifiedCount) {
      await this.move(pause._id, ['active'], 'cancelled', { endedAt: new Date() });
      throw new ConflictError('This car changed while you were pausing it. Refresh and try again.', 'INVALID_STATE');
    }
    logger.info({ vehicleId, pauseId: pause._id, backOnDay: input.backOnDay }, 'car paused by operations');
    if (v.assetPartnerId) void this.tellPartner(v, 'Your car is paused', `We paused your ${carName(v)}${input.backOnDay ? ` until ${usDay(input.backOnDay)}` : ''}. Reason: ${input.reason}`);
    return pause;
  }

  /** Brings a paused car back now, or calls off a pause that hasn't started. */
  async resume(userId: string, vehicleId: string): Promise<VehicleDoc> {
    await vehicleService.assertOwnerById(userId, vehicleId);
    const open = await VehiclePauseModel.findOne({ vehicleId, open: true, status: { $in: ['scheduled', 'active'] } }).lean<VehiclePauseDoc>();
    if (open) {
      const ended = await this.finish(open, userId);
      if (ended.endNote) throw new ConflictError(ended.endNote, 'HOLD');
      return this.vehicle(vehicleId);
    }
    return vehicleService.hostSetStatus(userId, vehicleId, { status: 'listed' });
  }

  // ── Asset Partner ──

  private async partnerCar(userId: string, vehicleId: string) {
    const partner = await assetPartnerService.getByUserId(userId);
    if (!partner) throw new ForbiddenError('Not an Asset Partner');
    const v = await VehicleModel.findOne({ _id: vehicleId, assetPartnerId: partner._id, deletedAt: null }).lean<VehicleDoc>();
    if (!v) throw new NotFoundError('Vehicle');
    return { partner, v };
  }

  async partnerLatest(userId: string, vehicleId: string): Promise<VehiclePauseDoc | null> {
    await this.partnerCar(userId, vehicleId);
    return this.latest(vehicleId);
  }

  /** A partner asks for their car to be off CatoDrive for some dates; the operations team reviews it. */
  async request(userId: string, vehicleId: string, input: { reason: string; fromDay: string; backOnDay: string }): Promise<VehiclePauseDoc> {
    const { partner, v } = await this.partnerCar(userId, vehicleId);
    if (!['listed', 'paused'].includes(v.status)) throw new ConflictError('This car isn’t live yet, so there’s nothing to pause.', 'INVALID_STATE');
    const w = await this.window(vehicleId, input.fromDay, input.backOnDay);
    const pause = await this.create({
      vehicleId, assetPartnerId: partner._id, source: 'partner', status: 'pending', reason: input.reason,
      fromDay: input.fromDay, backOnDay: input.backOnDay, startsAt: w.startsAt, endsAt: w.endsAt, requestedBy: userId,
    });
    logger.info({ vehicleId, pauseId: pause._id }, 'partner asked to pause a car');
    void notifyHouseFleet({
      templateKey: 'asset_partner.pause_request', path: '/ops/partners/pauses', data: { pauseId: pause._id, vehicleId },
      title: 'Partner asked to pause a car', body: `${partner.displayName}: ${carName(v)}, ${usDay(input.fromDay)} to ${usDay(input.backOnDay)}. ${input.reason}`,
    });
    return pause;
  }

  /** A partner withdraws a request, or calls off an approved pause before it starts. */
  async cancel(userId: string, pauseId: string): Promise<VehiclePauseDoc> {
    const partner = await assetPartnerService.getByUserId(userId);
    if (!partner) throw new ForbiddenError('Not an Asset Partner');
    const p = await VehiclePauseModel.findOne({ _id: pauseId, assetPartnerId: partner._id, source: 'partner' }).lean<VehiclePauseDoc>();
    if (!p) throw new NotFoundError('Pause request');
    const done = await this.move(pauseId, ['pending', 'scheduled'], 'cancelled', { endedAt: new Date(), endedBy: userId });
    if (!done) throw new ConflictError(p.status === 'active' ? 'This pause has started. Message us to bring the car back early.' : 'This request is already closed.', 'NOT_CANCELLABLE');
    if (p.status === 'scheduled') await availabilityService.unblockPause(pauseId);
    return done;
  }

  // ── Operations review ──

  async list(opts: { status?: 'pending' | 'open' | 'closed'; limit?: number; skip?: number }): Promise<{ items: PauseListItem[]; total: number }> {
    const filter =
      opts.status === 'pending' ? { status: 'pending' } : opts.status === 'closed' ? { open: false } : opts.status === 'open' ? { open: true } : {};
    const limit = Math.min(opts.limit ?? 20, 50);
    const [rows, total] = await Promise.all([
      VehiclePauseModel.find(filter).sort({ createdAt: -1 }).skip(opts.skip ?? 0).limit(limit).lean<VehiclePauseDoc[]>(),
      VehiclePauseModel.countDocuments(filter),
    ]);
    const [cars, partners] = await Promise.all([
      VehicleModel.find({ _id: { $in: [...new Set(rows.map((r) => r.vehicleId))] } }).select('_id year make model registrationNumber').lean<Pick<VehicleDoc, '_id' | 'year' | 'make' | 'model' | 'registrationNumber'>[]>(),
      AssetPartnerModel.find({ _id: { $in: [...new Set(rows.map((r) => r.assetPartnerId).filter(Boolean))] } }).select('_id displayName').lean<{ _id: string; displayName: string }[]>(),
    ]);
    const car = new Map(cars.map((c) => [c._id, c]));
    const owner = new Map(partners.map((p) => [p._id, p.displayName]));
    const items = await Promise.all(rows.map(async (r) => {
      const c = car.get(r.vehicleId);
      const trips = r.status === 'pending' && r.backOnDay ? (await availabilityService.bookingsOn(r.vehicleId, pauseDays(r.fromDay, r.backOnDay))).length : 0;
      return { ...r, vehicleLabel: c ? carName(c) : 'Car', plate: c?.registrationNumber, partnerName: r.assetPartnerId ? owner.get(r.assetPartnerId) : undefined, tripsInWindow: trips };
    }));
    return { items, total };
  }

  /** Approves a partner's request: its days are blocked at once so nobody books them, and the job takes it from there. */
  async approve(staffId: string, pauseId: string): Promise<VehiclePauseDoc> {
    const p = await VehiclePauseModel.findOne({ _id: pauseId, status: 'pending' }).lean<VehiclePauseDoc>();
    if (!p || !p.backOnDay) throw new ConflictError('This request is no longer waiting for review.', 'NOT_PENDING');
    const tz = await availabilityService.timeZoneOf(p.vehicleId);
    if (p.backOnDay <= localDateKey(new Date(), tz)) throw new ConflictError('These dates have passed. Decline it and ask the partner for new dates.', 'DATES_PASSED');
    const days = pauseDays(p.fromDay, p.backOnDay);
    const tripsIn = async () => (await availabilityService.bookingsOn(p.vehicleId, days)).length;
    const blocked = (n: number) => new ConflictError(`${n} trip${n === 1 ? ' is' : 's are'} booked on these dates. Move or cancel ${n === 1 ? 'it' : 'them'} first, or decline the request.`, 'PAUSE_TRIPS_BOOKED');
    const before = await tripsIn();
    if (before) throw blocked(before);
    await availabilityService.blockForPause(p.vehicleId, days, pauseId).catch((err) => { if (!isDuplicate(err)) throw err; });
    const after = await tripsIn();
    if (after) {
      await availabilityService.unblockPause(pauseId);
      throw blocked(after);
    }
    const done = await this.move(pauseId, ['pending'], 'scheduled', { decidedBy: staffId, decidedAt: new Date() });
    if (!done) {
      await availabilityService.unblockPause(pauseId);
      throw new ConflictError('This request is no longer waiting for review.', 'NOT_PENDING');
    }
    const v = await this.vehicle(p.vehicleId);
    void this.tellPartner(v, 'Pause approved', `Your ${carName(v)} is off CatoDrive from ${usDay(p.fromDay)} and back on ${usDay(p.backOnDay)}.`);
    if (done.startsAt <= new Date()) await this.start(done);
    return (await VehiclePauseModel.findById(pauseId).lean<VehiclePauseDoc>())!;
  }

  async decline(staffId: string, pauseId: string, reason: string): Promise<VehiclePauseDoc> {
    const done = await this.move(pauseId, ['pending'], 'declined', { decidedBy: staffId, decidedAt: new Date(), declineReason: reason });
    if (!done) throw new ConflictError('This request is no longer waiting for review.', 'NOT_PENDING');
    const v = await this.vehicle(done.vehicleId);
    void this.tellPartner(v, 'Pause request declined', `We can’t pause your ${carName(v)} for those dates. ${reason}`);
    return done;
  }

  // ── Starting and ending on schedule ──

  private async start(p: VehiclePauseDoc): Promise<void> {
    const moved = await this.move(p._id, ['scheduled'], 'active', { startedAt: new Date() });
    if (!moved) return;
    await VehicleModel.updateOne({ _id: p.vehicleId, status: 'listed' }, { $set: { status: 'paused', pauseId: p._id } });
  }

  /** Ends a pause: frees its days and puts the car back live unless a recall or document hold keeps it off. */
  private async finish(p: VehiclePauseDoc, by: string): Promise<VehiclePauseDoc> {
    if (p.status === 'scheduled') {
      await availabilityService.unblockPause(p._id);
      return (await this.move(p._id, ['scheduled'], 'cancelled', { endedAt: new Date(), endedBy: by })) ?? p;
    }
    await availabilityService.unblockPause(p._id);
    const back = await VehicleModel.updateOne(
      { _id: p.vehicleId, status: 'paused', pauseId: p._id, recallHold: { $ne: true }, complianceHold: { $ne: true }, verificationStatus: 'verified' },
      { $set: { status: 'listed' }, $unset: { pauseId: 1 } },
    );
    let endNote: string | undefined;
    if (!back.modifiedCount) {
      const v = await VehicleModel.findById(p.vehicleId).select('status pauseId recallHold complianceHold').lean<VehicleDoc>();
      await VehicleModel.updateOne({ _id: p.vehicleId, pauseId: p._id }, { $unset: { pauseId: 1 } });
      if (v?.status === 'paused') endNote = v.recallHold ? 'The pause ended, but the car stays off for an open safety recall.' : v.complianceHold ? 'The pause ended, but the car stays off until its insurance or registration is renewed.' : undefined;
    }
    const ended = (await this.move(p._id, ['active'], 'ended', { endedAt: new Date(), endedBy: by, ...(endNote ? { endNote } : {}) })) ?? p;
    logger.info({ vehicleId: p.vehicleId, pauseId: p._id, relisted: !!back.modifiedCount, by }, 'car pause ended');
    if (back.modifiedCount && p.assetPartnerId) {
      const v = await this.vehicle(p.vehicleId);
      void this.tellPartner(v, 'Your car is back on CatoDrive', `Your ${carName(v)} is live again and open for bookings.`);
    }
    if (endNote) void notifyHouseFleet({ templateKey: 'asset_partner.pause_hold', path: `/ops/listings/${p.vehicleId}`, title: 'A paused car could not go back live', body: endNote, data: { vehicleId: p.vehicleId } });
    return ended;
  }

  /** Runs every few minutes: starts pauses whose first day has come and ends those whose return date has. */
  async sweep(now = new Date()): Promise<{ started: number; ended: number }> {
    const [due, over] = await Promise.all([
      VehiclePauseModel.find({ status: 'scheduled', startsAt: { $lte: now } }).limit(SWEEP_BATCH).lean<VehiclePauseDoc[]>(),
      VehiclePauseModel.find({ status: 'active', endsAt: { $lte: now } }).limit(SWEEP_BATCH).lean<VehiclePauseDoc[]>(),
    ]);
    let started = 0;
    let ended = 0;
    for (const p of due) {
      try { await this.start(p); started += 1; } catch (err) { logger.warn({ err, pauseId: p._id }, 'pause start failed'); }
    }
    for (const p of over) {
      try { await this.finish(p, 'system'); ended += 1; } catch (err) { logger.warn({ err, pauseId: p._id }, 'pause end failed'); }
    }
    return { started, ended };
  }

  private async tellPartner(v: Pick<VehicleDoc, '_id' | 'assetPartnerId'>, title: string, body: string): Promise<void> {
    try {
      const partner = v.assetPartnerId ? await AssetPartnerModel.findById(v.assetPartnerId).select('userId').lean<{ userId: string }>() : null;
      if (!partner) return;
      await notificationService.send({ userId: partner.userId, priority: 'high', templateKey: 'asset_partner.pause', title, body, deepLink: `/vehicles/${v._id}`, data: { vehicleId: v._id } });
    } catch (err) {
      logger.warn({ err, vehicleId: v._id }, 'partner pause notice failed');
    }
  }
}

export const vehiclePauseService = new VehiclePauseService();
