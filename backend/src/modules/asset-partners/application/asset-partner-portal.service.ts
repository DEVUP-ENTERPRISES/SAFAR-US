import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { assetPartnerService } from './asset-partner.service';
import {
  assetPartnerStatementService,
  type PartnerStatement,
} from './asset-partner-statement.service';
import { NotFoundError, ForbiddenError } from '../../../core/errors/app-error';
import type { PartnerVehicleSummary } from './asset-partner-application.service';

/**
 * The partner PORTAL — everything beyond the dashboard's front page: the
 * vehicle list as its own surface, one car's own history, and the full
 * statement archive. Kept apart from asset-partner-application.service, which
 * owns the application/enrolment lifecycle; this is the ongoing "my account"
 * side once someone is actually in the programme.
 */

export interface VehicleTripSummary {
  bookingId: string;
  code: string;
  status: string;
  start: Date;
  end: Date;
  /** Gross booking revenue for this trip, in minor units. */
  gross: number;
}

export interface PartnerVehicleDetail extends PartnerVehicleSummary {
  vin?: string;
  plate?: string;
  createdAt: Date;
  /** Recent trips on this car, newest first. `trips` (inherited) stays the
   *  numeric this-month count, matching every other portal surface. */
  recentTrips: VehicleTripSummary[];
  /** This car's net across recent months. */
  monthly: { period: string; net: number; gross: number }[];
}

const COMPLETED = ['completed', 'in_progress', 'paid', 'confirmed'];

export class AssetPartnerPortalService {
  /** 404s rather than silently returning nothing — a portal page needs to know
   *  "you are not a partner" from "this partner has no vehicles". */
  private async requirePartner(userId: string) {
    const partner = await assetPartnerService.getByUserId(userId);
    if (!partner) throw new ForbiddenError('Not an Asset Partner');
    return partner;
  }

  async vehicles(userId: string): Promise<PartnerVehicleSummary[]> {
    const partner = await this.requirePartner(userId);
    const [vehicles, statement] = await Promise.all([
      VehicleModel.find({ assetPartnerId: partner._id })
        .select('_id year make model trim status photos')
        .lean<
          {
            _id: string;
            year: number;
            make: string;
            model: string;
            trim?: string;
            status: string;
            photos?: { url: string; isCover?: boolean }[];
          }[]
        >(),
      assetPartnerStatementService.statement(partner),
    ]);
    const byVehicle = new Map(statement.lines.map((l) => [l.vehicleId, l]));
    return vehicles.map((v) => ({
      _id: v._id,
      year: v.year,
      make: v.make,
      model: v.model,
      trim: v.trim,
      status: v.status,
      photo: (v.photos ?? []).find((p) => p.isCover)?.url ?? v.photos?.[0]?.url,
      trips: byVehicle.get(v._id)?.trips ?? 0,
      gross: byVehicle.get(v._id)?.gross ?? 0,
      net: byVehicle.get(v._id)?.net ?? 0,
    }));
  }

  async vehicleDetail(userId: string, vehicleId: string): Promise<PartnerVehicleDetail> {
    const partner = await this.requirePartner(userId);
    const vehicle = await VehicleModel.findOne({ _id: vehicleId, assetPartnerId: partner._id }).lean<{
      _id: string;
      year: number;
      make: string;
      model: string;
      trim?: string;
      status: string;
      vin?: string;
      plate?: string;
      createdAt: Date;
      photos?: { url: string; isCover?: boolean }[];
    }>();
    // Not-found rather than forbidden: the id might belong to someone ELSE's
    // vehicle, which must read exactly like it doesn't exist.
    if (!vehicle) throw new NotFoundError('Vehicle');

    const [trips, history] = await Promise.all([
      BookingModel.find({ vehicleId, status: { $in: COMPLETED } })
        .sort({ 'period.start': -1 })
        .limit(20)
        .select('_id code status period priceBreakdown.subtotal')
        .lean<
          { _id: string; code: string; status: string; period: { start: Date; end: Date }; priceBreakdown: { subtotal: { amount: number } } }[]
        >(),
      assetPartnerStatementService.history(partner, 6),
    ]);

    const monthly = history
      .slice()
      .reverse()
      .map((s) => {
        const line = s.lines.find((l) => l.vehicleId === vehicleId);
        return { period: s.period, net: line?.net ?? 0, gross: line?.gross ?? 0 };
      });
    // THIS month's line — history() is newest-first, so index 0 is current,
    // NOT the last element. These are the summary numbers (matching
    // PartnerVehicleSummary on every other portal surface), never the
    // trip-list count below, which is "recent trips shown" and a different
    // question.
    const current = history[0]?.lines.find((l) => l.vehicleId === vehicleId);

    return {
      _id: vehicle._id,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      status: vehicle.status,
      vin: vehicle.vin,
      plate: vehicle.plate,
      createdAt: vehicle.createdAt,
      photo: (vehicle.photos ?? []).find((p) => p.isCover)?.url ?? vehicle.photos?.[0]?.url,
      trips: current?.trips ?? 0,
      gross: current?.gross ?? 0,
      net: current?.net ?? 0,
      recentTrips: trips.map((t) => ({
        bookingId: t._id,
        code: t.code,
        status: t.status,
        start: t.period.start,
        end: t.period.end,
        gross: t.priceBreakdown?.subtotal?.amount ?? 0,
      })),
      monthly,
    };
  }

  /** Full statement archive, newest first. */
  async statements(userId: string, months = 12): Promise<PartnerStatement[]> {
    const partner = await this.requirePartner(userId);
    return assetPartnerStatementService.history(partner, months);
  }
}

export const assetPartnerPortalService = new AssetPartnerPortalService();
