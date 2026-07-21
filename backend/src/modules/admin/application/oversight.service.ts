import { FleetModel } from '../../fleet/infrastructure/fleet.model';
import { OrgModel, MemberModel } from '../../corporate/infrastructure/corporate.models';
import { ReviewModel } from '../../reviews/infrastructure/review.model';
import { PayoutModel } from '../../payouts/infrastructure/payout.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { NotFoundError } from '../../../core/errors/app-error';

/**
 * Cross-tenant oversight for the console. Hosts/orgs each see only their own
 * data; staff need the whole picture, so these read across tenants and join in
 * the owner names an operator actually recognises.
 */
export class OversightService {
  /** Every fleet on the platform, with its owning host and live size. */
  async fleets(q: { search?: string } = {}) {
    const fleets = await FleetModel.find().sort({ createdAt: -1 }).limit(200).lean();
    if (fleets.length === 0) return [];

    const hostIds = [...new Set(fleets.map((f) => f.hostId))];
    const [hosts, vehicleCounts] = await Promise.all([
      HostModel.find({ _id: { $in: hostIds } }).select('displayName').lean<{ _id: string; displayName: string }[]>(),
      VehicleModel.aggregate<{ _id: string; n: number }>([
        { $match: { fleetId: { $in: fleets.map((f) => f._id) } } },
        { $group: { _id: '$fleetId', n: { $sum: 1 } } },
      ]),
    ]);
    const hostName = new Map(hosts.map((h) => [h._id, h.displayName]));
    const count = new Map(vehicleCounts.map((v) => [v._id, v.n]));

    const rows = fleets.map((f) => ({
      _id: f._id,
      name: f.name,
      region: f.region ?? null,
      hostId: f.hostId,
      hostName: hostName.get(f.hostId) ?? '—',
      vehicles: count.get(f._id) ?? 0,
      createdAt: f.createdAt,
    }));

    const s = q.search?.trim().toLowerCase();
    return s ? rows.filter((r) => `${r.name} ${r.hostName}`.toLowerCase().includes(s)) : rows;
  }

  /** Corporate accounts with member counts and lifetime spend. */
  async orgs(q: { status?: string } = {}) {
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    const orgs = await OrgModel.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    if (orgs.length === 0) return [];

    const ids = orgs.map((o) => o._id);
    const [members, spend] = await Promise.all([
      MemberModel.aggregate<{ _id: string; n: number }>([
        { $match: { orgId: { $in: ids }, status: { $ne: 'removed' } } },
        { $group: { _id: '$orgId', n: { $sum: 1 } } },
      ]),
      BookingModel.aggregate<{ _id: string; total: number; trips: number }>([
        { $match: { orgId: { $in: ids }, status: { $in: ['paid', 'in_progress', 'completed'] } } },
        { $group: { _id: '$orgId', total: { $sum: '$priceBreakdown.total.amount' }, trips: { $sum: 1 } } },
      ]),
    ]);
    const memberCount = new Map(members.map((m) => [m._id, m.n]));
    const spendBy = new Map(spend.map((s) => [s._id, s]));

    return orgs.map((o) => ({
      _id: o._id,
      name: o.name,
      billingEmail: o.billingEmail,
      domain: o.domain ?? null,
      status: o.status,
      members: memberCount.get(o._id) ?? 0,
      trips: spendBy.get(o._id)?.trips ?? 0,
      totalSpend: spendBy.get(o._id)?.total ?? 0,
      createdAt: o.createdAt,
    }));
  }

  async setOrgStatus(orgId: string, status: 'active' | 'suspended') {
    const org = await OrgModel.findByIdAndUpdate(orgId, { status }, { new: true }).lean();
    if (!org) throw new NotFoundError('Organisation');
    return org;
  }

  /** Reviews for moderation, newest first. */
  async reviews(q: { status?: string; minRating?: number } = {}) {
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.minRating) filter.rating = { $lte: q.minRating }; // surface the bad ones
    return ReviewModel.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  }

  async setReviewStatus(reviewId: string, status: 'published' | 'hidden') {
    const review = await ReviewModel.findByIdAndUpdate(reviewId, { status }, { new: true }).lean();
    if (!review) throw new NotFoundError('Review');
    return review;
  }

  /** Payout queue across all hosts — what the platform owes and has paid. */
  async payouts(q: { status?: string } = {}) {
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    const payouts = await PayoutModel.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    if (payouts.length === 0) return { rows: [], totals: { scheduled: 0, paid: 0 } };

    const hostIds = [...new Set(payouts.map((p) => p.hostId))];
    const hosts = await HostModel.find({ _id: { $in: hostIds } })
      .select('displayName')
      .lean<{ _id: string; displayName: string }[]>();
    const hostName = new Map(hosts.map((h) => [h._id, h.displayName]));

    const totals = payouts.reduce(
      (acc, p) => {
        if (p.status === 'scheduled') acc.scheduled += p.amount;
        if (p.status === 'paid') acc.paid += p.amount;
        return acc;
      },
      { scheduled: 0, paid: 0 },
    );

    return {
      rows: payouts.map((p) => ({
        _id: p._id,
        hostId: p.hostId,
        hostName: hostName.get(p.hostId) ?? '—',
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        instant: !!p.instant,
        scheduledFor: p.scheduledFor,
        paidAt: p.paidAt ?? null,
      })),
      totals,
    };
  }
}

export const oversightService = new OversightService();
