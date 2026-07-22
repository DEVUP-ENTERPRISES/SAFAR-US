import { createHash } from 'crypto';
import { DeviceModel, RiskEventModel, DenyEntryModel } from '../infrastructure/risk.models';
import { UserModel } from '../../users/infrastructure/user.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { PaymentMethodModel } from '../../payments/infrastructure/payment-method.model';
import {
  SIGNAL_WEIGHTS,
  SIGNAL_REASONS,
  DISPOSABLE_EMAIL_DOMAINS,
  looksLikeDatacenterIp,
  bandFor,
  applyFloors,
  DEPOSIT_MULTIPLIER,
  type RiskSignal,
  type RiskBand,
} from '../domain/risk-signals';
import { logger } from '../../../infrastructure/logging/logger';

export interface RiskContextInput {
  userId: string;
  context: 'signup' | 'login' | 'booking' | 'kyc' | 'payout';
  deviceFingerprint?: string;
  ip?: string;
  userAgent?: string;
  platform?: string;
  emulator?: boolean;
  rooted?: boolean;
  vpn?: boolean;
  /** Device-reported coordinates, to compare against the IP's country. */
  coords?: { lat: number; lng: number };
}

export interface RiskAssessment {
  score: number;
  band: RiskBand;
  action: 'allow' | 'challenge' | 'review' | 'deny';
  signals: { signal: RiskSignal; weight: number; detail: string }[];
  /** Multiplier the deposit should be sized by. */
  depositMultiplier: number;
  eventId: string;
}

