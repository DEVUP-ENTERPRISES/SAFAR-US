import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { money, zeroMoney, addMoney, subMoney, applyBps, sumMoney } from '../../../core/types/money';
import type { IPricingContract, QuoteInput, PriceBreakdown } from '../../../core/contracts/pricing.contract';
import { couponService } from '../../coupons/application/coupon.service';
import { getProtectionPlan } from '../domain/protection-plans';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { surgeService } from './surge.service';
import { subscriptionService } from '../../subscriptions/application/subscription.service';

// Platform economics are NOT constants — commission, tax and protection pricing
// are resolved live from PlatformConfig + CommissionRules so finance can retune
// the marketplace from the admin panel without a deploy.
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

    // Membership (CATO Plus) benefits — resolved once, applied throughout.
    const member = input.guestId
      ? await subscriptionService.benefitsFor(input.guestId)
      : { bookingDiscountBps: 0, waiveSurge: false, rewardsMultiplierBps: 10000 };
    const memberSub = input.guestId ? await subscriptionService.activeFor(input.guestId) : null;

    // ── Per-day base: weekend + seasonal + SURGE, applied per calendar day.
    // Surge is date-scoped (a holiday weekend, a sold-out city), so it must be
    // resolved per day — not once for the whole trip.
    let baseAmount = 0;
    let days = 0;
    let surgeDays = 0;
    let surgeSource = 'none';
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

      const surge = await surgeService.resolve({
        city: v.location?.city,
        category: v.category,
        day: new Date(d),
      });
      // CATO Plus members never pay surge.
      const surgeMult = member.waiveSurge ? 10000 : surge.multiplierBps;
      if (surgeMult > 10000) {
        surgeDays++;
        surgeSource = surge.source;
      }

      baseAmount += Math.round(
        (daily * weekendMult * seasonalMult * surgeMult) / 10000 / 10000 / 10000,
      );
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

    // ── Membership discount (CATO Plus). Tracked separately so we can show the
    // guest exactly what their membership saved them on this trip.
    let memberSavings = zeroMoney(currency);
    if (member.bookingDiscountBps > 0) {
      memberSavings = applyBps(base, member.bookingDiscountBps);
      discount = addMoney(discount, memberSavings);
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

    // ── Add-ons (host-defined extras the guest selected).
    const selectedAddOns = (v.addOns ?? [])
      .filter((a) => (input.addOnCodes ?? []).includes(a.code))
      .map((a) => ({
        code: a.code,
        label: a.label,
        amount: money(a.priceType === 'per_day' ? a.amount * days : a.amount, currency),
      }));
    const addOnsTotal = sumMoney(selectedAddOns.map((a) => a.amount), currency);

    // ── Delivery: the host brings the car to the guest for a flat fee. Only
    // valid if the vehicle actually offers that delivery mode — otherwise a
    // guest could conjure a $0 (or any) delivery the host never agreed to.
    let delivery = zeroMoney(currency);
    if (input.delivery) {
      const d = v.listing?.delivery;
      const offered = !!d && !!d[input.delivery.mode];
      if (!offered) {
        throw new ValidationError(`This car does not offer ${input.delivery.mode} delivery`);
      }
      delivery = money(d.fee, currency);
    }

    // ── Protection plan (priced from live config, not a code constant).
    // A member's included tier is free; anything above it they still pay for.
    const plan = await getProtectionPlan(input.protectionPlan);
    const includedFree = !!member.freeProtectionCode && member.freeProtectionCode === plan.code;
    const protection = includedFree ? zeroMoney(currency) : money(plan.pricePerDay * days, currency);
    if (includedFree) {
      memberSavings = addMoney(memberSavings, money(plan.pricePerDay * days, currency));
    }

    // Host-side subtotal (rental + cleaning + add-ons + delivery) → commission is
    // taken on this. Delivery is the host's labour, so it earns like host income.
    const subtotal = addMoney(
      addMoney(addMoney(subMoney(base, discount), cleaningFee), addOnsTotal),
      delivery,
    );

    // ── Commission: resolved per booking from the rule engine. A luxury car, a
    // superhost, or a negotiated fleet host can each carry a different rate.
    const cfg = await platformConfigService.get();
    const resolved = await platformConfigService.resolveCommission({
      hostId: v.hostId,
      category: v.category,
      hostTier: v.hostIsSuperhost ? 'superhost' : undefined,
    });

    const commission = applyBps(subtotal, resolved.bps);
    const tax = applyBps(commission, cfg.tax.bps);
    const hostEarnings = subMoney(subMoney(subtotal, commission), tax);

    // Guest pays host-side + protection (protection accrues to platform/insurer).
    const total = addMoney(subtotal, protection);

    // Balance guard on the host-side split (protection handled separately at charge).
    const recomposed = sumMoney([hostEarnings, commission, tax], currency);
    if (recomposed.amount !== subtotal.amount) hostEarnings.amount += subtotal.amount - recomposed.amount;

    return {
      days, base, cleaningFee, discount, addOnsTotal, delivery, protection,
      protectionPlan: plan.code, selectedAddOns,
      subtotal, commission, tax, hostEarnings, total, currency,
      // Which rate applied and why — makes every quote explainable in support.
      commissionBps: resolved.bps,
      commissionSource: resolved.source,
      surgeDays,
      surgeSource,
      memberSavings,
      memberPlan: memberSub?.planCode,
    };
  }
}

export const pricingService = new PricingService();
