import { ReviewModel, type ReviewDoc } from '../infrastructure/review.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { bookingService } from '../../bookings/application/booking.service';
import { hostService } from '../../hosts/application/host.service';
import { ConflictError, ForbiddenError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { logger } from '../../../infrastructure/logging/logger';

export class ReviewService {
  async create(userId: string, bookingId: string, rating: number, comment: string): Promise<ReviewDoc> {
    const booking = await bookingService.getDoc(bookingId);
    if (booking.status !== 'completed') {
      throw new ConflictError('You can only review completed trips', 'NOT_COMPLETED');
    }

    const host = await hostService.getByUserId(userId);
    const isGuest = booking.guestId === userId;
    const isHost = !!host && host._id === booking.hostId;
    if (!isGuest && !isHost) throw new ForbiddenError('Not a participant of this booking');

    const direction = isGuest ? 'guest_to_host' : 'host_to_guest';
    const subjectId = isGuest ? booking.hostId : booking.guestId;

    const existing = await ReviewModel.findOne({ bookingId, direction }).lean();
    if (existing) throw new ConflictError('Already reviewed', 'ALREADY_REVIEWED');

    const review = await ReviewModel.create({
      bookingId,
      direction,
      authorId: userId,
      subjectId,
      vehicleId: isGuest ? booking.vehicleId : undefined,
      hostId: isGuest ? booking.hostId : undefined,
      rating,
      comment,
    });

    /*
     * Written blind. A review is held until the other party has written theirs
     * (or the window closes), because publishing immediately lets the second
     * writer read the first and answer it — which is exactly how a guest who
     * disputed a charge ends up with a retaliatory rating. Releasing both at
     * the same moment makes every review an opinion of the trip rather than a
     * reply to a review.
     */
    const counterpart = await ReviewModel.findOne({
      bookingId,
      direction: isGuest ? 'host_to_guest' : 'guest_to_host',
      deletedAt: null,
    })
      .select('_id status')
      .lean<{ _id: string; status: string } | null>();

    if (counterpart) {
      await this.publish([review._id, counterpart._id]);
      // Aggregates only ever count published reviews, so they are recomputed
      // once both are live rather than when each is written.
      await this.recomputeFor(bookingId);
    }

    emit(EVENTS.REVIEW_POSTED, review._id, { bookingId, subjectId, rating });
    return (await ReviewModel.findById(review._id).lean<ReviewDoc>())!;
  }

  /** Make reviews visible, stamping when it happened. */
  private async publish(ids: string[]): Promise<void> {
    await ReviewModel.updateMany(
      { _id: { $in: ids }, status: 'pending' },
      { status: 'published', publishedAt: new Date() },
    );
  }

  /** Recompute the aggregates a booking's reviews feed. */
  private async recomputeFor(bookingId: string): Promise<void> {
    const booking = await bookingService.getDoc(bookingId).catch(() => null);
    if (!booking) return;
    await this.recomputeAggregates(booking.vehicleId, booking.hostId);
    await hostService.recomputeSuperhost(booking.hostId);
  }

  /**
   * Release reviews whose blind window has closed.
   *
   * Without this a one-sided review would stay hidden forever: the other party
   * simply never writes, and silence becomes a veto over criticism. Run on a
   * schedule.
   */
  async releaseExpired(): Promise<number> {
    const { reviews: cfg } = await platformConfigService.get();
    const cutoff = new Date(Date.now() - cfg.blindWindowDays * 86_400_000);

    const due = await ReviewModel.find({ status: 'pending', createdAt: { $lte: cutoff }, deletedAt: null })
      .select('_id bookingId')
      .lean<{ _id: string; bookingId: string }[]>();
    if (due.length === 0) return 0;

    await this.publish(due.map((r) => r._id));
    for (const bookingId of new Set(due.map((r) => r.bookingId))) {
      await this.recomputeFor(bookingId);
    }
    logger.info({ released: due.length }, 'blind review window closed — reviews released');
    return due.length;
  }

  /**
   * Both directions of review on one booking, from one party's point of view.
   *
   * The viewer always sees their own review in full. The other side's is
   * redacted while it is still pending — the UI needs to know it EXISTS (so it
   * can say "they've reviewed you, yours unlocks when you write"), but showing
   * its rating or words here would defeat the blind window entirely.
   */
  async listForBooking(bookingId: string, viewerId: string): Promise<(ReviewDoc | RedactedReview)[]> {
    const reviews = await ReviewModel.find({ bookingId, deletedAt: null }).lean<ReviewDoc[]>();
    return reviews.map((r) => {
      if (r.authorId === viewerId || r.status === 'published') return r;
      return {
        _id: r._id,
        bookingId: r.bookingId,
        direction: r.direction,
        authorId: r.authorId,
        subjectId: r.subjectId,
        status: r.status,
        pending: true,
        createdAt: r.createdAt,
      } satisfies RedactedReview;
    });
  }

  async listForSubject(subjectId: string): Promise<ReviewDoc[]> {
    return ReviewModel.find({ subjectId, status: 'published', deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean<ReviewDoc[]>();
  }

  /**
   * Star-rating breakdown for a subject — counts per star (1–5), total, and
   * average — for the reviews histogram. Aggregated over ALL published reviews
   * (not the capped list), so the bars reflect the full population.
   */
  async distribution(subjectId: string): Promise<{ total: number; avg: number; counts: Record<1 | 2 | 3 | 4 | 5, number> }> {
    const rows = await ReviewModel.aggregate<{ _id: number; count: number }>([
      { $match: { subjectId, status: 'published', deletedAt: null } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]);
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
    let total = 0;
    let sum = 0;
    for (const r of rows) {
      const star = Math.max(1, Math.min(5, Math.round(r._id))) as 1 | 2 | 3 | 4 | 5;
      counts[star] += r.count;
      total += r.count;
      sum += star * r.count;
    }
    return { total, avg: total ? Math.round((sum / total) * 100) / 100 : 0, counts };
  }

  private async recomputeAggregates(vehicleId: string, hostId: string): Promise<void> {
    const [vehStats] = await ReviewModel.aggregate<{ avg: number; count: number }>([
      { $match: { vehicleId, status: 'published' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    if (vehStats) {
      await VehicleModel.updateOne(
        { _id: vehicleId },
        { ratingAvg: Math.round(vehStats.avg * 100) / 100, ratingCount: vehStats.count },
      );
    }
    const [hostStats] = await ReviewModel.aggregate<{ avg: number; count: number }>([
      { $match: { hostId, status: 'published' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    if (hostStats) {
      await HostModel.updateOne(
        { _id: hostId },
        { ratingAvg: Math.round(hostStats.avg * 100) / 100, ratingCount: hostStats.count },
      );
    }
  }
}

/** A counterpart's review that exists but is not yet readable. */
export interface RedactedReview {
  _id: string;
  bookingId: string;
  direction: string;
  authorId: string;
  subjectId: string;
  status: string;
  pending: true;
  createdAt: Date;
}

export const reviewService = new ReviewService();
