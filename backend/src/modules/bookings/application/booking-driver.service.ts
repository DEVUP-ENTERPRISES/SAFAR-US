import { createHash, randomBytes } from 'node:crypto';
import { BookingDriverModel, type BookingDriverDoc, type DriverStatus } from '../infrastructure/booking-driver.model';
import { BookingModel, type BookingDoc } from '../infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { eligibilityService, BLOCKER_COPY, type EligibilityBlocker } from './eligibility.service';
import { wheelbaseInsuranceService } from '../../insurance/application/wheelbase-insurance.service';
import { paymentService } from '../../payments/application/payment.service';
import { notificationService } from '../../notifications/application/notification.service';
import { channelProviders } from '../../notifications/infrastructure/channel.providers';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';
import { config } from '../../../config';
import { availabilityService } from '../../availability/application/availability.service';

const ADDABLE = ['pending_verification', 'pending_payment', 'pending_approval', 'confirmed', 'paid'];
const FINAL_BLOCKERS: EligibilityBlocker[] = ['account_suspended', 'under_review', 'restricted', 'identity_rejected', 'licence_expired'];
const MAX_ATTEMPTS = 2;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const chargeKey = (driverId: string) => `driver_${driverId}`;
const isDuplicate = (err: unknown) => (err as { code?: number })?.code === 11000;
const usd = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
const day = (d: Date, timeZone: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });

export type PublicDriver = Omit<BookingDriverDoc, 'tokenHash'>;
const toPublic = ({ tokenHash: _t, ...d }: BookingDriverDoc): PublicDriver => d;

export interface DriverInvitePreview {
  status: DriverStatus;
  name: string;
  guestFirstName: string;
  car: string;
  start: Date;
  end: Date;
  /** Steps the driver still has to finish, in plain words. */
  needs: string[];
  declineReasons?: string[];
  canRetry: boolean;
  /** Whether the signed-in account is the one this invite belongs to. */
  yours?: boolean;
}

export class BookingDriverService {
  private async settings() {
    const b = (await platformConfigService.get()).booking;
    return { enabled: b.additionalDriversEnabled === true, feeCents: b.additionalDriverFeeCents ?? 1500, max: b.maxAdditionalDrivers ?? 2, deadlineHours: b.additionalDriverDeadlineHours ?? 24 };
  }

  private async ownBooking(guestId: string, bookingId: string): Promise<BookingDoc> {
    const b = await BookingModel.findById(bookingId).lean<BookingDoc>();
    if (!b) throw new NotFoundError('Booking');
    if (b.guestId !== guestId) throw new ForbiddenError('Only the guest who booked can manage drivers.');
    return b;
  }

  private addBy(b: Pick<BookingDoc, 'period'>, deadlineHours: number): Date {
    return new Date(new Date(b.period.start).getTime() - deadlineHours * 3_600_000);
  }

  /** The trip's extra drivers, with what the guest can do next. */
  async list(guestId: string, bookingId: string) {
    const b = await this.ownBooking(guestId, bookingId);
    const s = await this.settings();
    const drivers = await BookingDriverModel.find({ bookingId }).sort({ createdAt: 1 }).lean<BookingDriverDoc[]>();
    const addBy = this.addBy(b, s.deadlineHours);
    const activeCount = drivers.filter((d) => d.active).length;
    return {
      enabled: s.enabled,
      feeCents: s.feeCents,
      currency: b.priceBreakdown?.currency ?? 'USD',
      addBy,
      canAdd: s.enabled && ADDABLE.includes(b.status) && Date.now() <= addBy.getTime() && activeCount < s.max,
      drivers: drivers.filter((d) => d.status !== 'removed').map(toPublic),
    };
  }

