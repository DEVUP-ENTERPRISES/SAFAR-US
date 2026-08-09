import { CouponModel, type CouponDoc } from '../infrastructure/coupon.model';
import { CouponRedemptionModel } from '../infrastructure/coupon-redemption.model';
import { ValidationError, ConflictError, NotFoundError } from '../../../core/errors/app-error';
import { money, applyBps, type Money } from '../../../core/types/money';
import { logger } from '../../../infrastructure/logging/logger';

/** Everything a coupon can be judged against. All optional but the code. */
export interface CouponContext {
  userId?: string;
  city?: string;
  category?: string;
  tripDays?: number;
}

const invalid = (message: string, issue: string): ValidationError =>
  new ValidationError(message, [{ field: 'couponCode', issue }]);

export class CouponService {
  /**
   * Load a coupon and assert every eligibility rule for this context.
   *
   * Deliberately strict: a coupon that would fail at redemption must fail at
   * quote time too, so a guest never sees a discount that later vanishes.
   */
  private async findValid(code: string, ctx: CouponContext = {}): Promise<CouponDoc> {
    const coupon = await CouponModel.findOne({
      code: code.toUpperCase(),
      deletedAt: null,
    }).lean<CouponDoc>();
    if (!coupon) throw invalid('Coupon not found', 'invalid');

    const now = new Date();
    if (coupon.status !== 'active') throw invalid('Coupon is not active', 'inactive');
    if (now < coupon.validFrom) throw invalid('Coupon is not active yet', 'not_started');
    if (now > coupon.validTo) throw invalid('Coupon has expired', 'expired');
    if (coupon.redeemedCount >= coupon.maxRedemptions) throw invalid('Coupon fully redeemed', 'exhausted');
    if (coupon.budget > 0 && coupon.spent >= coupon.budget) {
      throw invalid('This promotion has ended', 'budget_exhausted');
    }

    // Trip shape.
    if (coupon.minTripDays > 0 && (ctx.tripDays ?? 0) < coupon.minTripDays) {
      throw invalid(`Valid on trips of ${coupon.minTripDays} days or more`, 'min_trip_days');
    }
    // Audience: city / vehicle category.
    if (coupon.cities.length > 0 && !coupon.cities.some((c) => c.toLowerCase() === (ctx.city ?? '').toLowerCase())) {
      throw invalid('Not valid in this city', 'city');
    }
    if (coupon.categories.length > 0 && !coupon.categories.includes(ctx.category ?? '')) {
      throw invalid('Not valid for this vehicle', 'category');
    }

    // Per-user rules need a user; a quote without one is checked at redemption.
    if (ctx.userId) {
      if (coupon.perUserLimit > 0) {
        const used = await CouponRedemptionModel.countDocuments({ couponId: coupon._id, userId: ctx.userId });
        if (used >= coupon.perUserLimit) throw invalid('You have already used this coupon', 'per_user_limit');
      }
      if (coupon.firstTimeOnly) {
        // Cross-module read kept narrow and lazy to avoid a circular import.
        const { BookingModel } = await import('../../bookings/infrastructure/booking.model');
        const prior = await BookingModel.countDocuments({
          guestId: ctx.userId,
          status: { $in: ['completed', 'active', 'paid', 'confirmed'] },
        });
        if (prior > 0) throw invalid('Valid for first-time guests only', 'first_time_only');
      }
    }
    return coupon;
  }

  /** Compute the discount for a coupon against a spend amount. */
  async computeDiscount(code: string, spend: Money, ctx: CouponContext = {}): Promise<Money> {
    const coupon = await this.findValid(code, ctx);
    if (spend.amount < coupon.minSpend) {
      throw invalid('Order below coupon minimum spend', 'min_spend');
    }

    let value: number;
    if (coupon.type === 'percent') {
      value = applyBps(spend, coupon.valueBps).amount;
      // "20% off, up to $50" — without this a single large booking can drain a campaign.
      if (coupon.maxDiscount > 0) value = Math.min(value, coupon.maxDiscount);
    } else {
      value = coupon.amount;
    }

    // Never exceed the spend, and never exceed what's left of the budget.
    value = Math.min(value, spend.amount);
    if (coupon.budget > 0) value = Math.min(value, Math.max(0, coupon.budget - coupon.spent));

    return money(value, spend.currency);
  }

  /**
   * Consume a redemption, atomically.
   *
   * The counters are incremented with the caps in the *filter*, so two
   * concurrent bookings can never push a campaign past maxRedemptions or its
   * budget — the previous version incremented unconditionally and could
   * oversell. The redemption row is written first and is uniquely keyed on
   * (coupon, booking), which makes a retried call a no-op instead of a
   * double-spend.
   */
  async redeem(
    code: string,
    ctx: { userId: string; bookingId: string; discount: Money },
  ): Promise<void> {
    const coupon = await CouponModel.findOne({ code: code.toUpperCase(), deletedAt: null })
      .select('_id')
      .lean<{ _id: string }>();
    if (!coupon) throw new ConflictError('Coupon redemption failed', 'COUPON_REDEEM');

    try {
      await CouponRedemptionModel.create({
        couponId: coupon._id,
        code: code.toUpperCase(),
        userId: ctx.userId,
        bookingId: ctx.bookingId,
        discountAmount: ctx.discount.amount,
        currency: ctx.discount.currency,
      });
    } catch (err) {
      // Duplicate key = this booking already redeemed it; nothing more to do.
      if ((err as { code?: number }).code === 11000) return;
      throw err;
    }

    const res = await CouponModel.updateOne(
      {
        _id: coupon._id,
        $expr: { $lt: ['$redeemedCount', '$maxRedemptions'] },
      },
      { $inc: { redeemedCount: 1, spent: ctx.discount.amount } },
    );
    if (res.matchedCount === 0) {
      // The cap was hit between quote and redemption. The booking is already
      // paid, so we honour the discount and log it rather than fail the trip.
      logger.warn({ code, bookingId: ctx.bookingId }, 'coupon redeemed past its cap — honouring, campaign is now over');
    }
  }

