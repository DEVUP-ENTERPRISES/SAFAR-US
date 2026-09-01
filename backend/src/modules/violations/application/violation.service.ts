import { ViolationModel, type ViolationDoc, type ViolationType } from '../infrastructure/violation.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { notificationService } from '../../notifications/application/notification.service';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { hostService } from '../../hosts/application/host.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

export interface ReportViolationInput {
  bookingId: string;
  type: ViolationType;
  citationRef: string;
  issuedBy: string;
  occurredAt: Date;
  amount: number;
  evidence: { url: string; kind: 'image' | 'file'; note?: string }[];
}

/**
 * Citations a guest incurred, passed through to them instead of absorbed.
 *
 * A speeding ticket for a rented car is posted to the registered keeper — the
 * host — typically weeks after the trip, once the deposit has released and the
 * card authorisation has lapsed. Until now there was no path at all: the host
 * ate it, or chased the guest personally. This makes it a real transaction with
 * the protections a real transaction needs.
 */
export class ViolationService {
  /**
   * A host reports a citation.
   *
   * Three things are checked, because a charge landing weeks after a trip is
   * exactly the kind that gets abused: the offence must fall INSIDE the trip,
   * the report must arrive inside the reporting window, and there must be a
   * picture of the notice. Without the last one the guest has nothing to answer
   * and no way to tell a real ticket from an invented one.
   */
  async report(reporterId: string, input: ReportViolationInput): Promise<ViolationDoc> {
    const booking = await BookingModel.findOne({ _id: input.bookingId, deletedAt: null })
      .select('_id guestId hostId period status priceBreakdown')
      .lean<{
        _id: string;
        guestId: string;
        hostId: string;
        period: { start: Date; end: Date };
        status: string;
        priceBreakdown: { currency: string };
      } | null>();
    if (!booking) throw new NotFoundError('Booking');

    const host = await hostService.getByUserId(reporterId).catch(() => null);
    if (!host || host._id !== booking.hostId) {
      throw new ForbiddenError('Only the host of this trip can report a citation');
    }

    const cfg = (await platformConfigService.get()).violations;

    // Inside the trip: a guest is answerable for the car only while they had it.
    const occurred = new Date(input.occurredAt).getTime();
    const start = new Date(booking.period.start).getTime();
    const end = new Date(booking.period.end).getTime();
    if (occurred < start || occurred > end) {
      throw new ValidationError('The offence date falls outside this trip');
    }

    // Citations take weeks to arrive, so this window is long — but not open-ended.
    if (Date.now() > end + cfg.reportingWindowDays * 86_400_000) {
      throw new ConflictError(
        `Citations must be reported within ${cfg.reportingWindowDays} days of the trip ending.`,
        'VIOLATION_WINDOW_CLOSED',
      );
    }

    if (cfg.requireEvidence && !input.evidence?.length) {
      throw new ConflictError(
        'Attach a photo of the citation. Without it the guest has nothing to answer.',
        'EVIDENCE_REQUIRED',
      );
    }
    if (input.amount <= 0) throw new ValidationError('The citation amount must be above zero');

    let doc: ViolationDoc;
    try {
      doc = (
        await ViolationModel.create({
          ...input,
          guestId: booking.guestId,
          hostId: booking.hostId,
          adminFee: cfg.adminFeeCents,
          currency: booking.priceBreakdown.currency,
          reportedBy: reporterId,
        })
      ).toObject();
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictError('That citation has already been reported for this trip', 'DUPLICATE_CITATION');
      }
      throw err;
    }

    // The guest is told immediately, with the reference and the deadline to
    // dispute — a charge appearing later with no warning is how trust dies.
    await notificationService
      .send({
        userId: booking.guestId,
        priority: 'high',
        deepLink: `/bookings/${booking._id}`,
        templateKey: 'violation.reported',
        title: `A ${input.type} citation was reported for your trip`,
        body: `${input.issuedBy}, ref ${input.citationRef}, ${(input.amount / 100).toFixed(2)}. You have ${cfg.disputeWindowDays} days to dispute it.`,
        data: { violationId: doc._id, bookingId: booking._id },
      })
      .catch(() => undefined);

