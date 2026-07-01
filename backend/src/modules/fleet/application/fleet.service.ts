import { FleetModel, type FleetDoc } from '../infrastructure/fleet.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { AvailabilityModel } from '../../availability/infrastructure/availability.model';
import { hostService } from '../../hosts/application/host.service';
import { bookingService } from '../../bookings/application/booking.service';
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
      ? await bookingService.completedStatsForVehicles(vehicleIds)
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

  private async getOwned(userId: string, fleetId: string): Promise<FleetDoc> {
    const host = await hostService.requireHostForUser(userId);
    const fleet = await FleetModel.findOne({ _id: fleetId, deletedAt: null }).lean<FleetDoc>();
    if (!fleet) throw new NotFoundError('Fleet');
    if (fleet.hostId !== host._id) throw new ForbiddenError('Not your fleet');
    return fleet;
  }
}

export const fleetService = new FleetService();
