import { ClaimModel, type ClaimDoc } from '../infrastructure/claim.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { TripModel, type TripPhoto } from '../../trips/infrastructure/trip.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { PaymentModel } from '../../payments/infrastructure/payment.model';
import { damageReviewService } from '../../ai/application/damage-review.service';
import { personSummaries, type PersonSummary } from '../../people/application/person-summary.service';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

interface BookingLite {
  _id: string; code: string; status: string; guestId: string; hostId: string; vehicleId: string;
  period: { start: Date; end: Date }; priceBreakdown?: { total?: { amount: number; currency: string } };
}
interface VehicleLite { _id: string; year?: number; make?: string; model?: string; registrationNumber?: string; photos?: { url: string; isCover?: boolean }[] }

const carName = (v?: VehicleLite | null) => (v ? [v.year, v.make, v.model].filter(Boolean).join(' ') : undefined);
const unknown = (id?: string) => (id ? ({ id, name: 'Deleted account', kind: 'guest' } as Pick<PersonSummary, 'id' | 'name' | 'kind'>) : undefined);

/** Why a claim can't be approved yet, in plain sentences; rejecting is always allowed. */
export function approveBlockers(claim: Pick<ClaimDoc, 'bookingId' | 'evidence' | 'amountClaimed'>, amount: number, note?: string): string[] {
  const out: string[] = [];
  if (!claim.bookingId) out.push('Link this claim to the trip it is about first.');
  if (amount <= 0) out.push('Enter the amount you are approving.');
  if ((claim.evidence ?? []).length === 0 && (note ?? '').trim().length < 20) out.push('There is no evidence: add a photo or write at least a sentence on why you are approving.');
  if (claim.amountClaimed != null && amount > claim.amountClaimed) out.push('You can’t approve more than was claimed.');
  return out;
}

