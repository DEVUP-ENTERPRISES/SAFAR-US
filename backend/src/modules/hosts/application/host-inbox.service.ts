import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { MessageModel } from '../../messaging/infrastructure/message.model';
import { DocumentModel } from '../../documents/infrastructure/document.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { hostService } from './host.service';

/**
 * One thing the host has to deal with, and what ignoring it costs.
 *
 * `dueAt` is a real deadline, not a sort key: an unanswered request expires and
 * becomes lost income, a document lapses and the listing is pulled. Anything
 * without a deadline is still work, just not work on a clock.
 */
export interface ActionItem {
  kind: 'approval' | 'message' | 'document' | 'return_due';
  id: string;
  title: string;
  detail: string;
  /** When this stops being actionable and starts costing something. */
  dueAt: Date | null;
  /** What is lost if it lapses, in minor units. Null when not money. */
  atRisk: number | null;
  href: string;
}

/**
 * The host's inbox, ordered by consequence rather than chronology.
 *
 * A conventional inbox sorts newest-first, which quietly buries the one item
 * that is about to cost real money under a pile of routine notifications. Hosts
 * lose bookings this way: a request sits unanswered because three review
 * reminders arrived after it. So the ordering here is "what will hurt if you
 * ignore it", and every item that has a deadline carries the amount at stake.
 */
export class HostInboxService {
  async actionItems(userId: string): Promise<{ items: ActionItem[]; atRiskTotal: number }> {
    const host = await hostService.requireHostForUser(userId);
    const now = Date.now();

    const [pending, vehicles] = await Promise.all([
      BookingModel.find({ hostId: host._id, status: 'pending_approval', deletedAt: null })
        .select('_id code period approvalDeadline priceBreakdown')
        .lean<
          {
            _id: string;
            code: string;
            period: { start: Date };
            approvalDeadline?: Date;
            priceBreakdown: { hostEarnings: { amount: number } };
          }[]
        >(),
      VehicleModel.find({ hostId: host._id, deletedAt: null }).select('_id make model').lean<
        { _id: string; make: string; model: string }[]
      >(),
    ]);

    const vehicleIds = vehicles.map((v) => v._id);
    const label = new Map(vehicles.map((v) => [v._id, `${v.make} ${v.model}`]));

    // Live bookings this host is part of, for unread messages and returns due.
    const live = await BookingModel.find({
      hostId: host._id,
      status: { $in: ['paid', 'confirmed', 'in_progress'] },
      deletedAt: null,
    })
      .select('_id code period')
      .lean<{ _id: string; code: string; period: { end: Date } }[]>();

    const [unread, expiring] = await Promise.all([
      MessageModel.aggregate<{ _id: string; n: number }>([
        {
          $match: {
            bookingId: { $in: [...live.map((b) => b._id), ...pending.map((b) => b._id)] },
            senderId: { $nin: [userId, 'system'] },
            readBy: { $ne: userId },
          },
        },
        { $group: { _id: '$bookingId', n: { $sum: 1 } } },
      ]),
      // A mandatory document about to lapse takes the listing down with it.
      DocumentModel.find({
        vehicleId: { $in: vehicleIds },
        deletedAt: null,
        expiresAt: { $gte: new Date(), $lte: new Date(now + 30 * 86_400_000) },
      })
        .select('_id vehicleId category expiresAt')
        .lean<{ _id: string; vehicleId: string; category: string; expiresAt: Date }[]>(),
    ]);

    const items: ActionItem[] = [];

    for (const b of pending) {
      const earnings = b.priceBreakdown?.hostEarnings?.amount ?? 0;
      items.push({
        kind: 'approval',
        id: b._id,
        title: `Booking request ${b.code}`,
        detail: 'Answer before it expires — an unanswered request is a lost trip.',
        dueAt: b.approvalDeadline ?? null,
        atRisk: earnings,
        href: `/host/trips/${b._id}`,
      });
    }

    for (const row of unread) {
      const b = [...live, ...pending].find((x) => x._id === row._id);
      items.push({
        kind: 'message',
        id: row._id,
        title: `${row.n} unread message${row.n === 1 ? '' : 's'}`,
        detail: b ? `Trip ${b.code}` : 'A guest is waiting on you',
        dueAt: null,
        atRisk: null,
        href: `/host/trips/${row._id}`,
      });
    }

    for (const d of expiring) {
      items.push({
        kind: 'document',
        id: d._id,
        title: `${d.category} expires soon`,
        detail: `${label.get(d.vehicleId) ?? 'A vehicle'} will be unlisted when it lapses.`,
        dueAt: d.expiresAt,
        atRisk: null,
        href: `/host/listings/${d.vehicleId}`,
      });
    }

    for (const b of live) {
      const end = new Date(b.period.end).getTime();
      // Only flag a return that is imminent or already overdue.
      if (end - now < 24 * 3_600_000) {
        items.push({
          kind: 'return_due',
          id: b._id,
          title: end < now ? `Trip ${b.code} is overdue` : `Trip ${b.code} returns soon`,
          detail: end < now ? 'The car should already be back.' : 'Be ready to receive the car.',
          dueAt: b.period.end,
          atRisk: null,
          href: `/host/trips/${b._id}`,
        });
      }
    }

    // Deadlines first, soonest first; then everything else. Within a tie, more
    // money at stake wins — that is the whole point of this ordering.
    items.sort((a, b) => {
      if (a.dueAt && b.dueAt) return +new Date(a.dueAt) - +new Date(b.dueAt);
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return (b.atRisk ?? 0) - (a.atRisk ?? 0);
    });

    return {
      items,
      atRiskTotal: items.reduce((sum, i) => sum + (i.atRisk ?? 0), 0),
    };
  }
}

export const hostInboxService = new HostInboxService();