  async invite(guestId: string, bookingId: string, input: { name: string; email: string; phone?: string }): Promise<PublicDriver> {
    const s = await this.settings();
    if (!s.enabled) throw new ConflictError('Extra drivers aren’t available right now.', 'DRIVERS_OFF');
    const b = await this.ownBooking(guestId, bookingId);
    if (!ADDABLE.includes(b.status)) throw new ConflictError('Drivers can only be added to an upcoming trip.', 'INVALID_STATE');
    if (Date.now() > this.addBy(b, s.deadlineHours).getTime()) throw new ConflictError(`Extra drivers must be added at least ${s.deadlineHours} hours before pickup.`, 'TOO_LATE');
    const email = input.email.trim().toLowerCase();
    const guest = await UserModel.findById(guestId).select('email firstName').lean<{ email?: string; firstName?: string }>();
    if (guest?.email?.toLowerCase() === email) throw new ValidationError('That’s your email. Enter the other driver’s email.');
    if ((await BookingDriverModel.countDocuments({ bookingId, active: true })) >= s.max) throw new ConflictError('You can’t add more drivers to this trip.', 'TOO_MANY_DRIVERS');

    const token = randomBytes(24).toString('base64url');
    let driver: BookingDriverDoc;
    try {
      driver = (await BookingDriverModel.create({
        bookingId, guestId, name: input.name.trim(), email, phone: input.phone?.trim() || undefined, status: 'invited', active: true,
        tokenHash: hash(token), tokenExpiresAt: b.period.start, feeCents: s.feeCents, currency: b.priceBreakdown?.currency ?? 'USD', attempts: 0,
      })).toObject();
    } catch (err) {
      if (isDuplicate(err)) throw new ConflictError('This driver is already on the trip.', 'DRIVER_EXISTS');
      throw err;
    }
    logger.info({ bookingId, driverId: driver._id }, 'extra driver invited');
    void this.sendInvite(driver, token, b, guest?.firstName);
    return toPublic(driver);
  }

  async resend(guestId: string, bookingId: string, driverId: string): Promise<PublicDriver> {
    const b = await this.ownBooking(guestId, bookingId);
    const token = randomBytes(24).toString('base64url');
    const d = await BookingDriverModel.findOneAndUpdate({ _id: driverId, bookingId, status: { $in: ['invited', 'verifying'] } }, { $set: { tokenHash: hash(token) } }, { new: true }).lean<BookingDriverDoc>();
    if (!d) throw new ConflictError('This driver can’t be sent a new link.', 'INVALID_STATE');
    const guest = await UserModel.findById(guestId).select('firstName').lean<{ firstName?: string }>();
    void this.sendInvite(d, token, b, guest?.firstName);
    return toPublic(d);
  }

  /** Takes a driver off the trip; a paid fee is refunded when this happens before pickup. */
  async remove(guestId: string, bookingId: string, driverId: string): Promise<PublicDriver> {
    const b = await this.ownBooking(guestId, bookingId);
    const d = await BookingDriverModel.findOneAndUpdate({ _id: driverId, bookingId, active: true }, { $set: { status: 'removed', active: false, removedAt: new Date() } }, { new: true }).lean<BookingDriverDoc>();
    if (!d) throw new NotFoundError('Driver');
    await this.offBooking(d);
    if (Date.now() < new Date(b.period.start).getTime()) await this.refund(d);
    return toPublic((await BookingDriverModel.findById(driverId).lean<BookingDriverDoc>())!);
  }

  /** Charges again after the guest fixes their card. */
  async retryPayment(guestId: string, bookingId: string, driverId: string): Promise<PublicDriver> {
    await this.ownBooking(guestId, bookingId);
    const d = await BookingDriverModel.findOne({ _id: driverId, bookingId, status: 'payment_failed' }).lean<BookingDriverDoc>();
    if (!d) throw new ConflictError('There’s nothing to pay for this driver.', 'INVALID_STATE');
    return toPublic(await this.evaluate(d));
  }

  // ── The invited driver ──

