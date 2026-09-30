import { ClaimModel, type ClaimDoc, type InsuranceClaimStatus } from '../../claims/infrastructure/claim.model';
import { BookingModel, type BookingDoc } from '../../bookings/infrastructure/booking.model';
import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { TripModel, type TripDoc } from '../../trips/infrastructure/trip.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';

// Where a Wheelbase claim may go next; 'denied' can be re-filed as an appeal.
const NEXT: Record<InsuranceClaimStatus, InsuranceClaimStatus[]> = {
  to_file: ['filed'],
  filed: ['accepted', 'denied'],
  accepted: ['paid'],
  denied: ['filed'],
  paid: [],
};

// While Wheelbase is handling the loss, the guest owes at most the deductible.
const COVERED: InsuranceClaimStatus[] = ['filed', 'accepted', 'paid'];

export const wheelbaseClaimsService = {
  /** A damage or insurance claim on a Wheelbase-insured trip opens a Wheelbase claim to file. */
  async open(claim: Pick<ClaimDoc, '_id' | 'type' | 'bookingId' | 'claimantId'>): Promise<void> {
    if (claim.type === 'dispute' || !claim.bookingId) return;
    const booking = await BookingModel.findById(claim.bookingId).select('insurance').lean<Pick<BookingDoc, 'insurance'>>();
    if (booking?.insurance?.provider !== 'wheelbase') return;
    const res = await ClaimModel.updateOne(
      { _id: claim._id, insurance: { $exists: false } },
      {
        $set: {
          insurance: {
            provider: 'wheelbase',
            status: 'to_file',
            ...(booking.insurance.deductibleCents != null ? { deductibleCents: booking.insurance.deductibleCents } : {}),
            history: [{ status: 'to_file', at: new Date(), by: claim.claimantId, note: 'Claim opened on an insured trip' }],
          },
        },
      },
    );
    if (res.modifiedCount) emit(EVENTS.INSURANCE_CLAIM_TO_FILE, claim._id, { claimId: claim._id, bookingId: claim.bookingId });
  },

  /** The most that may be collected from the guest for this claim, or undefined when no cap applies. */
  guestCap(claim: Pick<ClaimDoc, 'insurance'>): number | undefined {
    const ins = claim.insurance;
    if (!ins || ins.deductibleCents == null || !COVERED.includes(ins.status)) return undefined;
    return ins.deductibleCents;
  },

  async list(status?: InsuranceClaimStatus): Promise<ClaimDoc[]> {
    return ClaimModel.find({ deletedAt: null, 'insurance.provider': 'wheelbase', ...(status ? { 'insurance.status': status } : {}) })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean<ClaimDoc[]>();
  },

  /** Staff move the Wheelbase claim along, recording Wheelbase's claim number and payout. */
  async update(
    claimId: string,
    staffId: string,
    input: { status: InsuranceClaimStatus; reference?: string; payoutCents?: number; note?: string },
  ): Promise<ClaimDoc> {
    const claim = await ClaimModel.findOne({ _id: claimId, deletedAt: null }).lean<ClaimDoc>();
    if (!claim?.insurance) throw new NotFoundError('Insurance claim');
    const from = claim.insurance.status;
    if (!NEXT[from].includes(input.status)) {
      throw new ConflictError(`A Wheelbase claim that is ${from.replace('_', ' ')} can’t be marked ${input.status}.`, 'INSURANCE_CLAIM_STEP');
    }
    const reference = input.reference?.trim() || claim.insurance.reference;
    if (input.status === 'filed' && !reference) throw new ValidationError('Enter the Wheelbase claim number');
    if (input.status === 'paid' && !(input.payoutCents && input.payoutCents > 0)) throw new ValidationError('Enter what Wheelbase paid');

    const now = new Date();
    await ClaimModel.updateOne(
      { _id: claimId, 'insurance.status': from },
      {
        $set: {
          'insurance.status': input.status,
          ...(reference ? { 'insurance.reference': reference } : {}),
          ...(input.status === 'filed' ? { 'insurance.filedAt': now } : {}),
          ...(input.status === 'accepted' || input.status === 'denied' ? { 'insurance.decidedAt': now } : {}),
          ...(input.status === 'paid' ? { 'insurance.payoutCents': input.payoutCents } : {}),
        },
        $push: { 'insurance.history': { status: input.status, at: now, by: staffId, note: input.note } },
      },
    );
    return (await ClaimModel.findById(claimId).lean<ClaimDoc>())!;
  },

  /** Everything Wheelbase asks for on a claim, gathered in one place for staff to file it. */
  async pack(claimId: string) {
    const claim = await ClaimModel.findOne({ _id: claimId, deletedAt: null }).lean<ClaimDoc>();
    if (!claim?.bookingId) throw new NotFoundError('Claim');
    const booking = await BookingModel.findById(claim.bookingId).lean<BookingDoc>();
    if (!booking) throw new NotFoundError('Booking');
    const [car, guest, trip] = await Promise.all([
      VehicleModel.findById(booking.vehicleId).lean<VehicleDoc>(),
      UserModel.findById(booking.guestId).select('firstName lastName email phone dateOfBirth').lean<{ firstName?: string; lastName?: string; email?: string; phone?: string; dateOfBirth?: string }>(),
      TripModel.findOne({ bookingId: booking._id }).lean<TripDoc>(),
    ]);
    const photos = (trip?.photos ?? []).map((p) => ({
      phase: p.phase === 'pre' ? 'pickup' : 'return',
      angle: p.angle,
      url: p.url,
      takenAt: p.at,
      lat: p.lat,
      lng: p.lng,
      by: p.byUserId === booking.guestId ? 'guest' : 'host',
    }));
    return {
      claim: {
        id: claim._id,
        type: claim.type,
        openedAt: claim.createdAt,
        description: claim.description,
        amountClaimedCents: claim.amountClaimed,
        evidence: claim.evidence.map((e) => ({ url: e.url, kind: e.kind, note: e.note })),
        wheelbase: claim.insurance,
      },
      booking: {
        code: booking.code,
        start: booking.period.start,
        end: booking.period.end,
        protection: booking.insurance?.wheelbaseTier ?? booking.insurance?.protectionLabel,
        deductibleCents: booking.insurance?.deductibleCents,
        reportedToWheelbase: booking.insurance?.report,
      },
      vehicle: car
        ? {
            description: `${car.year} ${car.make} ${car.model}`,
            vin: car.vin,
            plate: car.registrationNumber,
            wheelbaseListing: car.wheelbase?.rentalId,
            plan: car.wheelbase?.planLabel,
          }
        : null,
      driver: guest
        ? { name: [guest.firstName, guest.lastName].filter(Boolean).join(' '), email: guest.email, phone: guest.phone, dateOfBirth: guest.dateOfBirth }
        : null,
      trip: trip
        ? {
            pickedUpAt: trip.handover?.at,
            odometerStart: trip.handover?.odometerStart,
            fuelStart: trip.handover?.fuelStart,
            returnedAt: trip.return?.at,
            odometerEnd: trip.return?.odometerEnd,
            fuelEnd: trip.return?.fuelEnd,
          }
        : null,
      photos,
    };
  },
};
