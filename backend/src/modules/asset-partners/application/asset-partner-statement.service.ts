import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { assetPartnerService, type ResolvedPartnerTerms } from './asset-partner.service';
import { assetPartnerTermsService } from './asset-partner-terms.service';
import type { AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { AssetPartnerPayoutModel } from '../infrastructure/asset-partner-payout.model';

/**
 * What an Asset Partner is actually owed, worked out the way the published
 * terms say — NOT the way a host is paid.
 *
 * A host earns per booking: subtotal − commission − tax, paid out after each
 * trip's hold window. Reusing that for a partner overstates their income,
 * because two of the three deductions in the partner agreement are recurring
 * monthly costs per vehicle that no commission rate can represent:
 *
 *   gross booking revenue      (trips completed in the month)
 *   − management fee (20%)
 *   − Roamly fleet insurance   ($137 per vehicle per month)
 *   − professional detailing   ($50 per vehicle per month)
 *   = partner net              (paid on the 5th, by check or Zelle)
 *
 * "Gross booking revenue" is the host-side subtotal: rental + cleaning +
 * extras + delivery. It deliberately excludes the guest service fee and rental
 * tax, which are the platform's and the state's, never the partner's.
 *
 * Trips are attributed to the month they COMPLETED in, matching "covering
 * trips completed the prior month".
 */

export interface StatementLine {
  vehicleId: string;
  label: string;
  trips: number;
  gross: number;
  managementFee: number;
  insurance: number;
  detailing: number;
  net: number;
}

export interface PartnerStatement {
  /** 'YYYY-MM' — the month trips completed in. */
  period: string;
  currency: string;
  terms: ResolvedPartnerTerms;
  lines: StatementLine[];
  totals: {
    trips: number;
    gross: number;
    managementFee: number;
    insurance: number;
    detailing: number;
    net: number;
  };
  /** When this month's net is scheduled to reach the partner. */
  payoutDate: Date;
  payoutMethod: string;
  /** False while the month is still running — the figures can still move. */
  final: boolean;
  /** Every management-fee rate applied this month, in basis points. */
  managementFeeBpsUsed: number[];
  /** Set once CatoDrive has recorded sending this month's money. */
  paid?: { amount: number; method: string; reference: string; paidAt: Date };
}

/** Inclusive-start, exclusive-end bounds for a 'YYYY-MM' period. */
function monthBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export class AssetPartnerStatementService {
  /**
   * One month's statement for one partner.
   *
   * Recurring costs are charged per vehicle that was in the programme for that
   * month, whether or not it earned: insurance and detailing are incurred by
   * holding the car, not by renting it. A car that sat idle still shows its
   * $137 and $50, which is exactly what the partner's paper statement shows —
   * hiding them would make a negative month look like a break-even one.
   */
  async statement(partner: AssetPartnerDoc, period = currentPeriod()): Promise<PartnerStatement> {
    const { start, end } = monthBounds(period);
    // Fixed monthly charges follow the terms at the start of the month; each trip's fee follows the rate on the day it ended.
    const [terms, rateAt] = await Promise.all([
      assetPartnerService.termsFor(partner, new Date(Math.min(start.getTime(), Date.now()))),
      assetPartnerTermsService.timeline(partner),
    ]);

    const vehicles = (await VehicleModel.find({ assetPartnerId: partner._id })
      .select('_id year make model trim createdAt assetPartnerSince assetPartnerEndedAt')
      .lean<{ _id: string; year: number; make: string; model: string; trim?: string; createdAt: Date; assetPartnerSince?: Date; assetPartnerEndedAt?: Date }[]>())
      // A car counts for a month only if it was in the programme during it.
      .filter((v) => new Date(v.assetPartnerSince ?? v.createdAt) < end && (!v.assetPartnerEndedAt || new Date(v.assetPartnerEndedAt) >= start));

    const trips = await BookingModel.find({
      vehicleId: { $in: vehicles.map((v) => v._id) },
      status: 'completed',
      'period.end': { $gte: start, $lt: end },
    })
      .select('vehicleId period.end priceBreakdown.subtotal.amount')
      .lean<{ vehicleId: string; period: { end: Date }; priceBreakdown: { subtotal?: { amount: number } } }[]>();

    const byVehicle = new Map<string, { trips: number; gross: number; fee: number }>();
    const ratesUsed = new Set<number>();
    for (const t of trips) {
      const gross = t.priceBreakdown.subtotal?.amount ?? 0;
      const bps = rateAt(new Date(t.period.end)).managementFeeBps;
      ratesUsed.add(bps);
      const row = byVehicle.get(t.vehicleId) ?? { trips: 0, gross: 0, fee: 0 };
      row.trips += 1;
      row.gross += gross;
      row.fee += Math.round((gross * bps) / 10_000);
      byVehicle.set(t.vehicleId, row);
    }

    const lines: StatementLine[] = vehicles
      .map((v) => {
        const r = byVehicle.get(v._id);
        const gross = r?.gross ?? 0;
        const managementFee = r?.fee ?? 0;
        const insurance = terms.insuranceMonthlyCents;
        const detailing = terms.detailingMonthlyCents;
        return {
          vehicleId: v._id,
          label: `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ''}`,
          trips: r?.trips ?? 0,
          gross,
          managementFee,
          insurance,
          detailing,
          net: gross - managementFee - insurance - detailing,
        };
      });

    const sum = (pick: (l: StatementLine) => number) => lines.reduce((s, l) => s + pick(l), 0);

    // Paid on the configured day of the month AFTER the month being reported.
    const [y, m] = period.split('-').map(Number);
    const payoutDate = new Date(Date.UTC(y, m, terms.payoutDayOfMonth));
    const paid = await AssetPartnerPayoutModel.findOne({ partnerId: partner._id, period }).select('amount method reference paidAt').lean<{ amount: number; method: string; reference: string; paidAt: Date }>();

    return {
      period,
      currency: 'USD',
      terms,
      // More than one value means the rate changed during this month.
      managementFeeBpsUsed: [...ratesUsed].sort((a, b) => a - b),
      lines,
      totals: {
        trips: sum((l) => l.trips),
        gross: sum((l) => l.gross),
        managementFee: sum((l) => l.managementFee),
        insurance: sum((l) => l.insurance),
        detailing: sum((l) => l.detailing),
        net: sum((l) => l.net),
      },
      payoutDate,
      payoutMethod: terms.payoutMethod,
      final: period !== currentPeriod(),
      ...(paid ? { paid: { amount: paid.amount, method: paid.method, reference: paid.reference, paidAt: paid.paidAt } } : {}),
    };
  }

  /**
   * The last `months` statements, newest first — the partner's earnings
   * history and the source of their monthly chart.
   */
  async history(partner: AssetPartnerDoc, months = 6): Promise<PartnerStatement[]> {
    const now = new Date();
    const periods = Array.from({ length: months }, (_, i) =>
      currentPeriod(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))),
    );
    return Promise.all(periods.map((p) => this.statement(partner, p)));
  }
}

export const assetPartnerStatementService = new AssetPartnerStatementService();
