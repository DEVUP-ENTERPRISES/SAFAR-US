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
}

export const adminMetricsService = new AdminMetricsService();
