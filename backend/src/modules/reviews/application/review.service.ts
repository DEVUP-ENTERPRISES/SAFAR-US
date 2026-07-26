import { ReviewModel, type ReviewDoc } from '../infrastructure/review.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { bookingService } from '../../bookings/application/booking.service';
import { hostService } from '../../hosts/application/host.service';
import { ConflictError, ForbiddenError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';

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

    if (isGuest) {
      await this.recomputeAggregates(booking.vehicleId, booking.hostId);
      await hostService.recomputeSuperhost(booking.hostId);
    }
    emit(EVENTS.REVIEW_POSTED, review._id, { bookingId, subjectId, rating });
    return review.toObject();
  }

  /** Both directions of review on one booking — so each party's UI can tell
   *  whether they have reviewed yet, and whether the other side has. */
  async listForBooking(bookingId: string): Promise<ReviewDoc[]> {
    return ReviewModel.find({ bookingId, deletedAt: null }).lean<ReviewDoc[]>();
  }

  async listForSubject(subjectId: string): Promise<ReviewDoc[]> {
    return ReviewModel.find({ subjectId, status: 'published', deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean<ReviewDoc[]>();
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

export const reviewService = new ReviewService();
