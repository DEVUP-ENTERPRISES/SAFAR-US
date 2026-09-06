import { FleetModel, type FleetDoc } from '../infrastructure/fleet.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { AvailabilityModel } from '../../availability/infrastructure/availability.model';
import { hostService } from '../../hosts/application/host.service';
import { bookingReportingService } from '../../bookings/application/booking-reporting.service';
import { maintenanceService } from '../../maintenance/application/maintenance.service';
import { ForbiddenError, NotFoundError } from '../../../core/errors/app-error';

export interface FleetDashboard {
  fleetId: string;
  name: string;
  totalVehicles: number;
  listedVehicles: number;
  totalTrips: number;
  avgRating: number;
  occupancyPct: number; // next 30 days
  revenue: number; // lifetime host earnings across fleet vehicles
}

export interface VehiclePnl {
  vehicleId: string;
  label: string;
  trips: number;
  grossRevenue: number;
  commission: number;
  hostEarnings: number;
  maintenanceCost: number;
  netProfit: number;
}

export interface FleetProfitability {
  fleetId: string;
  name: string;
  currency: string;
  totals: {
    grossRevenue: number;
    commission: number;
    hostEarnings: number;
    maintenanceCost: number;
    netProfit: number;
    marginBps: number;
  };
  vehicles: VehiclePnl[];
}

export class FleetService {
  async create(userId: string, name: string, region?: string, group?: string): Promise<FleetDoc> {
    const host = await hostService.requireHostForUser(userId);
    const fleet = await FleetModel.create({ hostId: host._id, name, region, group });
    return fleet.toObject();
  }

  async listForHost(userId: string): Promise<FleetDoc[]> {
    const host = await hostService.requireHostForUser(userId);
    return FleetModel.find({ hostId: host._id, deletedAt: null }).sort({ createdAt: -1 }).lean<FleetDoc[]>();
  }

  async assignVehicle(userId: string, fleetId: string, vehicleId: string): Promise<void> {
    const fleet = await this.getOwned(userId, fleetId);
    const vehicle = await VehicleModel.findOne({ _id: vehicleId }).lean();
    if (!vehicle) throw new NotFoundError('Vehicle');
    if (vehicle.hostId !== fleet.hostId) throw new ForbiddenError('Vehicle not owned by this host');
    await VehicleModel.updateOne({ _id: vehicleId }, { fleetId });
  }

  async dashboard(userId: string, fleetId: string): Promise<FleetDashboard> {
    const fleet = await this.getOwned(userId, fleetId);
    const vehicles = await VehicleModel.find({ fleetId, deletedAt: null }).lean();
    const vehicleIds = vehicles.map((v) => v._id);

    const listedVehicles = vehicles.filter((v) => v.status === 'listed').length;
    const ratedVehicles = vehicles.filter((v) => v.ratingCount > 0);
    const avgRating = ratedVehicles.length
      ? Math.round((ratedVehicles.reduce((s, v) => s + v.ratingAvg, 0) / ratedVehicles.length) * 100) / 100
      : 0;

    // Occupancy over the next 30 days = booked days / (vehicles * 30).
    let bookedDays = 0;
    if (vehicleIds.length) {
      const to = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      const from = new Date().toISOString().slice(0, 10);
      bookedDays = await AvailabilityModel.countDocuments({
        vehicleId: { $in: vehicleIds },
        state: 'booked',
        dayKey: { $gte: from, $lte: to },
      });
    }
    const capacity = vehicleIds.length * 30;
    const occupancyPct = capacity ? Math.round((bookedDays / capacity) * 100) : 0;

    const stats = vehicleIds.length
      ? await bookingReportingService.completedStatsForVehicles(vehicleIds)
      : { trips: 0, revenue: 0 };

    return {
      fleetId: fleet._id,
      name: fleet.name,
      totalVehicles: vehicles.length,
      listedVehicles,
      totalTrips: stats.trips,
      avgRating,
      occupancyPct,
      revenue: stats.revenue,
    };
  }

  /**
   * Fleet profitability (P&L): host earnings − maintenance cost = net profit,
   * with a per-vehicle breakdown. All figures in minor units (cents).
   */
  async profitability(userId: string, fleetId: string): Promise<FleetProfitability> {
    const fleet = await this.getOwned(userId, fleetId);
    const vehicles = await VehicleModel.find({ fleetId, deletedAt: null }).lean();
    const vehicleIds = vehicles.map((v) => v._id);

    const [earnings, costs] = await Promise.all([
      bookingReportingService.earningsByVehicle(vehicleIds),
      maintenanceService.costByVehicles(vehicleIds),
    ]);

    const perVehicle = vehicles.map((v) => {
      const e = earnings[v._id] ?? { trips: 0, gross: 0, commission: 0, tax: 0, hostEarnings: 0 };
      const maintenanceCost = costs[v._id] ?? 0;
      const net = e.hostEarnings - maintenanceCost;
      return {
        vehicleId: v._id,
        label: `${v.make} ${v.model}`,
        trips: e.trips,
        grossRevenue: e.gross,
        commission: e.commission,
        hostEarnings: e.hostEarnings,
        maintenanceCost,
        netProfit: net,
      };
    });

    const sum = (k: keyof (typeof perVehicle)[number]) =>
      perVehicle.reduce((acc, p) => acc + (p[k] as number), 0);

    const grossRevenue = sum('grossRevenue');
    const commission = sum('commission');
    const hostEarnings = sum('hostEarnings');
    const maintenanceCost = sum('maintenanceCost');
    const netProfit = hostEarnings - maintenanceCost;
    // Net margin vs gross revenue (basis points; 10000 = 100%).
    const marginBps = grossRevenue > 0 ? Math.round((netProfit / grossRevenue) * 10000) : 0;

    return {
      fleetId: fleet._id,
      name: fleet.name,
      currency: 'USD',
      totals: { grossRevenue, commission, hostEarnings, maintenanceCost, netProfit, marginBps },
      vehicles: perVehicle.sort((a, b) => b.netProfit - a.netProfit),
    };
  }

  private async getOwned(userId: string, fleetId: string): Promise<FleetDoc> {
    const host = await hostService.requireHostForUser(userId);
    const fleet = await FleetModel.findOne({ _id: fleetId, deletedAt: null }).lean<FleetDoc>();
    if (!fleet) throw new NotFoundError('Fleet');
    if (fleet.hostId !== host._id) throw new ForbiddenError('Not your fleet');
    return fleet;
  }
}

export const fleetService = new FleetService();
