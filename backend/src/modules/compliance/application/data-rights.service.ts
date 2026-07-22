import { UserModel } from '../../users/infrastructure/user.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { PaymentModel } from '../../payments/infrastructure/payment.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { ReviewModel } from '../../reviews/infrastructure/review.model';
import { NotificationModel } from '../../notifications/infrastructure/notification.model';
import { RiskEventModel, DeviceModel } from '../../risk/infrastructure/risk.models';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { LegalHoldModel } from '../infrastructure/legal-hold.model';
import { ConflictError, NotFoundError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Data subject rights.
 *
 * Required in both launch markets and not optional: CCPA/CPRA in California,
 * PIPEDA federally in Canada, Québec's Law 25, and a growing list of US state
 * statutes. Each gives a person the right to see what is held about them and,
 * within limits, to have it erased.
 *
 * The limits matter as much as the right. A rental marketplace cannot simply
 * delete everything on request: financial records carry a statutory retention
 * period, an open insurance claim needs its evidence, and a person under
 * investigation must not be able to erase the investigation by asking nicely.
 * So erasure here is *minimisation* — identifiers are destroyed, the immutable
 * financial and safety record is kept and de-identified.
 */
export class DataRightsService {
  /**
   * Everything held about one person, in one document.
   *
   * Deliberately assembled live rather than from a warehouse: a snapshot that
   * drifts from the real records is worse than none, because it is what gets
   * handed to a regulator.
   */
  async exportFor(userId: string): Promise<Record<string, unknown>> {
    const user = await UserModel.findOne({ _id: userId }).lean();
    if (!user) throw new NotFoundError('User');

    const host = await HostModel.findOne({ userId }).lean();

    const [bookings, payments, kyc, reviews, notifications, riskEvents, devices, vehicles] =
      await Promise.all([
        BookingModel.find({ $or: [{ guestId: userId }, ...(host ? [{ hostId: host._id }] : [])] }).lean(),
        PaymentModel.find({ userId }).lean(),
        KycModel.find({ userId }).lean(),
        ReviewModel.find({ $or: [{ authorId: userId }, { subjectId: userId }] }).lean(),
        NotificationModel.find({ userId }).sort({ createdAt: -1 }).limit(500).lean(),
        RiskEventModel.find({ userId }).lean(),
        DeviceModel.find({ userIds: userId }).lean(),
        host ? VehicleModel.find({ hostId: host._id }).lean() : Promise.resolve([]),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      subject: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        locale: user.locale,
        timezone: user.timezone,
        status: user.status,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        createdAt: user.createdAt,
      },
      hostProfile: host ?? null,
      vehicles,
      bookings,
      // Card details are never held by TURA — the PSP tokenises them — so an
      // export can only ever show the last four and the brand.
      payments: payments.map((p) => ({
        id: p._id,
        bookingId: p.bookingId,
        type: p.type,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        createdAt: p.createdAt,
      })),
      identityChecks: kyc.map((k) => ({
        id: k._id,
        status: k.status,
        level: k.level,
        decisionAt: k.decisionAt,
        // Document images are excluded by reference, not by omission: they are
        // in private storage and are released through the authorised download
        // route, never bundled into a file that may be emailed around.
        documents: k.documents?.map((d) => ({ type: d.type, storedPrivately: true })) ?? [],
      })),
      reviews,
      notifications: notifications.map((n) => ({
        at: n.createdAt,
        channel: n.channel,
        template: n.templateKey,
        title: n.title,
      })),
      // Included on purpose. A person is entitled to know they were scored and
      // why; hiding automated decisioning is exactly what these laws target.
      automatedDecisions: riskEvents.map((e) => ({
        at: e.createdAt,
        context: e.context,
        outcome: e.action,
        reasons: e.signals.map((s) => s.detail),
      })),
      devices: devices.map((d) => ({
        firstSeenAt: d.firstSeenAt,
        lastSeenAt: d.lastSeenAt,
        platform: d.platform,
      })),
    };
  }

  /** Anything that legally prevents erasure right now. */
  async erasureBlockers(userId: string): Promise<string[]> {
    const host = await HostModel.findOne({ userId }).lean();
    const blockers: string[] = [];

    const hold = await LegalHoldModel.findOne({ userId, releasedAt: null }).lean();
    if (hold) blockers.push(`Legal hold in place: ${hold.reason}`);

    const liveBooking = await BookingModel.countDocuments({
      $or: [{ guestId: userId }, ...(host ? [{ hostId: host._id }] : [])],
      status: { $in: ['pending_verification', 'pending_approval', 'confirmed', 'paid', 'in_progress'] },
    });
    if (liveBooking > 0) blockers.push(`${liveBooking} trip(s) still in progress`);

    const disputed = await BookingModel.countDocuments({
      $or: [{ guestId: userId }, ...(host ? [{ hostId: host._id }] : [])],
      status: 'disputed',
    });
    if (disputed > 0) blockers.push(`${disputed} open dispute(s)`);

    const heldDeposit = await PaymentModel.countDocuments({
      userId,
      type: 'deposit',
      status: 'authorized',
    });
    if (heldDeposit > 0) blockers.push('A security deposit is still held');

    return blockers;
  }

  /**
   * Erase a person while keeping the record.
   *
   * Identifiers are destroyed in place — not soft-deleted, not moved — so they
   * cannot be recovered from the live database. What remains is the financial
   * and safety history with the person removed from it, which is both what the
   * statutes permit and what an auditor, an insurer and a court require.
   */
  async erase(userId: string, requestedBy: string, reason: string): Promise<{ erased: true }> {
    const blockers = await this.erasureBlockers(userId);
    if (blockers.length > 0) {
      throw new ConflictError(
        `Cannot erase this account yet: ${blockers.join('; ')}`,
        'ERASURE_BLOCKED',
      );
    }

    const user = await UserModel.findOne({ _id: userId }).lean();
    if (!user) throw new NotFoundError('User');

    // The FULL id, not a prefix: ids are UUIDv7 and therefore time-ordered, so
    // two accounts created in the same moment share their leading characters
    // and a truncated tombstone collides on the unique email index.
    const tombstone = `erased-${userId}`;

    await UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          // Unique indexes on email and phone mean these cannot simply be
          // unset — a tombstone keeps them unique and unusable.
          email: `${tombstone}@erased.invalid`,
          firstName: 'Erased',
          lastName: 'User',
          status: 'closed',
          closedAt: new Date(),
          statusReason: 'Erasure requested',
          erasedAt: new Date(),
        },
        $unset: {
          // Unset, never set to null: the unique index on phone is sparse, and
          // sparse skips MISSING fields — a null is a value, so a second erased
          // account would collide on it.
          phone: '',
          passwordHash: '',
          avatarUrl: '',
          dateOfBirth: '',
          addresses: '',
          emergencyContacts: '',
          pushTokens: '',
          mfa: '',
        },
      },
    );

    // Identity documents are the most sensitive thing held; the decision is
    // retained for the safety record, the images and numbers are not.
    await KycModel.updateMany(
      { userId },
      { $set: { documents: [] }, $unset: { licenceNumberHash: '', licenceExpiry: '' } },
    );

    // Reviews stay — they are other people's experience of a trip, and pulling
    // them would rewrite the history of hosts who did nothing wrong. Only the
    // author's link to them is cut.
    await ReviewModel.updateMany({ authorId: userId }, { $set: { authorId: tombstone } });

    await NotificationModel.deleteMany({ userId });
    await DeviceModel.updateMany({ userIds: userId }, { $pull: { userIds: userId } });

    logger.warn({ userId, requestedBy, reason }, 'account erased under data-rights request');
    return { erased: true };
  }

  /** Freeze erasure while an investigation, claim or legal matter is open. */
  async placeHold(userId: string, reason: string, placedBy: string) {
    return LegalHoldModel.findOneAndUpdate(
      { userId, releasedAt: null },
      { $setOnInsert: { userId, reason, placedBy, placedAt: new Date() } },
      { upsert: true, new: true },
    ).lean();
  }

  async releaseHold(userId: string, releasedBy: string) {
    const r = await LegalHoldModel.updateMany(
      { userId, releasedAt: null },
      { $set: { releasedAt: new Date(), releasedBy } },
    );
    return { released: r.modifiedCount };
  }
}

export const dataRightsService = new DataRightsService();