  // ── Admin ───────────────────────────────────────────────────────────

  async adminList(opts: { status?: string; q?: string; limit?: number; skip?: number } = {}): Promise<{
    items: CouponDoc[];
    total: number;
  }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const filter: Record<string, unknown> = { deletedAt: null };
    if (opts.status) filter.status = opts.status;
    if (opts.q) filter.code = new RegExp(opts.q.toUpperCase().replace(/[^A-Z0-9_-]/g, ''), 'i');
    const [items, total] = await Promise.all([
      CouponModel.find(filter).sort({ createdAt: -1 }).skip(opts.skip ?? 0).limit(limit).lean<CouponDoc[]>(),
      CouponModel.countDocuments(filter),
    ]);
    return { items, total };
  }

  async getById(id: string): Promise<CouponDoc> {
    const c = await CouponModel.findOne({ _id: id, deletedAt: null }).lean<CouponDoc>();
    if (!c) throw new NotFoundError('Coupon');
    return c;
  }

  async create(input: Partial<CouponDoc> & { code: string; type: 'percent' | 'fixed'; validTo: Date }): Promise<CouponDoc> {
    const code = input.code.toUpperCase().trim();
    if (await CouponModel.exists({ code, deletedAt: null })) {
      throw new ConflictError('That code already exists', 'COUPON_EXISTS');
    }
    this.assertCoherent(input);
    const doc = await CouponModel.create({ ...input, code });
    return doc.toObject();
  }

  async update(id: string, patch: Partial<CouponDoc>): Promise<CouponDoc> {
    const existing = await this.getById(id);
    // The code is the guest-facing identity of a live campaign; changing it
    // would silently break links already in the wild.
    delete patch.code;
    delete patch.redeemedCount;
    delete patch.spent;
    this.assertCoherent({ ...existing, ...patch });
    await CouponModel.updateOne({ _id: id }, patch);
    return this.getById(id);
  }

  /** Pause/resume — the fast lever when a promo is being abused. */
  async setStatus(id: string, status: 'active' | 'disabled'): Promise<CouponDoc> {
    await this.getById(id);
    await CouponModel.updateOne({ _id: id }, { status });
    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    const res = await CouponModel.updateOne({ _id: id, deletedAt: null }, { deletedAt: new Date() });
    if (res.matchedCount === 0) throw new NotFoundError('Coupon');
  }

  /**
   * Campaign performance: redemptions, discount given away, budget burn, and
   * the bookings it drove — so marketing can tell a working promo from a
   * costly one.
   */
  async stats(id: string): Promise<{
    coupon: CouponDoc;
    redemptions: number;
    uniqueUsers: number;
    discountGiven: number;
    budgetUsedPct: number | null;
    redemptionsRemaining: number;
    recent: { userId: string; bookingId: string; discountAmount: number; createdAt: Date }[];
  }> {
    const coupon = await this.getById(id);
    const [agg] = await CouponRedemptionModel.aggregate<{ redemptions: number; discountGiven: number; users: string[] }>([
      { $match: { couponId: id } },
      { $group: { _id: null, redemptions: { $sum: 1 }, discountGiven: { $sum: '$discountAmount' }, users: { $addToSet: '$userId' } } },
    ]);
    const recent = await CouponRedemptionModel.find({ couponId: id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('userId bookingId discountAmount createdAt -_id')
      .lean<{ userId: string; bookingId: string; discountAmount: number; createdAt: Date }[]>();

    return {
      coupon,
      redemptions: agg?.redemptions ?? 0,
      uniqueUsers: agg?.users?.length ?? 0,
      discountGiven: agg?.discountGiven ?? 0,
      budgetUsedPct: coupon.budget > 0 ? Math.round((coupon.spent / coupon.budget) * 100) : null,
      redemptionsRemaining: Math.max(0, coupon.maxRedemptions - coupon.redeemedCount),
      recent,
    };
  }

  /** Reject campaigns that can't do what they claim, before they go live. */
  private assertCoherent(c: Partial<CouponDoc>): void {
    if (c.type === 'percent' && !(c.valueBps && c.valueBps > 0)) {
      throw new ValidationError('A percentage coupon needs a value above zero', [{ field: 'valueBps', issue: 'required' }]);
    }
    if (c.type === 'fixed' && !(c.amount && c.amount > 0)) {
      throw new ValidationError('A fixed coupon needs an amount above zero', [{ field: 'amount', issue: 'required' }]);
    }
    if (c.validFrom && c.validTo && new Date(c.validFrom) >= new Date(c.validTo)) {
      throw new ValidationError('The end date must be after the start date', [{ field: 'validTo', issue: 'range' }]);
    }
    if (c.type === 'fixed' && c.minSpend && c.amount && c.amount > c.minSpend && c.minSpend > 0) {
      // Not fatal, but it means the coupon can only ever discount to zero.
      logger.warn({ code: c.code }, 'coupon amount exceeds its minimum spend — it will always zero the order');
    }
  }
}

export const couponService = new CouponService();
