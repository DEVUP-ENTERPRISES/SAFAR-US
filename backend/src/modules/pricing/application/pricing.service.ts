import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { money, zeroMoney, addMoney, subMoney, applyBps, sumMoney } from '../../../core/types/money';
import type { IPricingContract, QuoteInput, PriceBreakdown } from '../../../core/contracts/pricing.contract';
import { couponService } from '../../coupons/application/coupon.service';
import { taxService } from '../../tax/application/tax.service';
import { getProtectionPlan } from '../domain/protection-plans';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { surgeService } from './surge.service';
import { subscriptionService } from '../../subscriptions/application/subscription.service';
import type { Money } from '../../../core/types/money';

// Platform economics are NOT constants — commission, tax, protection pricing and
// the early-bird / last-minute windows are all resolved live from PlatformConfig
// so finance can retune the marketplace from the admin panel without a deploy.

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

    // Live platform economics (commission, tax, and the early-bird / last-minute
    // windows) — one read, used throughout.
    const cfg = await platformConfigService.get();

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

    // ── Early-bird / last-minute (mutually exclusive; windows from config).
    const hoursAhead = (input.start.getTime() - Date.now()) / 3_600_000;
    if (hoursAhead >= cfg.pricing.earlyBirdMinDaysAhead * 24 && v.pricing.earlyBirdBps > 0) {
      discount = addMoney(discount, applyBps(base, v.pricing.earlyBirdBps));
    } else if (hoursAhead <= cfg.pricing.lastMinuteMaxHoursAhead && v.pricing.lastMinuteBps > 0) {
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
      // Full context so targeting rules (first-time guest, city, category, trip
      // length, per-user limit) are judged at quote time, not just redemption —
      // a guest must never be shown a discount that later disappears.
      const couponOff = await couponService.computeDiscount(input.couponCode, afterOthers, {
        userId: input.guestId,
        city: v.location?.city,
        category: v.category,
        tripDays: days,
      });
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
    const resolved = await platformConfigService.resolveCommission({
      hostId: v.hostId,
      category: v.category,
      hostTier: v.hostIsSuperhost ? 'superhost' : undefined,
    });

    const commission = applyBps(subtotal, resolved.bps);
    const tax = applyBps(commission, cfg.tax.bps);
    const hostEarnings = subMoney(subMoney(subtotal, commission), tax);

    /*
     * Rental tax, charged to the guest on top and remitted by us.
     *
     * Distinct from `tax` above, which is a platform levy on our own commission
     * taken out of host earnings. Rental tax is the guest's, resolved from where
     * the car actually changes hands — an airport handover attracts a concession
     * fee that the same car in a suburb does not.
     */
    const { lines: taxLines, total: taxTotal } = await taxService.quote(subtotal, {
      state: v.location?.state,
      city: v.location?.city,
      days,
      // An airport handover attracts a concession fee the same car in a suburb
      // does not, so the terminal is part of the tax context.
      airportCode:
        input.delivery?.mode === 'airport' ? extractAirportCode(input.delivery.address) : undefined,
    });

    // Guest pays host-side + protection + rental tax.
    const total = addMoney(addMoney(subtotal, protection), taxTotal);

    // Balance guard on the host-side split (protection handled separately at charge).
    const recomposed = sumMoney([hostEarnings, commission, tax], currency);
    if (recomposed.amount !== subtotal.amount) hostEarnings.amount += subtotal.amount - recomposed.amount;

    return {
      days, base, cleaningFee, discount, addOnsTotal, delivery, protection,
      taxLines, taxTotal,
      protectionPlan: plan.code, selectedAddOns,
      subtotal, commission, tax, hostEarnings, total, currency,
      // Which rate applied and why — makes every quote explainable in support.
      commissionBps: resolved.bps,
      commissionSource: resolved.source,
      surgeDays,
      surgeSource,
      memberSavings,
      memberPlan: memberSub?.planCode,
      // Only computed for non-members: a member is already getting the benefit,
      // and telling them what they would save by joining is nonsense.
      memberOffer: memberSub ? undefined : await bestMemberOffer(base),
    };
  }
}

export const pricingService = new PricingService();

/**
 * The best membership saving available on this trip's base.
 *
 * Ranked by what the guest actually saves here, not by plan price — the
 * cheapest plan often wins on a short trip, and recommending the expensive one
 * regardless would be selling rather than helping.
 *
 * Returns undefined when no plan would save anything, so the UI shows nothing
 * rather than "save $0".
 */
async function bestMemberOffer(
  base: Money,
): Promise<{ planCode: string; planName: string; monthlyCents: number; savings: Money } | undefined> {
  try {
    const plans = await subscriptionService.listPlans();
    let best: { planCode: string; planName: string; monthlyCents: number; savings: Money } | undefined;

    for (const p of plans) {
      if (!p.active || p.priceCents <= 0) continue;
      const savings = applyBps(base, p.benefits.bookingDiscountBps ?? 0);
      if (savings.amount <= 0) continue;
      if (!best || savings.amount > best.savings.amount) {
        best = { planCode: p.code, planName: p.name, monthlyCents: p.priceCents, savings };
      }
    }
    // Only worth showing when the trip saves more than the month costs.
    if (best && best.savings.amount < best.monthlyCents) return undefined;
    return best;
  } catch {
    // A quote must never fail because the membership lookup did.
    return undefined;
  }
}

/**
 * Pull an airport code out of a delivery address.
 *
 * Guests type "DFW Terminal C" or "Dallas Fort Worth (DFW)". A three-letter
 * token in caps is the reliable signal; anything else means no airport rule
 * applies, which fails safe by charging less rather than inventing a fee.
 */
function extractAirportCode(address?: string): string | undefined {
  if (!address) return undefined;
  const m = /([A-Z]{3})/.exec(address.toUpperCase());
  return m?.[1];
}