/** One-way; the deny list must never be reversible into real identifiers. */
export function hashValue(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/**
 * Risk scoring.
 *
 * There was no risk engine at all: no device signal, no velocity rule, no
 * duplicate-identity check. A marketplace with Instant Book and (until
 * recently) no deposit is a mechanical target for stolen-card testing.
 *
 * The design is deliberately additive-and-capped rather than a model: every
 * signal here has an innocent explanation on its own — a traveller on a VPN, a
 * family sharing a tablet, a new phone — and only a cluster means anything. It
 * is also fully explainable, which a regulator, a chargeback, and an appealing
 * customer all eventually require.
 */
export class RiskService {
  /** Record a device sighting and return what we know about it. */
  async touchDevice(input: RiskContextInput) {
    if (!input.deviceFingerprint) return null;

    const now = new Date();
    await DeviceModel.updateOne(
      { fingerprint: input.deviceFingerprint },
      {
        $setOnInsert: { fingerprint: input.deviceFingerprint, firstSeenAt: now },
        $set: {
          lastSeenAt: now,
          lastIp: input.ip,
          userAgent: input.userAgent,
          platform: input.platform,
          ...(input.emulator !== undefined ? { emulator: input.emulator } : {}),
          ...(input.rooted !== undefined ? { rooted: input.rooted } : {}),
        },
        $addToSet: { userIds: input.userId },
      },
      { upsert: true },
    );
    return DeviceModel.findOne({ fingerprint: input.deviceFingerprint }).lean();
  }

  async evaluate(input: RiskContextInput): Promise<RiskAssessment> {
    const found: { signal: RiskSignal; weight: number; detail: string }[] = [];
    const add = (signal: RiskSignal, detail?: string) =>
      found.push({
        signal,
        weight: SIGNAL_WEIGHTS[signal],
        detail: detail ?? SIGNAL_REASONS[signal],
      });

    const [user, device] = await Promise.all([
      UserModel.findOne({ _id: input.userId }).lean(),
      this.touchDevice(input),
    ]);

    // ── Deny list ────────────────────────────────────────────────────
    if (await this.isDenied(user?.email, user?.phone, input.deviceFingerprint)) {
      add('blacklisted');
    }
    if (device?.blocked) add('blacklisted', `Device blocked: ${device.blockedReason ?? 'no reason given'}`);

    // ── Device & network ─────────────────────────────────────────────
    if (device) {
      const others = device.userIds.filter((id) => id !== input.userId);
      if (others.length >= 2) {
        add('device_shared_accounts', `${others.length + 1} accounts on this device`);
      }
      if (device.emulator) add('device_emulator');
      if (device.rooted) add('device_rooted');

      // Several accounts created from one device inside a day is a ring.
      const dayAgo = new Date(Date.now() - 86_400_000);
      if (device.userIds.length >= 3) {
        const recent = await UserModel.countDocuments({
          _id: { $in: device.userIds },
          createdAt: { $gte: dayAgo },
        });
        if (recent >= 3) add('rapid_signup_burst', `${recent} accounts from this device in 24h`);
      }
    } else if (input.context === 'signup') {
      add('device_new');
    }

    if (input.vpn) add('vpn_or_proxy');
    if (input.ip && looksLikeDatacenterIp(input.ip)) add('datacenter_ip', `IP ${input.ip}`);

    // ── Identity ─────────────────────────────────────────────────────
    if (user) {
      const domain = (user.email ?? '').split('@')[1]?.toLowerCase();
      if (domain && DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
        add('disposable_email', `Domain ${domain}`);
      }
      if (!user.emailVerified) add('email_unverified');
      if (!user.phoneVerified) add('phone_unverified');
      if (user.status === 'suspended' || user.status === 'banned') {
        add('prior_suspension', `Account status ${user.status}`);
      }

      if (user.phone) {
        const sharing = await UserModel.countDocuments({
          phone: user.phone,
          _id: { $ne: input.userId },
          deletedAt: null,
        });
        if (sharing > 0) add('duplicate_phone', `${sharing} other account(s)`);
      }
    }

    // The strongest identity signal available: the same licence on two accounts.
    const kyc = await KycModel.findOne({ userId: input.userId }).sort({ createdAt: -1 }).lean();
    if (kyc?.licenceNumberHash) {
      const dupes = await KycModel.countDocuments({
        licenceNumberHash: kyc.licenceNumberHash,
        userId: { $ne: input.userId },
      });
      if (dupes > 0) add('duplicate_licence', `Licence on ${dupes} other account(s)`);
    }
    if (kyc?.status === 'rejected') add('identity_rejected_before');

    // ── Velocity ─────────────────────────────────────────────────────
    const cards = await PaymentMethodModel.countDocuments({ userId: input.userId, deletedAt: null });
    if (cards >= 4) add('many_cards_one_account', `${cards} cards on file`);

    if (input.context === 'booking') {
      const hourAgo = new Date(Date.now() - 3_600_000);
      const recentBookings = await BookingModel.countDocuments({
        guestId: input.userId,
        createdAt: { $gte: hourAgo },
      });
      if (recentBookings >= 3) add('booking_velocity', `${recentBookings} bookings in the last hour`);
    }

    // ── Score ────────────────────────────────────────────────────────
    const score = Math.min(100, found.reduce((sum, s) => sum + s.weight, 0));
    // Decisive signals set a floor the arithmetic cannot undercut.
    const band = applyFloors(bandFor(score), found.map((s) => s.signal));
    const action = this.actionFor(band, input.context);

    const event = await RiskEventModel.create({
      userId: input.userId,
      context: input.context,
      score,
      band,
      signals: found.map((s) => ({ signal: s.signal, weight: s.weight, detail: s.detail })),
      deviceFingerprint: input.deviceFingerprint,
      ip: input.ip,
      action,
    });

    if (band === 'high' || band === 'block') {
      logger.warn(
        { userId: input.userId, context: input.context, score, band, signals: found.map((s) => s.signal) },
        'elevated risk',
      );
    }

    return {
      score,
      band,
      action,
      signals: found,
      depositMultiplier: DEPOSIT_MULTIPLIER[band],
      eventId: event._id,
    };
  }

  /**
   * What to do about a band, by context.
   *
   * A high-risk signup is worth challenging, not refusing — most of them are
   * real customers on a VPN. A high-risk booking is different: that is the
   * moment a car is about to be handed over, so it goes to a human first.
   */
  private actionFor(band: RiskBand, context: RiskContextInput['context']): RiskAssessment['action'] {
    if (band === 'block') return 'deny';
    if (band === 'high') return context === 'booking' || context === 'payout' ? 'review' : 'challenge';
    if (band === 'medium') return 'challenge';
    return 'allow';
  }

  async isDenied(email?: string, phone?: string, fingerprint?: string): Promise<boolean> {
    const hashes: { type: string; valueHash: string }[] = [];
    if (email) hashes.push({ type: 'email', valueHash: hashValue(email) });
    if (phone) hashes.push({ type: 'phone', valueHash: hashValue(phone) });
    if (fingerprint) hashes.push({ type: 'device', valueHash: hashValue(fingerprint) });
    if (hashes.length === 0) return false;
    return (await DenyEntryModel.countDocuments({ $or: hashes })) > 0;
  }

  async deny(type: DenyType, value: string, reason: string, addedBy: string): Promise<void> {
    await DenyEntryModel.updateOne(
      { type, valueHash: hashValue(value) },
      { $setOnInsert: { type, valueHash: hashValue(value), reason, addedBy } },
      { upsert: true },
    );
  }

  async allowAgain(type: DenyType, value: string): Promise<boolean> {
    const r = await DenyEntryModel.deleteOne({ type, valueHash: hashValue(value) });
    return r.deletedCount > 0;
  }

  /** Recent decisions for one user — the identity timeline in the admin panel. */
  async historyFor(userId: string, limit = 25) {
    return RiskEventModel.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
  }

  /** The review queue: everything the engine could not clear on its own. */
  async queue(opts: { band?: RiskBand; limit?: number } = {}) {
    const filter: Record<string, unknown> = { action: { $in: ['review', 'deny'] } };
    if (opts.band) filter.band = opts.band;
    return RiskEventModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(opts.limit ?? 50, 200))
      .lean();
  }

  /** A human disagrees with the engine. Recorded, never silent. */
  async override(eventId: string, operatorId: string, reason: string, action: RiskAssessment['action']) {
    await RiskEventModel.updateOne(
      { _id: eventId },
      { action, overriddenBy: operatorId, overrideReason: reason },
    );
    logger.info({ eventId, operatorId, action, reason }, 'risk decision overridden');
  }
}

export type DenyType = 'email' | 'phone' | 'licence' | 'device' | 'card';

export const riskService = new RiskService();
