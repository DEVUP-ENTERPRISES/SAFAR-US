import { PayoutModel } from '../infrastructure/payout.model';
import { hostService } from '../../hosts/application/host.service';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { DocumentModel } from '../../documents/infrastructure/document.model';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';

/** One thing standing between a host and their money. */
export interface PayoutBlocker {
  key: 'bank_details' | 'identity' | 'insurance';
  label: string;
  detail: string;
  /** Where the host goes to clear it. */
  href: string;
  /** A blocker stops payouts; a warning will become one. */
  severity: 'blocking' | 'warning';
}

/**
 * Can this host actually get paid, and if not, why not?
 *
 * Bank details were being collected on the profile page and used by nothing —
 * a host could complete trips, watch a balance accrue, and have no way of
 * knowing that their money could not physically reach them. Payout failures
 * discovered at payout time are the worst possible moment to discover them.
 *
 * Every blocker names the screen that clears it, because "your payouts are on
 * hold" without a next step is just anxiety.
 */
export class PayoutReadinessService {
  async forHost(userId: string): Promise<{
    ready: boolean;
    blockers: PayoutBlocker[];
    balance: { pending: number; scheduled: number; paidLifetime: number; currency: string };
    nextPayoutAt: Date | null;
    destination: {
      configured: boolean;
      verified: boolean;
      viaStripe: boolean;
      accountHolder?: string;
      bankName?: string;
      last4?: string;
    };
  }> {
    const host = await hostService.requireHostForUser(userId);

    const [kyc, payouts, vehicles] = await Promise.all([
      KycModel.findOne({ userId }).sort({ createdAt: -1 }).lean<{ status: string } | null>(),
      PayoutModel.find({ hostId: host._id }).select('amount status scheduledFor createdAt').lean<
        { amount: number; status: string; scheduledFor?: Date; createdAt: Date }[]
      >(),
      VehicleModel.find({ hostId: host._id, deletedAt: null, status: 'listed' }).select('_id make model').lean<
        { _id: string; make: string; model: string }[]
      >(),
    ]);

    const blockers: PayoutBlocker[] = [];
    const bank = host.bankingDetails;

    // 1. Somewhere to send the money.
    // Either a connected Stripe account or bank details on file will do.
    const bankReady = !!(bank?.stripeConnectedAccountId || (bank?.accountHolder && bank?.accountNumberMasked));
    if (!bankReady) {
      blockers.push({
        key: 'bank_details',
        label: 'Add your bank details',
        detail: 'Earnings accrue but cannot be sent until we know where to send them.',
        href: '/host/profile',
        severity: 'blocking',
      });
    } else if (bank?.verified === false) {
      // On file but unconfirmed: the first payout is where this bites, so warn
      // now rather than let it fail silently later.
      blockers.push({
        key: 'bank_details',
        label: 'Bank details not yet confirmed',
        detail: 'We’ll verify them before your first payout. Check them if anything looks wrong.',
        href: '/host/profile',
        severity: 'warning',
      });
    }

    // 2. Identity — a payout to an unverified person is not something we can do.
    if (kyc?.status !== 'approved') {
      blockers.push({
        key: 'identity',
        label: kyc?.status === 'pending' ? 'Identity check in progress' : 'Verify your identity',
        detail:
          kyc?.status === 'pending'
            ? 'We’re reviewing your documents. Payouts resume automatically once it clears.'
            : 'Required before money can leave the platform.',
        href: '/account/verify-identity',
        severity: kyc?.status === 'pending' ? 'warning' : 'blocking',
      });
    }

    // 3. Insurance per listed car — lapsed cover pulls the listing, which stops
    //    the earnings before the payout ever matters.
    const vehicleIds = vehicles.map((v) => v._id);
    if (vehicleIds.length > 0) {
      const insurance = await DocumentModel.find({
        vehicleId: { $in: vehicleIds },
        category: 'insurance',
        deletedAt: null,
      })
        .select('vehicleId status expiresAt')
        .lean<{ vehicleId: string; status: string; expiresAt?: Date }[]>();

      const now = Date.now();
      const byVehicle = new Map(insurance.map((d) => [d.vehicleId, d]));
      const missing = vehicles.filter((v) => {
        const doc = byVehicle.get(v._id);
        return !doc || doc.status !== 'approved' || (doc.expiresAt && new Date(doc.expiresAt).getTime() < now);
      });
      if (missing.length > 0) {
        blockers.push({
          key: 'insurance',
          label: `Insurance missing or expired on ${missing.length} car${missing.length === 1 ? '' : 's'}`,
          detail: `${missing.map((v) => `${v.make} ${v.model}`).join(', ')} — a car without valid cover is unlisted.`,
          href: '/host/listings',
          severity: 'blocking',
        });
      }
    }

    // ── Money ─────────────────────────────────────────────────────────
    // Pending is what the ledger owes; scheduled is what is queued to leave.
    const pending = await ledgerService.balance(Account.hostPayable(host._id));
    const scheduled = payouts.filter((p) => p.status === 'scheduled').reduce((s, p) => s + p.amount, 0);
    const paidLifetime = payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);

    const nextScheduled = payouts
      .filter((p) => p.status === 'scheduled' && p.scheduledFor)
      .sort((a, b) => +new Date(a.scheduledFor!) - +new Date(b.scheduledFor!))[0];

    return {
      ready: blockers.every((b) => b.severity !== 'blocking'),
      blockers,
      balance: { pending, scheduled, paidLifetime, currency: 'USD' },
      nextPayoutAt: nextScheduled?.scheduledFor ?? null,
      destination: {
        configured: bankReady,
        verified: bank?.verified === true,
        viaStripe: !!bank?.stripeConnectedAccountId,
        accountHolder: bank?.accountHolder,
        bankName: bank?.bankName,
        // Never return the full number — the last four is all anyone needs to
        // recognise their own account.
        last4: bank?.accountNumberMasked ? String(bank.accountNumberMasked).slice(-4) : undefined,
      },
    };
  }
}

export const payoutReadinessService = new PayoutReadinessService();
