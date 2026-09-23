import { VehicleModel, type VehicleDoc } from '../infrastructure/vehicle.model';
import { hostService } from '../../hosts/application/host.service';
import { pricingService } from '../../pricing/application/pricing.service';
import { NotFoundError, ForbiddenError } from '../../../core/errors/app-error';

/** The trip lengths a host actually compares — mirrors Turo's own tiers. */
const TIERS: { key: string; label: string; days: number }[] = [
  { key: 'daily', label: '1-day trips', days: 1 },
  { key: '3day', label: '3-day trips', days: 3 },
  { key: 'weekly', label: '1-week trips', days: 7 },
  { key: '2week', label: '2-week trips', days: 14 },
  { key: '3week', label: '3-week trips', days: 21 },
  { key: 'monthly', label: 'Monthly trips', days: 30 },
];

export interface PricingTier {
  key: string;
  label: string;
  days: number;
  takeHome: number; // minor units
  currency: string;
  discountPct: number; // vs. the plain daily rate for this many days
  distanceKm: number | null; // null = unlimited
}

export const pricingPreviewService = {
  /**
   * What each standard trip length actually earns, run through the real quote
   * engine — not a client-side approximation. A host comparing "3% off" to
   * "$131 in your pocket" trusts the second number; it has to be true.
   */
  async forVehicle(userId: string, vehicleId: string): Promise<{ tiers: PricingTier[] }> {
    const vehicle = await VehicleModel.findOne({ _id: vehicleId, deletedAt: null }).lean<VehicleDoc>();
    if (!vehicle) throw new NotFoundError('Vehicle');

    const host = await hostService.requireHostForUser(userId);
    if (vehicle.hostId !== host._id) throw new ForbiddenError('Not your vehicle');

    // Tomorrow, so a quote never lands on a surge/seasonal date that happens
    // to include "today" and skews the preview.
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(10, 0, 0, 0);

    const perDayKm = vehicle.mileageLimit?.perDayKm ?? 0;

    const tiers = await Promise.all(
      TIERS.map(async (t) => {
        const end = new Date(start);
        end.setDate(end.getDate() + t.days);
        const quote = await pricingService.quote({ vehicleId, start, end });
        return {
          key: t.key,
          label: t.label,
          days: t.days,
          takeHome: quote.hostEarnings.amount,
          currency: quote.currency,
          // Compare against the tier's own undiscounted host take-home, not the
          // gross price — a host reads this as "what did the discount cost me".
          discountPct: tierDiscountPct(vehicle, t.days),
          distanceKm: perDayKm > 0 ? perDayKm * t.days : null,
        };
      }),
    );

    return { tiers };
  },
};

/** The stated discount for a trip of this length, straight from the config bps. */
function tierDiscountPct(vehicle: VehicleDoc, days: number): number {
  const p = vehicle.pricing;
  if (days >= 28) return Math.round((p.monthlyDiscountBps ?? 0) / 100);
  if (days >= 7) return Math.round((p.weeklyDiscountBps ?? 0) / 100);
  return 0;
}
