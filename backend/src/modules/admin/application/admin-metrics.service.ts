import { userRepository } from '../../users/infrastructure/user.repository';
import { hostService } from '../../hosts/application/host.service';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { bookingService } from '../../bookings/application/booking.service';
import { claimService } from '../../claims/application/claim.service';
import { ticketService } from '../../support/application/ticket.service';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';

export interface AdminMetrics {
  users: { total: number; active: number; suspended: number; newThisWeek: number };
  hosts: { total: number; pending: number; verified: number };
  vehicles: { total: number; listed: number; pendingVerification: number };
  bookings: { total: number; byStatus: { status: string; count: number }[]; gmv: number };
  claims: { open: number };
  tickets: { open: number };
  revenue: { platform: number; currency: string };
}

/** Real-time platform metrics — all derived from live collections & ledger. */
export class AdminMetricsService {
  async dashboard(): Promise<AdminMetrics> {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);

    const [
      usersTotal, usersActive, usersSuspended, usersNew,
      hostsTotal, hostsPending, hostsVerified,
      vehiclesTotal, vehiclesListed, vehiclesPending,
      bookingsTotal, byStatus, gmv,
      claimsOpen, ticketsOpen,
      platformRevenue,
    ] = await Promise.all([
      userRepository.count(),
      userRepository.count({ status: 'active' }),
      userRepository.count({ status: 'suspended' }),
      userRepository.countCreatedSince(weekAgo),
      hostService.count(),
      hostService.count({ verificationStatus: 'pending' }),
      hostService.count({ verificationStatus: 'verified' }),
      vehicleService.count(),
      vehicleService.count({ status: 'listed' }),
      vehicleService.count({ verificationStatus: 'pending' }),
      bookingService.count(),
      bookingService.statusBreakdown(),
      bookingService.gmv(),
      claimService.count({ status: { $in: ['opened', 'investigating'] } }),
      ticketService.count({ status: { $in: ['open', 'pending', 'escalated'] } }),
      // platform_revenue is DEBIT-normal (commission debits it). balance() =
      // credit - debit returned revenue as a NEGATIVE number on the dashboard.
      ledgerService.debitBalance(Account.platformRevenue()),
    ]);

    return {
      users: { total: usersTotal, active: usersActive, suspended: usersSuspended, newThisWeek: usersNew },
      hosts: { total: hostsTotal, pending: hostsPending, verified: hostsVerified },
      vehicles: { total: vehiclesTotal, listed: vehiclesListed, pendingVerification: vehiclesPending },
      bookings: { total: bookingsTotal, byStatus, gmv },
      claims: { open: claimsOpen },
      tickets: { open: ticketsOpen },
      revenue: { platform: platformRevenue, currency: 'USD' },
    };
  }

  /**
   * The Analytics view. Deliberately a superset of the dashboard's single
   * chart: trend, where demand sits, and how bookings convert — everything
   * aggregated live, nothing precomputed or stored.
   */
  async analytics(days = 30): Promise<AdminAnalytics> {
    const [series, signups, demand, byStatus] = await Promise.all([
      bookingService.dailySeries(days),
      userRepository.dailySignups(days),
      bookingService.demandBreakdown(days),
      bookingService.statusBreakdown(),
    ]);

    const bookings = series.reduce((a, d) => a + d.bookings, 0);
    const gmv = series.reduce((a, d) => a + d.gmv, 0);
    const completed = byStatus.find((s) => s.status === 'completed')?.count ?? 0;
    const cancelled = byStatus.find((s) => s.status === 'cancelled')?.count ?? 0;
    const allTime = byStatus.reduce((a, s) => a + s.count, 0);

    return {
      days,
      currency: 'USD',
      series,
      signups,
      cities: demand.cities,
      categories: demand.categories,
      byStatus,
      totals: {
        bookings,
        gmv,
        signups: signups.reduce((a, d) => a + d.signups, 0),
        // Average order value over the window — 0 rather than NaN when quiet.
        aov: bookings > 0 ? Math.round(gmv / bookings) : 0,
        completionRate: allTime > 0 ? completed / allTime : 0,
        cancellationRate: allTime > 0 ? cancelled / allTime : 0,
      },
    };
  }
}

export interface AdminAnalytics {
  days: number;
  currency: string;
  series: { day: string; bookings: number; gmv: number }[];
  signups: { day: string; signups: number }[];
  cities: { key: string; trips: number; gmv: number }[];
  categories: { key: string; trips: number; gmv: number }[];
  byStatus: { status: string; count: number }[];
  totals: {
    bookings: number; gmv: number; signups: number; aov: number;
    completionRate: number; cancellationRate: number;
  };
}

export const adminMetricsService = new AdminMetricsService();
