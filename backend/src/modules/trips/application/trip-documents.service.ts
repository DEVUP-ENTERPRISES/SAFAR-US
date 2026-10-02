import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { TripModel, type TripDoc } from '../infrastructure/trip.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { DocumentModel } from '../../documents/infrastructure/document.model';
import { storageGateway } from '../../../infrastructure/storage/storage.provider';
import { auditService } from '../../audit/application/audit.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { logger } from '../../../infrastructure/logging/logger';
import { AppError, ForbiddenError, NotFoundError } from '../../../core/errors/app-error';
import { timedViewService, viewerStamp, stampForView, type Viewer } from '../../media/application/timed-view.service';

/** The papers an officer asks for at a stop, in the order they are shown. */
export const TRIP_PAPERS = ['registration', 'insurance'] as const;
export type TripPaper = (typeof TRIP_PAPERS)[number];
const LABEL: Record<TripPaper, string> = { registration: 'Vehicle registration', insurance: 'Proof of insurance' };

export type { Viewer };
const PURPOSE = 'trip_documents';

const unavailable = (message: string, code = 'TRIP_DOCUMENTS_UNAVAILABLE') =>
  new AppError({ code, message, httpStatus: 409 });

export const tripDocumentsService = {
  /** The guest's own live trip: handed over and not yet returned. Anyone else, or any other time, is refused. */
  async liveTrip(userId: string, bookingId: string) {
    const booking = await BookingModel.findById(bookingId).select('code guestId hostId vehicleId').lean<{ _id: string; code: string; guestId: string; hostId: string; vehicleId: string }>();
    if (!booking) throw new NotFoundError('Booking');
    if (booking.guestId !== userId) throw new ForbiddenError('Only the guest on this trip can open the car\'s documents');
    const trip = await TripModel.findOne({ bookingId, status: 'active', 'return.at': { $exists: false } }).lean<TripDoc>();
    return { booking, trip };
  },

  /** The newest usable file of each kind for this car; an expired or rejected one counts as missing. */
  async papersFor(vehicleId: string) {
    const docs = await DocumentModel.find({ vehicleId, category: { $in: TRIP_PAPERS }, deletedAt: null })
      .sort({ createdAt: -1 })
      .select('category key expiresAt verification')
      .lean<{ _id: string; category: TripPaper; key?: string; expiresAt?: Date; verification?: { status?: string } }[]>();
    const now = Date.now();
    return TRIP_PAPERS.map((category) => {
      const doc = docs.find((d) => d.category === category && d.key && d.verification?.status !== 'rejected');
      const expired = !!doc?.expiresAt && new Date(doc.expiresAt).getTime() < now;
      return { category, label: LABEL[category], doc: doc && !expired ? doc : undefined, expired };
    });
  },

  /** What the trip page shows: whether the button is live and which papers are on file. No file, link or key leaves here. */
  async status(userId: string, bookingId: string) {
    const cfg = (await platformConfigService.get()).tripDocuments;
    const { booking, trip } = await this.liveTrip(userId, bookingId);
    if (!cfg.enabled || !trip) return { live: false as const, viewSeconds: cfg.viewSeconds };
    const papers = await this.papersFor(booking.vehicleId);
    return {
      live: true as const,
      viewSeconds: cfg.viewSeconds,
      requestedAt: trip.documentsRequestedAt ?? null,
      documents: papers.map((p) => ({ category: p.category, label: p.label, available: !!p.doc, expired: p.expired })),
    };
  },

  /** Open the papers for `viewSeconds`. Returns a one-time token the files are fetched with, and alerts the host. */
  async open(viewer: Viewer, bookingId: string) {
    const cfg = (await platformConfigService.get()).tripDocuments;
    const { booking, trip } = await this.liveTrip(viewer.userId, bookingId);
    if (!cfg.enabled) throw unavailable('Vehicle documents are not available right now. Contact support from your trip page.');
    if (!trip) throw unavailable('Vehicle documents can be opened only while your trip is in progress.');

    const papers = (await this.papersFor(booking.vehicleId)).filter((p) => p.doc);
    if (!papers.length) throw unavailable('Your host has not uploaded the documents yet. Tap "Request documents" and we will alert them.', 'TRIP_DOCUMENTS_MISSING');

    const openedAt = new Date();
    const { token, expiresAt } = await timedViewService.open({
      purpose: PURPOSE,
      resourceId: bookingId,
      viewerId: viewer.userId,
      items: papers.map((p) => p.doc!._id),
      seconds: cfg.viewSeconds,
      context: { tripId: trip._id },
    });

    await auditService.record({
      actorId: viewer.userId,
      actorRoles: viewer.roles,
      action: 'trip.documents.opened',
      resourceType: 'booking',
      resourceId: bookingId,
      ip: viewer.ip,
      userAgent: viewer.userAgent,
      after: { vehicleId: booking.vehicleId, documents: papers.map((p) => p.category), seconds: cfg.viewSeconds },
      status: 200,
    });

    // One alert per cooldown: a guest reopening the screen for the same officer should not page the host each time.
    if (cfg.alertHost) {
      const since = new Date(openedAt.getTime() - cfg.alertCooldownMinutes * 60_000);
      const claimed = await TripModel.updateOne(
        { _id: trip._id, $or: [{ documentsAlertedAt: { $exists: false } }, { documentsAlertedAt: { $lt: since } }] },
        { $set: { documentsAlertedAt: openedAt } },
      );
      if (claimed.modifiedCount) {
        emit(EVENTS.TRIP_DOCUMENTS_OPENED, trip._id, { bookingId, tripId: trip._id, hostId: booking.hostId, vehicleId: booking.vehicleId, code: booking.code });
      }
    }

    return {
      token,
      expiresAt,
      viewSeconds: cfg.viewSeconds,
      documents: papers.map((p) => ({ id: p.doc!._id, category: p.category, label: p.label })),
    };
  },

  /** One file from an open viewing, stamped with who is looking and when. Refused once the time is up or the trip ends. */
  async file(viewer: Viewer, bookingId: string, documentId: string, token: string) {
    const view = await timedViewService.check({ token, purpose: PURPOSE, resourceId: bookingId, viewerId: viewer.userId, item: documentId });
    const { booking, trip } = await this.liveTrip(viewer.userId, bookingId);
    if (!trip || trip._id !== view.context?.tripId) throw new ForbiddenError('This view has closed. Open the documents again.');

    const doc = await DocumentModel.findOne({ _id: documentId, vehicleId: booking.vehicleId, deletedAt: null }).select('category key').lean<{ _id: string; category: TripPaper; key?: string }>();
    if (!doc?.key) throw new NotFoundError('Document');

    const vehicle = await VehicleModel.findById(booking.vehicleId).select('location.state').lean<{ location?: { state?: string } }>();
    const stamp = await viewerStamp(viewer.userId, `CatoDrive trip ${booking.code}`, 'For a traffic stop only', vehicle?.location?.state);

    let stamped: Awaited<ReturnType<typeof stampForView>> = null;
    try {
      stamped = await stampForView((await storageGateway.readObject(doc.key)).body, stamp);
    } catch (err) {
      logger.error({ err: (err as Error).message, documentId, bookingId }, 'trip document could not be read from storage');
    }

    await auditService.record({
      actorId: viewer.userId,
      actorRoles: viewer.roles,
      action: 'trip.documents.file_served',
      resourceType: 'booking',
      resourceId: bookingId,
      ip: viewer.ip,
      userAgent: viewer.userAgent,
      after: { documentId, category: doc.category, shown: !!stamped },
      status: stamped ? 200 : 422,
    });

    if (!stamped) {
      throw unavailable('This document could not be shown. Your host has been asked for a clearer copy.', 'TRIP_DOCUMENT_UNREADABLE');
    }
    return { category: doc.category, ...stamped, expiresAt: view.expiresAt };
  },

  /** The guest needs papers the host has not uploaded: alert the host and support, once per cooldown. */
  async request(viewer: Viewer, bookingId: string) {
    const cfg = (await platformConfigService.get()).tripDocuments;
    const { booking, trip } = await this.liveTrip(viewer.userId, bookingId);
    if (!cfg.enabled || !trip) throw unavailable('Vehicle documents can be requested only while your trip is in progress.');

    const missing = (await this.papersFor(booking.vehicleId)).filter((p) => !p.doc).map((p) => p.category);
    const now = new Date();
    const since = new Date(now.getTime() - cfg.alertCooldownMinutes * 60_000);
    const claimed = await TripModel.updateOne(
      { _id: trip._id, $or: [{ documentsRequestedAt: { $exists: false } }, { documentsRequestedAt: { $lt: since } }] },
      { $set: { documentsRequestedAt: now } },
    );
    const alerted = claimed.modifiedCount > 0;

    await auditService.record({
      actorId: viewer.userId,
      actorRoles: viewer.roles,
      action: 'trip.documents.requested',
      resourceType: 'booking',
      resourceId: bookingId,
      ip: viewer.ip,
      userAgent: viewer.userAgent,
      after: { vehicleId: booking.vehicleId, missing, alerted },
      status: 200,
    });

    if (alerted) {
      emit(EVENTS.TRIP_DOCUMENTS_REQUESTED, trip._id, { bookingId, tripId: trip._id, hostId: booking.hostId, vehicleId: booking.vehicleId, code: booking.code, missing: missing.length ? missing : [...TRIP_PAPERS] });
    }
    return { requestedAt: alerted ? now : trip.documentsRequestedAt ?? now, missing, alerted };
  },

  /** The host uploaded a paper: tell any guest who asked for it, on a live trip in that car, that it is ready. */
  async onUploaded(vehicleId: string, category: string): Promise<void> {
    if (!(TRIP_PAPERS as readonly string[]).includes(category)) return;
    const trips = await TripModel.find({ vehicleId, status: 'active', 'return.at': { $exists: false }, documentsRequestedAt: { $exists: true } })
      .select('bookingId guestId')
      .lean<{ _id: string; bookingId: string; guestId: string }[]>();
    for (const t of trips) {
      await TripModel.updateOne({ _id: t._id }, { $unset: { documentsRequestedAt: 1 } });
      emit(EVENTS.TRIP_DOCUMENTS_READY, t._id, { bookingId: t.bookingId, guestId: t.guestId, category });
    }
  },

  /** Every opening and request on a booking, for the host and staff. */
  async history(bookingId: string) {
    const rows = await auditService.forResource('booking', bookingId, 200);
    return rows
      .filter((r) => r.action === 'trip.documents.opened' || r.action === 'trip.documents.requested')
      .map((r) => ({ action: r.action === 'trip.documents.opened' ? 'opened' : 'requested', at: r.at }));
  },
};
