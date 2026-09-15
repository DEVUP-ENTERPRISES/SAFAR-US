import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { assetPartnerService, type ResolvedPartnerTerms } from './asset-partner.service';
import type { AssetPartnerDoc } from '../infrastructure/asset-partner.model';

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
    const terms = await assetPartnerService.termsFor(partner);
    const { start, end } = monthBounds(period);

    const vehicles = await VehicleModel.find({ assetPartnerId: partner._id })
      .select('_id year make model trim createdAt')
      .lean<{ _id: string; year: number; make: string; model: string; trim?: string; createdAt: Date }[]>();

    const revenue = await BookingModel.aggregate<{ _id: string; trips: number; gross: number }>([
      {
        $match: {
          vehicleId: { $in: vehicles.map((v) => v._id) },
          status: 'completed',
          'period.end': { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: '$vehicleId',
          trips: { $sum: 1 },
          gross: { $sum: '$priceBreakdown.subtotal.amount' },
        },
      },
    ]).exec();

    const byVehicle = new Map(revenue.map((r) => [r._id, r]));

    const lines: StatementLine[] = vehicles
      // A car onboarded after this month ended was not in the programme yet,
      // so it must not be charged that month's insurance or detailing.
      .filter((v) => new Date(v.createdAt) < end)
      .map((v) => {
        const r = byVehicle.get(v._id);
        const gross = r?.gross ?? 0;
        const managementFee = Math.round((gross * terms.managementFeeBps) / 10_000);
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

    return {
      period,
      currency: 'USD',
      terms,
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