  private async byToken(token: string): Promise<BookingDriverDoc> {
    const d = await BookingDriverModel.findOne({ tokenHash: hash(token) }).lean<BookingDriverDoc>();
    if (!d || ['removed', 'expired'].includes(d.status) || d.tokenExpiresAt.getTime() <= Date.now()) throw new NotFoundError('This invite is no longer valid. Ask the guest to send a new one.');
    return d;
  }

  async preview(token: string, viewerId?: string): Promise<DriverInvitePreview> {
    const d = await this.byToken(token);
    const [b, guest] = await Promise.all([
      BookingModel.findById(d.bookingId).select('vehicleId period').lean<Pick<BookingDoc, 'vehicleId' | 'period'>>(),
      UserModel.findById(d.guestId).select('firstName').lean<{ firstName?: string }>(),
    ]);
    const car = b ? await VehicleModel.findById(b.vehicleId).select('year make model').lean<{ year: number; make: string; model: string }>() : null;
    const yours = viewerId ? !d.userId || d.userId === viewerId : undefined;
    const needs = d.userId && d.userId === viewerId && d.status === 'verifying' ? await this.needs(d) : [];
    return {
      status: d.status, name: d.name, guestFirstName: guest?.firstName ?? 'The guest', car: car ? `${car.year} ${car.make} ${car.model}` : 'a CatoDrive car',
      start: b?.period.start ?? d.tokenExpiresAt, end: b?.period.end ?? d.tokenExpiresAt, needs, declineReasons: d.declineReasons,
      canRetry: d.status === 'declined' && d.attempts < MAX_ATTEMPTS, yours,
    };
  }

  /** The driver signs in and takes the invite; the check runs straight away. */
  async accept(userId: string, token: string): Promise<DriverInvitePreview> {
    const d = await this.byToken(token);
    if (userId === d.guestId) throw new ForbiddenError('You booked this trip, so you’re already the driver.');
    if (d.userId && d.userId !== userId) throw new ForbiddenError('This invite was taken by another account.');
    if (!d.userId) {
      const taken = await BookingDriverModel.findOneAndUpdate({ _id: d._id, userId: { $exists: false } }, { $set: { userId, acceptedAt: new Date(), ...(d.status === 'invited' ? { status: 'verifying' } : {}) } }, { new: true }).lean<BookingDriverDoc>();
      if (!taken) throw new ForbiddenError('This invite was taken by another account.');
      await this.evaluate(taken);
    } else {
      await this.check(userId, token);
    }
    return this.preview(token, userId);
  }

  /** Runs the check again, e.g. after the driver finishes their ID or retries once after a failure. */
  async check(userId: string, token: string): Promise<DriverInvitePreview> {
    const d = await this.byToken(token);
    if (d.userId !== userId) throw new ForbiddenError('Open the invite with the account that accepted it.');
    if (d.status === 'declined') {
      if (d.attempts >= MAX_ATTEMPTS) throw new ConflictError('This check can’t be tried again. Ask the guest to contact us.', 'NO_RETRY');
      const again = await BookingDriverModel.findOneAndUpdate({ _id: d._id, status: 'declined', active: true }, { $set: { status: 'verifying' }, $unset: { declineReasons: 1 } }, { new: true }).lean<BookingDriverDoc>();
      if (again) await this.evaluate(again);
    } else if (d.status === 'verifying') {
      await this.evaluate(d);
    }
    return this.preview(token, userId);
  }

  private async needs(d: BookingDriverDoc): Promise<string[]> {
    const b = await BookingModel.findById(d.bookingId).select('period').lean<Pick<BookingDoc, 'period'>>();
    const e = await eligibilityService.evaluate(d.userId!, b?.period.end);
    return e.blockers.filter((x) => !FINAL_BLOCKERS.includes(x)).map((x) => BLOCKER_COPY[x]);
  }