/** Claims as staff need them: who filed, against whom, which trip and car, the money, and the photos from that trip. */
export const claimCaseService = {
  async list(opts: { status?: string; type?: string; limit?: number; skip?: number }) {
    const limit = Math.min(opts.limit ?? 20, 50);
    const filter: Record<string, unknown> = { deletedAt: null };
    if (opts.status) filter.status = opts.status;
    if (opts.type) filter.type = opts.type;
    const [items, total] = await Promise.all([
      ClaimModel.find(filter).sort({ createdAt: -1 }).skip(opts.skip ?? 0).limit(limit).lean<ClaimDoc[]>(),
      ClaimModel.countDocuments(filter),
    ]);
    const bookings = await BookingModel.find({ _id: { $in: items.map((c) => c.bookingId).filter(Boolean) } }).select('_id code vehicleId').lean<Pick<BookingLite, '_id' | 'code' | 'vehicleId'>[]>();
    const vehicles = await VehicleModel.find({ _id: { $in: bookings.map((b) => b.vehicleId) } }).select('_id year make model registrationNumber').lean<VehicleLite[]>();
    const people = await personSummaries(items.flatMap((c) => [c.claimantId, c.respondentId].filter(Boolean) as string[]), { visibility: 'staff' });
    const bookingBy = new Map(bookings.map((b) => [b._id, b]));
    const vehicleBy = new Map(vehicles.map((v) => [v._id, v]));
    return {
      total,
      items: items.map((c) => {
        const b = c.bookingId ? bookingBy.get(c.bookingId) : undefined;
        const v = b ? vehicleBy.get(b.vehicleId) : undefined;
        return {
          ...c,
          claimant: people.get(c.claimantId) ?? unknown(c.claimantId),
          respondent: c.respondentId ? (people.get(c.respondentId) ?? unknown(c.respondentId)) : undefined,
          booking: b ? { id: b._id, code: b.code } : undefined,
          vehicle: v ? { id: v._id, name: carName(v), plate: v.registrationNumber } : undefined,
        };
      }),
    };
  },

  async detail(claimId: string) {
    const claim = await ClaimModel.findOne({ _id: claimId, deletedAt: null }).lean<ClaimDoc>();
    if (!claim) throw new NotFoundError('Claim');
    const booking = claim.bookingId
      ? await BookingModel.findById(claim.bookingId).select('_id code status guestId hostId vehicleId period priceBreakdown.total').lean<BookingLite>()
      : null;
    const [vehicle, trip, deposit, assessment] = await Promise.all([
      booking ? VehicleModel.findById(booking.vehicleId).select('_id year make model registrationNumber photos').lean<VehicleLite>() : null,
      booking ? TripModel.findOne({ bookingId: booking._id }).select('_id status photos').lean<{ _id: string; status: string; photos?: TripPhoto[] }>() : null,
      booking
        ? PaymentModel.findOne({ bookingId: booking._id, type: 'deposit', deletedAt: null }).select('amount currency status capturedAmount').lean<{ amount: number; currency: string; status: string; capturedAmount?: number }>()
        : null,
      claim.tripId ? damageReviewService.get(claim.tripId).catch(() => null) : null,
    ]);
    const peopleIds = [claim.claimantId, claim.respondentId, claim.liableUserId, claim.assignedTo, ...claim.timeline.map((t) => t.by)].filter(Boolean) as string[];
    const people = await personSummaries(peopleIds, { visibility: 'staff' });
    const photos = (trip?.photos ?? []).map((p) => ({ url: p.url, phase: p.phase, angle: p.angle, at: p.at, by: p.byUserId === booking?.guestId ? 'guest' : 'host' }));
    const amount = claim.amountApproved ?? claim.amountClaimed ?? 0;
    return {
      ...claim,
      claimant: people.get(claim.claimantId) ?? unknown(claim.claimantId),
      claimantSide: booking ? (booking.guestId === claim.claimantId ? 'guest' : 'host') : undefined,
      respondent: claim.respondentId ? (people.get(claim.respondentId) ?? unknown(claim.respondentId)) : undefined,
      liable: claim.liableUserId ? people.get(claim.liableUserId) : undefined,
      assignee: claim.assignedTo ? people.get(claim.assignedTo)?.name : undefined,
      timeline: claim.timeline.map((t) => ({ ...t, byName: people.get(t.by)?.name ?? (t.by === 'system' ? 'System' : 'Staff') })),
      booking: booking
        ? { id: booking._id, code: booking.code, status: booking.status, start: booking.period.start, end: booking.period.end, total: booking.priceBreakdown?.total }
        : null,
      vehicle: vehicle ? { id: vehicle._id, name: carName(vehicle), plate: vehicle.registrationNumber, photo: (vehicle.photos ?? []).find((p) => p.isCover)?.url ?? vehicle.photos?.[0]?.url } : null,
      deposit: deposit ? { amount: deposit.amount, currency: deposit.currency, status: deposit.status, captured: deposit.capturedAmount ?? 0 } : null,
      tripPhotos: { pre: photos.filter((p) => p.phase === 'pre'), post: photos.filter((p) => p.phase === 'post') },
      assessment: assessment ?? null,
      approveBlockers: ['opened', 'investigating'].includes(claim.status) ? approveBlockers(claim, amount) : [],
    };
  },

  /** Staff attach an unlinked claim to its trip by booking code; the filer must be the guest or host on that trip. */
  async linkBooking(claimId: string, staffId: string, code: string) {
    const claim = await ClaimModel.findOne({ _id: claimId, deletedAt: null }).lean<ClaimDoc>();
    if (!claim) throw new NotFoundError('Claim');
    if (claim.bookingId) throw new ConflictError('This claim is already linked to a trip.', 'CLAIM_LINKED');
    const booking = await BookingModel.findOne({ code: code.trim().toUpperCase() }).select('_id guestId hostId').lean<Pick<BookingLite, '_id' | 'guestId' | 'hostId'>>();
    if (!booking) throw new ValidationError('No booking has that code');
    const { HostModel } = await import('../../hosts/infrastructure/host.model');
    const host = await HostModel.findById(booking.hostId).select('userId').lean<{ userId: string }>();
    const isGuest = booking.guestId === claim.claimantId;
    if (!isGuest && host?.userId !== claim.claimantId) throw new ConflictError('The person who filed this claim wasn’t on that trip.', 'CLAIM_NOT_PARTICIPANT');
    const trip = await TripModel.findOne({ bookingId: booking._id }).select('_id').lean<{ _id: string }>();
    const respondentId = isGuest ? host?.userId : booking.guestId;
    await ClaimModel.updateOne(
      { _id: claimId, bookingId: { $in: [null, undefined] } },
      {
        $set: { bookingId: booking._id, hostId: booking.hostId, respondentId, ...(trip ? { tripId: trip._id } : {}) },
        $push: { timeline: { status: claim.status, at: new Date(), by: staffId, note: `Linked to booking ${code.trim().toUpperCase()}` } },
      },
    );
    logger.info({ claimId, bookingId: booking._id, staffId }, 'claim linked to its booking');
    if (respondentId && (await UserModel.exists({ _id: respondentId }))) {
      const { notificationService } = await import('../../notifications/application/notification.service');
      void notificationService
        .send({ userId: respondentId, priority: 'high', deepLink: `/claims/${claimId}`, templateKey: 'claim.opened', title: 'A claim was filed on one of your trips', body: 'Review the evidence and respond.', data: { claimId } })
        .catch(() => undefined);
    }
    return this.detail(claimId);
  },
};
