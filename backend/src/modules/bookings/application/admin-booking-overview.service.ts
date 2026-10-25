import { BookingModel, type BookingDoc } from '../infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { TripModel } from '../../trips/infrastructure/trip.model';
import { PaymentModel } from '../../payments/infrastructure/payment.model';
import { guestIdentityService, ID_PHOTO_LABEL } from '../../kyc/application/guest-identity.service';
import type { IdPhoto } from '../../kyc/infrastructure/identity.provider';
import { timedViewService, viewerStamp, stampForView, type Viewer } from '../../media/application/timed-view.service';
import { auditService } from '../../audit/application/audit.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { AppError, NotFoundError } from '../../../core/errors/app-error';

const PURPOSE = 'admin_guest_id';

type Person = { _id: string; firstName?: string; lastName?: string; email?: string; phone?: string; createdAt?: Date };
const nameOf = (u?: Person | null) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'Unknown' : 'Unknown');

/** One booking for staff: the trip, the car, the host and who booked it. ID photos open separately, with a reason. */
export const adminBookingOverviewService = {
  /** `canSeeId`: staff with ID review see the date of birth; others see the age only. */
  async overview(bookingId: string, canSeeId = false) {
    const b = await BookingModel.findById(bookingId).lean<BookingDoc>();
    if (!b) throw new NotFoundError('Booking');
    const [vehicle, host, guest, trip, tripsTaken, payments] = await Promise.all([
      VehicleModel.findById(b.vehicleId).select('year make model registrationNumber').lean<{ year?: number; make?: string; model?: string; registrationNumber?: string }>(),
      HostModel.findById(b.hostId).select('displayName userId').lean<{ displayName: string; userId: string }>(),
      UserModel.findById(b.guestId).select('firstName lastName email phone createdAt').lean<Person>(),
      TripModel.findOne({ bookingId }).select('status handover.at return.at').lean<{ status: string; handover?: { at?: Date }; return?: { at?: Date } }>(),
      BookingModel.countDocuments({ guestId: b.guestId, status: 'completed' }),
      PaymentModel.find({ bookingId, deletedAt: null })
        .sort({ createdAt: 1 })
        .limit(50)
        .select('type amount currency capturedAmount refundedAmount walletApplied status releasedReason createdAt')
        .lean<{ _id: string; type: string; amount: number; currency: string; capturedAmount: number; refundedAmount: number; walletApplied?: number; status: string; releasedReason?: string; createdAt: Date }[]>(),
    ]);
    const pb = b.priceBreakdown;
    const hostUser = host ? await UserModel.findById(host.userId).select('firstName lastName email phone').lean<Person>() : null;
    const identity = await guestIdentityService.summary(b.guestId);
    return {
      booking: {
        id: b._id, code: b.code, status: b.status, period: b.period, total: b.priceBreakdown?.total,
        createdAt: (b as { createdAt?: Date }).createdAt, pickupVerifiedAt: b.pickupVerifiedAt,
        identityCheck: b.identityCheck ?? null,
        instantBook: !!b.instantBook,
        cancellationPolicy: b.cancellationPolicy,
        extensions: b.extensions?.length ?? 0,
        delivery: b.delivery?.address ? { mode: b.delivery.mode, address: b.delivery.address, flightNumber: b.delivery.flightNumber } : null,
        additionalDrivers: (b.additionalDrivers ?? []).map((d) => d.name),
      },
      price: pb
        ? {
            days: pb.days, base: pb.base, discount: pb.discount, cleaningFee: pb.cleaningFee, delivery: pb.delivery, addOnsTotal: pb.addOnsTotal,
            protection: pb.protection, protectionPlan: pb.protectionLabel ?? pb.protectionPlan, serviceFee: (pb as { serviceFee?: typeof pb.tax }).serviceFee, tax: pb.tax, taxTotal: (pb as { taxTotal?: typeof pb.tax }).taxTotal,
            total: pb.total, hostEarnings: pb.hostEarnings, commission: pb.commission,
          }
        : null,
      // Amounts and states only; card details never leave the payment processor.
      payments: payments.map((p) => ({
        id: p._id, type: p.type, amount: p.amount, currency: p.currency, captured: p.capturedAmount, refunded: p.refundedAmount,
        wallet: p.walletApplied ?? 0, status: p.status, releasedReason: p.releasedReason, createdAt: p.createdAt,
      })),
      cancellation: b.cancellation ? { role: b.cancellation.role, at: b.cancellation.at, reason: b.cancellation.reason, refund: b.cancellation.refund, charged: b.cancellation.charged } : null,
      history: (b.statusHistory ?? []).slice(-30).reverse().map((h) => ({ from: h.from, to: h.to, at: h.at, reason: h.reason })),
      trip: trip ? { status: trip.status, startedAt: trip.handover?.at, returnedAt: trip.return?.at } : null,
      vehicle: vehicle ? { id: b.vehicleId, name: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' '), plate: vehicle.registrationNumber } : null,
      host: { id: b.hostId, name: host?.displayName ?? nameOf(hostUser), email: hostUser?.email, phone: hostUser?.phone },
      guest: {
        id: b.guestId, name: nameOf(guest), email: guest?.email, phone: guest?.phone, memberSince: guest?.createdAt, tripsCompleted: tripsTaken,
        identity: { ...identity, dob: canSeeId ? identity.dob : undefined, photos: identity.photos.map((k) => ({ id: k, label: ID_PHOTO_LABEL[k] })) },
      },
    };
  },

  /** Open the guest's ID photos for staff. The reason is required and kept in the audit log. */
  async openId(staff: Viewer, bookingId: string, reason: string) {
    const b = await BookingModel.findById(bookingId).select('guestId').lean<{ guestId: string }>();
    if (!b) throw new NotFoundError('Booking');
    const id = await guestIdentityService.summary(b.guestId);
    if (!id.photos.length) throw new AppError({ code: 'NO_ID_PHOTOS', message: 'This guest has no ID photos on file.', httpStatus: 409 });
    if (!id.photosReadable) throw new AppError({ code: 'ID_PHOTOS_UNAVAILABLE', message: 'ID photos are not available yet: the Stripe read key is not set on the server.', httpStatus: 409 });
    const seconds = (await platformConfigService.get()).identityViewing.adminViewSeconds;
    const { token, expiresAt } = await timedViewService.open({ purpose: PURPOSE, resourceId: bookingId, viewerId: staff.userId, items: id.photos, seconds, context: { reason: reason.slice(0, 120) } });
    await auditService.record({
      actorId: staff.userId, actorRoles: staff.roles, action: 'guest.id.opened', resourceType: 'booking', resourceId: bookingId,
      ip: staff.ip, userAgent: staff.userAgent, reason, after: { guestId: b.guestId, photos: id.photos }, status: 200,
    });
    return { token, expiresAt, viewSeconds: seconds, items: id.photos.map((k) => ({ id: k, label: ID_PHOTO_LABEL[k] })) };
  },

  async idFile(staff: Viewer, bookingId: string, token: string, kind: IdPhoto) {
    const view = await timedViewService.check({ token, purpose: PURPOSE, resourceId: bookingId, viewerId: staff.userId, item: kind });
    const b = await BookingModel.findById(bookingId).select('guestId code').lean<{ guestId: string; code: string }>();
    if (!b) throw new NotFoundError('Booking');
    const bytes = await guestIdentityService.photo(b.guestId, kind);
    const stamped = bytes && (await stampForView(bytes, await viewerStamp(staff.userId, `CatoDrive booking ${b.code}`, `Staff review: ${view.context?.reason ?? ''}`)));
    await auditService.record({
      actorId: staff.userId, actorRoles: staff.roles, action: 'guest.id.served', resourceType: 'booking', resourceId: bookingId,
      ip: staff.ip, userAgent: staff.userAgent, after: { kind, shown: !!stamped }, status: stamped ? 200 : 422,
    });
    if (!stamped) throw new AppError({ code: 'ID_PHOTO_UNAVAILABLE', message: `The ${ID_PHOTO_LABEL[kind].toLowerCase()} was not captured or could not be read.`, httpStatus: 409 });
    return stamped;
  },
};