    logger.info({ violationId: doc._id, bookingId: booking._id, type: input.type }, 'violation reported');
    return doc;
  }

  /** The guest's side. Charging is held until staff rule on it. */
  async dispute(userId: string, violationId: string, reason: string): Promise<ViolationDoc> {
    const v = await this.getDoc(violationId);
    if (v.guestId !== userId) throw new ForbiddenError('Not your citation');
    if (v.status === 'charged') throw new ConflictError('This citation has already been charged', 'ALREADY_CHARGED');
    if (v.status !== 'reported') throw new ConflictError('This citation is no longer disputable', 'NOT_DISPUTABLE');

    const cfg = (await platformConfigService.get()).violations;
    if (Date.now() > new Date(v.createdAt).getTime() + cfg.disputeWindowDays * 86_400_000) {
      throw new ConflictError(
        `The ${cfg.disputeWindowDays}-day window to dispute has passed.`,
        'DISPUTE_WINDOW_CLOSED',
      );
    }

    await ViolationModel.updateOne(
      { _id: violationId },
      { status: 'disputed', disputeReason: reason, disputedAt: new Date() },
    );
    return this.getDoc(violationId);
  }

  /**
   * Charge the guest and reimburse the host.
   *
   * The face value goes to the host, who is the one the authority billed; the
   * admin fee is ours for handling it. Deliberately staff-only — a host must
   * not be able to move money out of a guest's account on their own say-so,
   * which is the abuse this whole flow exists to prevent.
   */
  async charge(staffId: string, violationId: string): Promise<ViolationDoc> {
    const v = await this.getDoc(violationId);
    if (v.status === 'charged') throw new ConflictError('Already charged', 'ALREADY_CHARGED');
    if (v.status === 'waived') throw new ConflictError('This citation was waived', 'WAIVED');

    const total = v.amount + v.adminFee;
    await ledgerService.post({
      refType: 'violation',
      refId: v._id,
      currency: v.currency,
      description: `${v.type} citation ${v.citationRef} (${v.issuedBy})`,
      legs: [
        { account: Account.gatewayClearing(), direction: 'credit', amount: total },
        { account: Account.hostPayable(v.hostId), direction: 'debit', amount: v.amount },
        ...(v.adminFee > 0
          ? [{ account: Account.platformRevenue(), direction: 'debit' as const, amount: v.adminFee }]
          : []),
      ],
    });

    await ViolationModel.updateOne(
      { _id: violationId },
      { status: 'charged', resolvedBy: staffId, resolvedAt: new Date() },
    );

    await notificationService
      .send({
        userId: v.guestId,
        priority: 'high',
        deepLink: `/bookings/${v.bookingId}`,
        templateKey: 'violation.charged',
        title: 'A citation was charged to your account',
        body: `${v.issuedBy}, ref ${v.citationRef}, ${(total / 100).toFixed(2)} ${v.currency}.`,
        data: { violationId: v._id },
      })
      .catch(() => undefined);

    logger.info({ violationId, total }, 'violation charged to guest');
    return this.getDoc(violationId);
  }

  /** Staff drop it — a misread plate, a duplicate, a citation that predates the trip. */
  async waive(staffId: string, violationId: string, resolution: string): Promise<ViolationDoc> {
    const v = await this.getDoc(violationId);
    if (v.status === 'charged') throw new ConflictError('Already charged — refund it instead', 'ALREADY_CHARGED');
    await ViolationModel.updateOne(
      { _id: violationId },
      { status: 'waived', resolution, resolvedBy: staffId, resolvedAt: new Date() },
    );
    return this.getDoc(violationId);
  }

  async listForUser(userId: string): Promise<ViolationDoc[]> {
    return ViolationModel.find({ guestId: userId, deletedAt: null }).sort({ createdAt: -1 }).lean<ViolationDoc[]>();
  }

  async listForBooking(bookingId: string): Promise<ViolationDoc[]> {
    return ViolationModel.find({ bookingId, deletedAt: null }).sort({ createdAt: -1 }).lean<ViolationDoc[]>();
  }

  async adminList(opts: { status?: string; limit?: number } = {}): Promise<ViolationDoc[]> {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (opts.status) filter.status = opts.status;
    return ViolationModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(opts.limit ?? 50, 100))
      .lean<ViolationDoc[]>();
  }

  private async getDoc(id: string): Promise<ViolationDoc> {
    const v = await ViolationModel.findOne({ _id: id, deletedAt: null }).lean<ViolationDoc>();
    if (!v) throw new NotFoundError('Citation');
    return v;
  }
}

export const violationService = new ViolationService();
