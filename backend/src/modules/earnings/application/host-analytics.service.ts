import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { AvailabilityModel } from '../../availability/infrastructure/availability.model';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { hostService } from '../../hosts/application/host.service';

/**
 * Host performance, derived from real bookings and the ledger — the numbers a
 * host needs to run their business: what's trending, which cars pull their
 * weight, how full the fleet is, and how often they say yes.
 */
export class HostAnalyticsService {
  async performance(userId: string): Promise<{
    currency: string;
    earningsByMonth: { month: string; amount: number }[];
    perVehicle: { vehicleId: string; label: string; trips: number; revenue: number }[];
    occupancyPct: number; // next 30 days across all listed vehicles
    acceptanceRate: number; // % of booking requests the host honoured
    cancellationRatePct: number; // % of committed trips the host cancelled
    completedTrips: number;
    cancelledByHost: number;
  }> {
    const host = await hostService.requireHostForUser(userId);
    const hostId = host._id;

    const vehicles = await VehicleModel.find({ hostId, deletedAt: null }).lean<VehicleDoc[]>();
    const vehicleIds = vehicles.map((v) => v._id);
    const label = new Map(vehicles.map((v) => [v._id, `${v.make} ${v.model}`]));

    const [earningsByMonth, perVehicleAgg, occupancyPct, accept, cancel] = await Promise.all([
      // host_payable is debit-normal: earnings are the debits.
      ledgerService.monthlyDebits(Account.hostPayable(hostId), 6),
      this.perVehicleRevenue(vehicleIds),
      this.occupancy(vehicleIds),
      this.acceptance(hostId),
      this.cancellation(hostId),
    ]);

    const perVehicle = perVehicleAgg
      .map((r) => ({ vehicleId: r._id, label: label.get(r._id) ?? '—', trips: r.trips, revenue: r.revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      currency: 'USD',
      earningsByMonth,
      perVehicle,
      occupancyPct,
      acceptanceRate: accept.rate,
      cancellationRatePct: cancel.rate,
      completedTrips: accept.completed,
      cancelledByHost: cancel.hostCancelled,
    };
  }

  /** Cancellation rate = trips the host cancelled after committing, vs settled. */
  private async cancellation(hostId: string): Promise<{ rate: number; hostCancelled: number }> {
    const rows = await BookingModel.aggregate<{ _id: string; n: number }>([
      { $match: { hostId, status: { $in: ['completed', 'cancelled_host'] } } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]).exec();
    const completed = rows.find((r) => r._id === 'completed')?.n ?? 0;
    const hostCancelled = rows.find((r) => r._id === 'cancelled_host')?.n ?? 0;
    const denom = completed + hostCancelled;
    return { rate: denom ? Math.round((hostCancelled / denom) * 100) : 0, hostCancelled };
  }

  /** Revenue + trip count per vehicle, from bookings that generated income. */
  private async perVehicleRevenue(
    vehicleIds: string[],
  ): Promise<{ _id: string; trips: number; revenue: number }[]> {
    if (vehicleIds.length === 0) return [];
    return BookingModel.aggregate<{ _id: string; trips: number; revenue: number }>([
      { $match: { vehicleId: { $in: vehicleIds }, status: { $in: ['paid', 'in_progress', 'completed'] } } },
      {
        $group: {
          _id: '$vehicleId',
          trips: { $sum: 1 },
          revenue: { $sum: '$priceBreakdown.hostEarnings.amount' },
        },
      },
    ]).exec();
  }

  /** % of vehicle-days booked over the next 30 days. */
  private async occupancy(vehicleIds: string[]): Promise<number> {
    if (vehicleIds.length === 0) return 0;
    const key = (d: Date) => d.toISOString().slice(0, 10);
    const from = key(new Date());
    const to = key(new Date(Date.now() + 30 * 86_400_000));

    const capacity = vehicleIds.length * 30;
    // Availability stores one row per booked/held/blocked day, keyed 'YYYY-MM-DD'.
    const booked = await AvailabilityModel.countDocuments({
      vehicleId: { $in: vehicleIds },
      state: { $in: ['booked', 'held'] },
      dayKey: { $gte: from, $lte: to },
    });
    return capacity ? Math.min(100, Math.round((booked / capacity) * 100)) : 0;
  }

  /** Acceptance = completed vs (completed + host-driven cancellations). */
  private async acceptance(
    hostId: string,
  ): Promise<{ rate: number; completed: number; hostCancelled: number }> {
    const rows = await BookingModel.aggregate<{ _id: string; n: number }>([
      { $match: { hostId, status: { $in: ['completed', 'cancelled', 'declined'] } } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]).exec();
    const by = (s: string) => rows.find((r) => r._id === s)?.n ?? 0;
    const completed = by('completed');
    const hostCancelled = by('declined'); // host declined a request
    const denom = completed + hostCancelled;
    return {
      rate: denom ? Math.round((completed / denom) * 100) : 100,
      completed,
      hostCancelled,
    };
  }
}

export const hostAnalyticsService = new HostAnalyticsService();
