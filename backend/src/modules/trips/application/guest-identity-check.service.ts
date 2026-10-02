import { BookingModel, type BookingDoc } from '../../bookings/infrastructure/booking.model';
import { TripModel } from '../infrastructure/trip.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { guestIdentityService } from '../../kyc/application/guest-identity.service';
import { timedViewService, viewerStamp, stampForView, type Viewer } from '../../media/application/timed-view.service';
import { auditService } from '../../audit/application/audit.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../../core/errors/app-error';
import { tripService } from './trip.service';

const PURPOSE = 'host_guest_selfie';
/** Bookings that are confirmed but not yet handed over. */
const BEFORE_PICKUP = ['paid', 'confirmed'];

type Booking = Pick<BookingDoc, '_id' | 'code' | 'guestId' | 'hostId' | 'vehicleId' | 'status' | 'period' | 'identityCheck'>;

const closed = (message: string) => new AppError({ code: 'GUEST_PHOTO_CLOSED', message, httpStatus: 409 });

/** The host checks the person at the car against the guest's verified selfie, before entering the pickup code. */
export const guestIdentityCheckService = {
  async hostBooking(viewer: Viewer, bookingId: string): Promise<Booking> {
    const booking = await BookingModel.findById(bookingId).select('code guestId hostId vehicleId status period identityCheck').lean<Booking>();
    if (!booking) throw new NotFoundError('Booking');
    if (!(await tripService.isHostSideOf(viewer.userId, booking, 'trip:handover'))) throw new ForbiddenError('Only the host of this trip can see the guest\'s photo');
    return booking;
  },

  /** Open from `hostMinutesBefore` the pickup until the trip starts. */
  async window(booking: Booking) {
    const cfg = (await platformConfigService.get()).identityViewing;
    const opensAt = new Date(new Date(booking.period.start).getTime() - cfg.hostMinutesBefore * 60_000);
    const started = await TripModel.exists({ bookingId: booking._id });
    const open = BEFORE_PICKUP.includes(booking.status) && !started && Date.now() >= opensAt.getTime() && Date.now() <= new Date(booking.period.end).getTime();
    return { open, opensAt, started: !!started, viewSeconds: cfg.hostViewSeconds };
  },

  /** What the host's handover screen shows: when the photo opens, the verified name and age, and any check already made. */
  async status(viewer: Viewer, bookingId: string) {
    const booking = await this.hostBooking(viewer, bookingId);
    const w = await this.window(booking);
    const id = await guestIdentityService.summary(booking.guestId);
    return {
      open: w.open,
      opensAt: w.opensAt,
      started: w.started,
      viewSeconds: w.viewSeconds,
      verified: id.status === 'approved',
      verifiedName: id.verifiedName,
      age: id.age,
      photoAvailable: id.photos.includes('selfie') && id.photosReadable,
      check: booking.identityCheck && !booking.identityCheck.clearedAt ? { result: booking.identityCheck.result, at: booking.identityCheck.at } : null,
    };
  },

  async open(viewer: Viewer, bookingId: string) {
    const booking = await this.hostBooking(viewer, bookingId);
    const w = await this.window(booking);
    if (!w.open) throw closed(w.started ? 'The trip has started, so the guest\'s photo is hidden again.' : 'The guest\'s photo opens shortly before pickup.');
    const { token, expiresAt } = await timedViewService.open({ purpose: PURPOSE, resourceId: bookingId, viewerId: viewer.userId, items: ['selfie'], seconds: w.viewSeconds });
    await auditService.record({
      actorId: viewer.userId, actorRoles: viewer.roles, action: 'guest.selfie.opened', resourceType: 'booking', resourceId: bookingId,
      ip: viewer.ip, userAgent: viewer.userAgent, after: { guestId: booking.guestId, seconds: w.viewSeconds }, status: 200,
    });
    return { token, expiresAt, viewSeconds: w.viewSeconds, items: [{ id: 'selfie', label: 'Guest\'s verified selfie' }] };
  },

  async file(viewer: Viewer, bookingId: string, token: string) {
    await timedViewService.check({ token, purpose: PURPOSE, resourceId: bookingId, viewerId: viewer.userId, item: 'selfie' });
    const booking = await this.hostBooking(viewer, bookingId);
    if (!(await this.window(booking)).open) throw closed('The trip has started, so the guest\'s photo is hidden again.');
    const bytes = await guestIdentityService.photo(booking.guestId, 'selfie');
    const vehicle = await VehicleModel.findById(booking.vehicleId).select('location.state').lean<{ location?: { state?: string } }>();
    const stamped = bytes && (await stampForView(bytes, await viewerStamp(viewer.userId, `CatoDrive booking ${booking.code}`, 'Pickup identity check only', vehicle?.location?.state)));
    await auditService.record({
      actorId: viewer.userId, actorRoles: viewer.roles, action: 'guest.selfie.served', resourceType: 'booking', resourceId: bookingId,
      ip: viewer.ip, userAgent: viewer.userAgent, after: { shown: !!stamped }, status: stamped ? 200 : 422,
    });
    if (!stamped) throw new AppError({ code: 'GUEST_PHOTO_UNAVAILABLE', message: 'The guest\'s photo is not available. Check their name and licence in person, then enter the pickup code.', httpStatus: 409 });
    return stamped;
  },

  /** The host's answer. "Not the same person" blocks the start and alerts our team; staff clear it after checking. */
  async record(viewer: Viewer, bookingId: string, result: 'match' | 'mismatch', note?: string) {
    const booking = await this.hostBooking(viewer, bookingId);
    if (!(await this.window(booking)).open) throw closed('The identity check is done before the trip starts.');
    const at = new Date();
    await BookingModel.updateOne({ _id: bookingId }, { $set: { identityCheck: { result, at, by: viewer.userId, note } } });
    await auditService.record({
      actorId: viewer.userId, actorRoles: viewer.roles, action: `guest.identity.${result}`, resourceType: 'booking', resourceId: bookingId,
      ip: viewer.ip, userAgent: viewer.userAgent, after: { result, note }, status: 200,
    });
    if (result === 'mismatch') emit(EVENTS.GUEST_IDENTITY_MISMATCH, bookingId, { bookingId, code: booking.code, guestId: booking.guestId, hostId: booking.hostId, note });
    return { result, at };
  },

  /** Staff confirmed the guest after a mismatch: the trip can start again. */
  async clear(staff: Viewer, bookingId: string, reason: string) {
    const res = await BookingModel.updateOne(
      { _id: bookingId, 'identityCheck.result': 'mismatch', 'identityCheck.clearedAt': { $exists: false } },
      { $set: { 'identityCheck.clearedAt': new Date(), 'identityCheck.clearedBy': staff.userId } },
    );
    if (!res.modifiedCount) throw new ConflictError('There is no open identity mismatch on this booking', 'NO_MISMATCH');
    await auditService.record({
      actorId: staff.userId, actorRoles: staff.roles, action: 'guest.identity.cleared', resourceType: 'booking', resourceId: bookingId,
      ip: staff.ip, userAgent: staff.userAgent, reason, status: 200,
    });
    return { cleared: true };
  },
};
