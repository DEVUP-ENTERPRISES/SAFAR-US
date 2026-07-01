import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { NotFoundError } from '../../../core/errors/app-error';
import { money, zeroMoney, addMoney, subMoney, applyBps, sumMoney } from '../../../core/types/money';
import type { IPricingContract, QuoteInput, PriceBreakdown } from '../../../core/contracts/pricing.contract';
import { couponService } from '../../coupons/application/coupon.service';

/** Platform economics (would live in settings/feature-flags in prod). */
const COMMISSION_BPS = 2000; // 20% platform take from host portion
const TAX_BPS = 1800; // 18% GST on commission
const EARLY_BIRD_MIN_DAYS_AHEAD = 30;
const LAST_MINUTE_MAX_HOURS_AHEAD = 48;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function seasonalMultiplierFor(day: Date, rules: VehicleDoc['pricing']['seasonalRules']): number {
  const key = dateKey(day);
  for (const r of rules ?? []) {
    if (key >= r.start && key <= r.end) return r.multiplierBps;
  }
  return 0;
}

/**
 * Single entry point for pricing. Applies the full engine: per-day base with
 * weekend + seasonal multipliers, length discounts (weekly/monthly), early-bird
 * and last-minute discounts, promo, then coupon. The interface is the seam for
 * a future demand/ML model — callers never change.
 */
export class PricingService implements IPricingContract {
  async quote(input: QuoteInput): Promise<PriceBreakdown> {
    const v = await VehicleModel.findOne({ _id: input.vehicleId, deletedAt: null }).lean<VehicleDoc>();
    if (!v) throw new NotFoundError('Vehicle');

    const currency = v.pricing.currency;
    const daily = v.pricing.dailyPrice;

    // ── Per-day base: weekend + seasonal multipliers applied per calendar day.
    let baseAmount = 0;
    let days = 0;
    const d = new Date(
      Date.UTC(input.start.getUTCFullYear(), input.start.getUTCMonth(), input.start.getUTCDate()),
    );
    const last = new Date(
      Date.UTC(input.end.getUTCFullYear(), input.end.getUTCMonth(), input.end.getUTCDate()),
    );
    while (d <= last) {
      const dow = d.getUTCDay();
      const isWeekend = dow === 0 || dow === 6;
      const weekendMult = isWeekend ? v.pricing.weekendMultiplierBps : 10000;
      const seasonalBps = seasonalMultiplierFor(d, v.pricing.seasonalRules);
      const seasonalMult = seasonalBps > 0 ? seasonalBps : 10000;
      baseAmount += Math.round((daily * weekendMult * seasonalMult) / 10000 / 10000);
      days++;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    const base = money(baseAmount, currency);

    // ── Length-of-trip discount: monthly beats weekly.
    let discount = zeroMoney(currency);
    if (days >= 28 && v.pricing.monthlyDiscountBps > 0) {
      discount = applyBps(base, v.pricing.monthlyDiscountBps);
    } else if (days >= 7 && v.pricing.weeklyDiscountBps > 0) {
      discount = applyBps(base, v.pricing.weeklyDiscountBps);
    }

    // ── Early-bird / last-minute (mutually exclusive).
    const hoursAhead = (input.start.getTime() - Date.now()) / 3_600_000;
    if (hoursAhead >= EARLY_BIRD_MIN_DAYS_AHEAD * 24 && v.pricing.earlyBirdBps > 0) {
      discount = addMoney(discount, applyBps(base, v.pricing.earlyBirdBps));
    } else if (hoursAhead <= LAST_MINUTE_MAX_HOURS_AHEAD && v.pricing.lastMinuteBps > 0) {
      discount = addMoney(discount, applyBps(base, v.pricing.lastMinuteBps));
    }

    // ── Promotional discount.
    if (v.pricing.promoActive && v.pricing.promoDiscountBps > 0) {
      discount = addMoney(discount, applyBps(base, v.pricing.promoDiscountBps));
    }

    // ── Coupon (stacks last).
    if (input.couponCode) {
      const afterOthers = subMoney(base, discount);
      const couponOff = await couponService.computeDiscount(input.couponCode, afterOthers);
      discount = addMoney(discount, couponOff);
    }

    // Never discount below zero.
    if (discount.amount > base.amount) discount = { ...base };

    const cleaningFee = money(v.pricing.cleaningFee, currency);
    const subtotal = addMoney(subMoney(base, discount), cleaningFee);

    const commission = applyBps(subtotal, COMMISSION_BPS);
    const tax = applyBps(commission, TAX_BPS);
    const hostEarnings = subMoney(subMoney(subtotal, commission), tax);
    const total = subtotal;

    const recomposed = sumMoney([hostEarnings, commission, tax], currency);
    if (recomposed.amount !== total.amount) hostEarnings.amount += total.amount - recomposed.amount;

    return { days, base, cleaningFee, discount, subtotal, commission, tax, hostEarnings, total, currency };
  }
}

export const pricingService = new PricingService();