  /** Checks the driver like a guest, then charges the main guest's card; nothing is charged before approval. */
  async evaluate(d: BookingDriverDoc): Promise<BookingDriverDoc> {
    if (!d.userId || !['verifying', 'payment_failed'].includes(d.status)) return d;
    const b = await BookingModel.findById(d.bookingId).lean<BookingDoc>();
    if (!b || !ADDABLE.includes(b.status)) return (await this.set(d._id, d.status, { status: 'expired', active: false })) ?? d;

    const e = await eligibilityService.evaluate(d.userId, b.period.end);
    const final = e.blockers.filter((x) => FINAL_BLOCKERS.includes(x));
    let tooYoung: string | undefined;
    try {
      await wheelbaseInsuranceService.assertInsurable(b.vehicleId, d.userId, b.period.start);
    } catch (err) {
      if ((err as { code?: string }).code === 'RENTER_TOO_YOUNG') tooYoung = (err as Error).message.replace(' Please choose another car.', '');
    }
    if (final.length || tooYoung) {
      const reasons = [...final.map((x) => BLOCKER_COPY[x]), ...(tooYoung ? [tooYoung] : [])];
      const out = await this.set(d._id, d.status, { status: 'declined', declineReasons: reasons, active: d.attempts + 1 < MAX_ATTEMPTS }, { attempts: 1 });
      if (out) void this.tellGuest(b, out, 'Driver not approved', `${d.name} couldn’t be added as a driver: ${reasons.join(' ')} You weren’t charged.`);
      return out ?? d;
    }
    if (!e.eligible) return d;

    const paid = d.feeCents > 0 ? await paymentService.chargeGuest({ bookingId: b._id, guestId: b.guestId, amount: d.feeCents, currency: d.currency, idempotencyKey: `charge_${chargeKey(d._id)}` }) : true;
    if (!paid) {
      const out = await this.set(d._id, d.status, { status: 'payment_failed' });
      if (out && d.status !== 'payment_failed') void this.tellGuest(b, out, 'Add a card to finish', `${d.name} passed the driver check. We couldn’t charge the ${usd(d.feeCents)} driver fee to your card. Update your card, then tap Pay on your trip page.`);
      return out ?? d;
    }
    const out = await this.set(d._id, d.status, { status: 'approved', approvedAt: new Date(), ...(d.feeCents > 0 ? { chargedAt: new Date() } : {}) });
    if (!out) return d;
    await BookingModel.updateOne({ _id: b._id, 'additionalDrivers.driverId': { $ne: d._id } }, { $push: { additionalDrivers: { name: d.name, driverId: d._id, addedAt: new Date() } } });
    logger.info({ bookingId: b._id, driverId: d._id, feeCents: d.feeCents }, 'extra driver approved');
    void this.tellGuest(b, out, 'Driver approved', `${d.name} can now drive on your trip.${d.feeCents ? ` We charged ${usd(d.feeCents)} to your card.` : ''}`);
    const tz = await availabilityService.timeZoneOf(b.vehicleId);
    void notificationService.send({ userId: d.userId, templateKey: 'booking.driver_approved', title: 'You’re approved to drive', body: `You can drive on this trip from ${day(b.period.start, tz)} to ${day(b.period.end, tz)}. Bring your driver’s license to pickup.` }).catch(() => undefined);
    return out;
  }

  private async set(id: string, from: DriverStatus, set: Partial<BookingDriverDoc>, inc?: Partial<Record<'attempts', number>>): Promise<BookingDriverDoc | null> {
    return BookingDriverModel.findOneAndUpdate({ _id: id, status: from }, { $set: set, ...(inc ? { $inc: inc } : {}) }, { new: true }).lean<BookingDriverDoc>();
  }

  private async offBooking(d: Pick<BookingDriverDoc, '_id' | 'bookingId'>): Promise<void> {
    await BookingModel.updateOne({ _id: d.bookingId }, { $pull: { additionalDrivers: { driverId: d._id } } });
  }

