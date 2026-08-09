import { UserModel } from '../../users/infrastructure/user.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { ReviewModel } from '../../reviews/infrastructure/review.model';
import { riskService } from './risk.service';
import { isCancelled } from '../../bookings/domain/booking-status';
import { platformConfigService } from '../../platform-config/application/platform-config.service';

/** Tier ordering, so a "minimum tier" perk gate is a comparison, not a list. */
const TIER_RANK: Record<'new' | 'bronze' | 'silver' | 'gold', number> = {
  new: 0, bronze: 1, silver: 2, gold: 3,
};

export interface TrustComponent {
  key: string;
  label: string;
  /** Points earned out of `max`. */
  points: number;
  max: number;
  detail: string;
}

export interface TrustScore {
  score: number;
  tier: 'new' | 'bronze' | 'silver' | 'gold';
  components: TrustComponent[];
  /** Concrete things this member can do to move up. */
  nextSteps: string[];
}

/**
 * Trust score.
 *
 * Deliberately NOT the inverse of the risk score. Risk answers "is this person
 * about to defraud us", is computed per attempt, and is never shown to anyone.
 * Trust answers "has this person earned latitude", accrues slowly, and IS shown
 * — it drives waived deposits, Instant Book access and better support SLAs.
 *
 * Every component is earnable by doing the ordinary thing well, and none of it
 * is behavioural surveillance: a member can read exactly why they scored what
 * they scored and what to do next.
 */
export class TrustScoreService {
  async compute(userId: string): Promise<TrustScore> {
    // Thresholds and weights are admin policy, not code constants — ops retunes
    // them (looser during a growth push, tighter after a fraud wave) live.
    const { trust } = await platformConfigService.get();
    const [user, kyc, bookings, reviews, riskEvents] = await Promise.all([
      UserModel.findOne({ _id: userId }).lean(),
      KycModel.findOne({ userId }).sort({ createdAt: -1 }).lean(),
      BookingModel.find({ guestId: userId }, { status: 1, createdAt: 1 }).lean(),
      ReviewModel.find({ subjectId: userId }, { rating: 1 }).lean(),
      riskService.historyFor(userId, 10),
    ]);

    const components: TrustComponent[] = [];

    // ── Verification: 30 ──────────────────────────────────────────────
    let verification = 0;
    const verifiedBits: string[] = [];
    const vp = trust.verificationPoints;
    if (user?.emailVerified) { verification += vp.email; verifiedBits.push('email'); }
    if (user?.phoneVerified) { verification += vp.phone; verifiedBits.push('phone'); }
    if (kyc?.status === 'approved') { verification += vp.licence; verifiedBits.push('licence'); }
    components.push({
      key: 'verification',
      label: 'Identity verified',
      points: verification,
      max: vp.email + vp.phone + vp.licence,
      detail: verifiedBits.length ? `Verified: ${verifiedBits.join(', ')}` : 'Nothing verified yet',
    });

    // ── Completed trips: 25 ───────────────────────────────────────────
    const completed = bookings.filter((b) => b.status === 'completed').length;
    // Diminishing returns — the 20th trip proves less than the 2nd.
    const tripPoints = Math.min(25, Math.round(Math.log2(completed + 1) * 7));
    components.push({
      key: 'trips',
      label: 'Trips completed',
      points: tripPoints,
      max: 25,
      detail: `${completed} completed trip${completed === 1 ? '' : 's'}`,
    });

    // ── Reviews: 20 ───────────────────────────────────────────────────
    const rated = reviews.filter((r) => typeof r.rating === 'number');
    const avg = rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : 0;
    // Needs a few reviews before it counts — one 5★ is not a reputation.
    const reviewPoints = rated.length >= 2 ? Math.round(((avg - 3) / 2) * 20) : 0;
    components.push({
      key: 'reviews',
      label: 'How hosts rate you',
      points: Math.max(0, Math.min(20, reviewPoints)),
      max: 20,
      detail: rated.length >= 2
        ? `${avg.toFixed(1)}★ from ${rated.length} reviews`
        : `${rated.length} review${rated.length === 1 ? '' : 's'} — 2 needed to count`,
    });

    // ── Reliability: 15 ───────────────────────────────────────────────
    const finished = bookings.filter(
      (b) => b.status === 'completed' || isCancelled(b.status as never),
    );
    const cancelled = bookings.filter((b) => isCancelled(b.status as never)).length;
    const cancelRate = finished.length ? cancelled / finished.length : 0;
    // Full marks until 10% cancellations, then falls away to zero at 40%.
    const reliability = finished.length < 2
      ? 8 // neutral starting position; a new member is not unreliable
      : Math.round(Math.max(0, Math.min(1, (0.4 - cancelRate) / 0.3)) * 15);
    components.push({
      key: 'reliability',
      label: 'Trips you keep',
      points: reliability,
      max: 15,
      detail: finished.length < 2
        ? 'Not enough history yet'
        : `${Math.round(cancelRate * 100)}% cancelled`,
    });

    // ── Standing: 10 ──────────────────────────────────────────────────
    const worstRisk = riskEvents.find((e) => e.band === 'high' || e.band === 'block');
    const accountOk = user?.status === 'active';
    const standing = !accountOk ? 0 : worstRisk ? 4 : 10;
    components.push({
      key: 'standing',
      label: 'Account standing',
      points: standing,
      max: 10,
      detail: !accountOk
        ? `Account is ${user?.status}`
        : worstRisk
          ? 'A recent check needed review'
          : 'Good standing',
    });

    const score = components.reduce((s, c) => s + c.points, 0);

    return {
      score,
      tier: score >= trust.tiers.gold
        ? 'gold'
        : score >= trust.tiers.silver
          ? 'silver'
          : score >= trust.tiers.bronze
            ? 'bronze'
            : 'new',
      components,
      nextSteps: this.nextSteps(components),
    };
  }

  /** Only the things the member can actually act on, biggest win first. */
  private nextSteps(components: TrustComponent[]): string[] {
    const gaps = components
      .filter((c) => c.points < c.max)
      .sort((a, b) => b.max - b.points - (a.max - a.points));

    const copy: Record<string, string> = {
      verification: 'Finish verifying your email, phone and driver’s licence.',
      trips: 'Complete a few more trips.',
      reviews: 'Trips rated by hosts build this — leave the car as you found it.',
      reliability: 'Avoid cancelling once a trip is confirmed.',
      standing: 'Keep your account in good standing.',
    };
    return gaps.slice(0, 3).map((c) => copy[c.key]).filter(Boolean);
  }

  /**
   * Perks. The point of a trust score is that it does something — otherwise it
   * is a vanity number.
   */
  async perks(userId: string): Promise<{
    depositWaived: boolean;
    depositDiscountPct: number;
    instantBookEligible: boolean;
    prioritySupport: boolean;
  }> {
    const [{ tier }, { trust }] = await Promise.all([this.compute(userId), platformConfigService.get()]);
    const { depositDiscountPctByTier, instantBookMinTier, prioritySupportMinTier } = trust.perks;
    const discountPct = depositDiscountPctByTier[tier] ?? 0;
    return {
      // A full discount IS a waiver — deriving it keeps the two from disagreeing.
      depositWaived: discountPct >= 100,
      depositDiscountPct: discountPct,
      instantBookEligible: TIER_RANK[tier] >= TIER_RANK[instantBookMinTier],
      prioritySupport: TIER_RANK[tier] >= TIER_RANK[prioritySupportMinTier],
    };
  }
}

export const trustScoreService = new TrustScoreService();