  private async refund(d: BookingDriverDoc): Promise<void> {
    if (!d.chargedAt || d.refundedAt || !d.feeCents) return;
    try {
      await paymentService.refundCharge(d.bookingId, chargeKey(d._id), 'card', d.feeCents);
      await BookingDriverModel.updateOne({ _id: d._id }, { $set: { refundedAt: new Date() } });
    } catch (err) {
      logger.error({ err, driverId: d._id, bookingId: d.bookingId }, 'extra driver fee refund failed');
    }
  }

  // ── Events and housekeeping ──

  /** A driver who just passed their ID check is approved without having to come back. */
  async onIdentityApproved(userId: string): Promise<void> {
    const waiting = await BookingDriverModel.find({ userId, status: 'verifying' }).limit(20).lean<BookingDriverDoc[]>();
    for (const d of waiting) await this.evaluate(d).catch((err) => logger.warn({ err, driverId: d._id }, 'extra driver check failed'));
  }

  /** A cancelled trip takes its drivers off and gives every driver fee back. */
  async onBookingCancelled(bookingId: string): Promise<void> {
    const drivers = await BookingDriverModel.find({ bookingId, active: true }).lean<BookingDriverDoc[]>();
    for (const d of drivers) {
      await BookingDriverModel.updateOne({ _id: d._id, active: true }, { $set: { status: 'removed', active: false, removedAt: new Date() } });
      await this.refund(d);
    }
  }

  /** Invites nobody finished by pickup expire, so they never hold a place on the trip. */
  async sweep(now = new Date()): Promise<number> {
    const r = await BookingDriverModel.updateMany(
      { status: { $in: ['invited', 'verifying', 'payment_failed'] }, tokenExpiresAt: { $lte: now } },
      { $set: { status: 'expired', active: false } },
    );
    return r.modifiedCount;
  }

  /** Approved drivers on a trip, for the host's handover screen and staff. */
  async approvedFor(bookingId: string): Promise<{ name: string; userId?: string }[]> {
    return BookingDriverModel.find({ bookingId, status: 'approved' }).select('name userId').sort({ approvedAt: 1 }).limit(10).lean<{ name: string; userId?: string }[]>();
  }

  private async sendInvite(d: BookingDriverDoc, token: string, b: BookingDoc, guestFirstName?: string): Promise<void> {
    try {
      const [car, tz] = await Promise.all([
        VehicleModel.findById(b.vehicleId).select('year make model').lean<{ year: number; make: string; model: string }>(),
        availabilityService.timeZoneOf(b.vehicleId),
      ]);
      const who = guestFirstName || 'A guest';
      const link = `${config.notifications.webUrl}/drivers/invite/${token}`;
      const res = await channelProviders.email.send({
        target: { userId: '', email: d.email },
        templateKey: 'booking.driver_invite',
        title: `${who} added you as a driver on CatoDrive`,
        body: [
          `${who} wants you to drive on their trip${car ? ` in a ${car.year} ${car.make} ${car.model}` : ''}, ${day(b.period.start, tz)} to ${day(b.period.end, tz)}.`,
          'Sign in or create a free account, then check your driver’s license and take a quick selfie. It takes about 3 minutes.',
          `Finish before pickup. This link works until then.`,
        ].join('\n'),
        deepLink: link,
        actionLabel: 'Accept and get approved',
      });
      if (!res.ok) logger.warn({ driverId: d._id, error: res.error }, 'driver invite email not delivered');
    } catch (err) {
      logger.warn({ err, driverId: d._id }, 'driver invite email failed');
    }
  }

  private async tellGuest(b: BookingDoc, d: BookingDriverDoc, title: string, body: string): Promise<void> {
    await notificationService.send({ userId: b.guestId, priority: 'high', templateKey: 'booking.driver', title, body, deepLink: `/bookings/${b._id}`, data: { bookingId: b._id, driverId: d._id } }).catch(() => undefined);
  }
}

export const bookingDriverService = new BookingDriverService();
