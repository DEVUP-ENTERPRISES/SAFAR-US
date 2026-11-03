import { AssetPartnerNoticeModel, type AssetPartnerNoticeDoc, type NoticeType } from '../infrastructure/asset-partner-notice.model';
import { AssetPartnerModel, type AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { violationService } from '../../violations/application/violation.service';
import { ViolationModel } from '../../violations/infrastructure/violation.model';
import { notificationService } from '../../notifications/application/notification.service';
import { localCalendarDay, timezoneForState } from '../../../shared/utils/us-timezone';
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { HOUSE_FLEET_ROLE } from '../../../shared/constants/rbac';
import { logger } from '../../../infrastructure/logging/logger';

// The trip had started: the car was with the guest.
const TRIP_STATUSES = ['in_progress', 'completed'];
const DAY = 86_400_000;

export interface NoticeInput {
  vehicleId: string;
  type: NoticeType;
  issuedBy: string;
  noticeRef: string;
  occurredDate: string;
  occurredAt?: Date;
  amountCents: number;
  dueDate?: string;
  paidByPartner: boolean;
  evidence: { url: string; key?: string; kind: 'image' | 'file' }[];
}

interface TripRow {
  _id: string;
  code: string;
  period: { start: Date; end: Date };
}

const periodOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

async function notifyOps(title: string, body: string, data: Record<string, unknown>): Promise<void> {
  const ops = await UserModel.find({ roles: HOUSE_FLEET_ROLE, status: 'active' }).select('_id').lean<{ _id: string }[]>();
  await Promise.all(ops.map((u) => notificationService.send({ userId: u._id, priority: 'high', templateKey: 'asset_partner.notice_review', title, body, data }).catch(() => undefined)));
}

export class AssetPartnerNoticeService {
  /** The trips that had this car when the offence happened: the exact moment when known, else that local day. */
  async tripsFor(vehicleId: string, occurredDate: string, occurredAt: Date | undefined, timeZone: string): Promise<TripRow[]> {
    if (occurredAt) {
      return BookingModel.find({ vehicleId, status: { $in: TRIP_STATUSES }, 'period.start': { $lte: occurredAt }, 'period.end': { $gte: occurredAt } })
        .select('code period')
        .lean<TripRow[]>();
    }
    const day = new Date(`${occurredDate}T12:00:00Z`);
    const near = await BookingModel.find({
      vehicleId,
      status: { $in: TRIP_STATUSES },
      'period.start': { $lte: new Date(day.getTime() + 2 * DAY) },
      'period.end': { $gte: new Date(day.getTime() - 2 * DAY) },
    })
      .select('code period')
      .lean<TripRow[]>();
    return near.filter((t) => dayKey(localCalendarDay(new Date(t.period.start), timeZone)) <= occurredDate && occurredDate <= dayKey(localCalendarDay(new Date(t.period.end), timeZone)));
  }

  /** A partner uploads a notice; it is matched to the trip that had the car, and the guest is told straight away. */
  async upload(userId: string, input: NoticeInput): Promise<AssetPartnerNoticeDoc> {
    const partner = await AssetPartnerModel.findOne({ userId }).lean<AssetPartnerDoc>();
    if (!partner) throw new ForbiddenError('Not an Asset Partner');
    const car = await VehicleModel.findOne({ _id: input.vehicleId, assetPartnerId: partner._id }).select('location.state').lean<{ location?: { state?: string } }>();
    if (!car) throw new NotFoundError('Vehicle');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredDate)) throw new ValidationError('Enter the date on the notice.');
    if (input.occurredDate > new Date().toISOString().slice(0, 10)) throw new ValidationError('The date on the notice can’t be in the future.');
    if (input.amountCents <= 0) throw new ValidationError('Enter the amount on the notice.');
    if (!input.evidence.length) throw new ValidationError('Add a photo or PDF of the notice.');

    const timeZone = timezoneForState(car.location?.state) ?? 'America/Chicago';
    const trips = await this.tripsFor(input.vehicleId, input.occurredDate, input.occurredAt, timeZone);
    const now = new Date();
    let notice: AssetPartnerNoticeDoc;
    try {
      notice = (
        await AssetPartnerNoticeModel.create({
          ...input,
          noticeRef: input.noticeRef.trim().toUpperCase(),
          partnerId: partner._id,
          uploadedBy: userId,
          status: 'needs_review',
          reviewReason: trips.length === 0 ? 'no_trip' : trips.length > 1 ? 'several_trips' : undefined,
          candidateBookingIds: trips.map((t) => t._id),
          timeline: [{ at: now, by: userId, event: 'uploaded' }],
        })
      ).toObject();
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw new ConflictError('You’ve already sent us this notice for this car.', 'DUPLICATE_NOTICE');
      throw err;
    }

    if (trips.length === 1) return this.fileAgainst(notice, trips[0], userId);

    await notifyOps(
      'A partner notice needs a decision',
      `${input.issuedBy} ${input.type} notice ${notice.noticeRef}, ${usd(input.amountCents)}: ${trips.length === 0 ? 'no trip had the car then' : 'more than one trip that day'}.`,
      { noticeId: notice._id },
    );
    return notice;
  }

  /** Files the notice against one trip so the guest can be charged; too late to charge sends it to review instead. */
  private async fileAgainst(notice: AssetPartnerNoticeDoc, trip: TripRow, by: string): Promise<AssetPartnerNoticeDoc> {
    const start = new Date(trip.period.start).getTime();
    const end = new Date(trip.period.end).getTime();
    // A notice with only a date is placed inside the trip on that day.
    const at = notice.occurredAt ?? new Date(Math.min(end, Math.max(start, new Date(`${notice.occurredDate}T18:00:00Z`).getTime())));
    try {
      const violation = await violationService.fileFromPartnerNotice(
        by,
        { bookingId: trip._id, type: notice.type, citationRef: notice.noticeRef, issuedBy: notice.issuedBy, occurredAt: at, amount: notice.amountCents, evidence: notice.evidence.map((e) => ({ url: e.url, kind: e.kind })) },
        notice._id,
      );
      const updated = await AssetPartnerNoticeModel.findByIdAndUpdate(
        notice._id,
        {
          $set: { status: 'matched', bookingId: trip._id, violationId: violation._id, reviewReason: undefined, ...(notice.paidByPartner ? { reimburseInPeriod: periodOf(new Date()) } : {}) },
          $push: { timeline: { at: new Date(), by, event: 'matched', note: trip.code } },
        },
        { new: true },
      ).lean<AssetPartnerNoticeDoc>();
      return updated!;
    } catch (err) {
      if (err instanceof AppError && (err as { code?: string }).code === 'VIOLATION_WINDOW_CLOSED') {
        const updated = await AssetPartnerNoticeModel.findByIdAndUpdate(
          notice._id,
          { $set: { status: 'needs_review', reviewReason: 'too_late', candidateBookingIds: [trip._id] }, $push: { timeline: { at: new Date(), by, event: 'too_late', note: trip.code } } },
          { new: true },
        ).lean<AssetPartnerNoticeDoc>();
        await notifyOps('A partner notice arrived too late to charge', `${notice.issuedBy} notice ${notice.noticeRef}, ${usd(notice.amountCents)}, trip ${trip.code}.`, { noticeId: notice._id });
        return updated!;
      }
      throw err;
    }
  }

  async listForPartner(userId: string) {
    const partner = await AssetPartnerModel.findOne({ userId }).select('_id').lean<{ _id: string }>();
    if (!partner) throw new ForbiddenError('Not an Asset Partner');
    return this.withDetails(await AssetPartnerNoticeModel.find({ partnerId: partner._id }).sort({ createdAt: -1 }).limit(200).lean<AssetPartnerNoticeDoc[]>());
  }

  async listForOps(filter: { status?: AssetPartnerNoticeDoc['status'] } = {}) {
    return this.withDetails(await AssetPartnerNoticeModel.find(filter.status ? { status: filter.status } : {}).sort({ createdAt: -1 }).limit(200).lean<AssetPartnerNoticeDoc[]>());
  }

  /** Adds the car, the trip code and how the guest charge stands, so neither side has to look them up. */
  private async withDetails(rows: AssetPartnerNoticeDoc[]) {
    const [cars, trips, violations, partners] = await Promise.all([
      VehicleModel.find({ _id: { $in: [...new Set(rows.map((r) => r.vehicleId))] } }).select('year make model registrationNumber').lean<{ _id: string; year: number; make: string; model: string; registrationNumber?: string }[]>(),
      BookingModel.find({ _id: { $in: [...new Set(rows.flatMap((r) => [r.bookingId, ...r.candidateBookingIds]).filter(Boolean) as string[])] } }).select('code period').lean<TripRow[]>(),
      ViolationModel.find({ _id: { $in: rows.map((r) => r.violationId).filter(Boolean) as string[] } }).select('status').lean<{ _id: string; status: string }[]>(),
      AssetPartnerModel.find({ _id: { $in: [...new Set(rows.map((r) => r.partnerId))] } }).select('displayName').lean<{ _id: string; displayName: string }[]>(),
    ]);
    const car = new Map(cars.map((c) => [c._id, { name: `${c.year} ${c.make} ${c.model}`, plate: c.registrationNumber }]));
    const trip = new Map(trips.map((t) => [t._id, { id: t._id, code: t.code, start: t.period.start, end: t.period.end }]));
    const charge = new Map(violations.map((v) => [v._id, v.status]));
    const partner = new Map(partners.map((p) => [p._id, p.displayName]));
    return rows.map((r) => ({
      ...r,
      vehicle: car.get(r.vehicleId) ?? null,
      partnerName: partner.get(r.partnerId),
      trip: r.bookingId ? trip.get(r.bookingId) ?? null : null,
      candidates: r.candidateBookingIds.map((id) => trip.get(id)).filter(Boolean),
      guestCharge: r.violationId ? charge.get(r.violationId) ?? null : null,
    }));
  }

  /** Ops picks the trip for a notice that couldn't be matched on its own. */
  async assign(id: string, bookingId: string, by: string): Promise<AssetPartnerNoticeDoc> {
    const notice = await this.reviewable(id);
    const trip = await BookingModel.findOne({ _id: bookingId, vehicleId: notice.vehicleId, status: { $in: TRIP_STATUSES } }).select('code period').lean<TripRow>();
    if (!trip) throw new ValidationError('Pick a trip this car was on.');
    const done = await this.fileAgainst(notice, trip, by);
    if (done.status === 'matched') await this.tellPartner(done, `Matched to trip ${trip.code}. The guest is being charged.`);
    return done;
  }

  /** CatoDrive pays it: the car was with our team, or the guest can no longer be charged. */
  async absorb(id: string, by: string, note: string): Promise<AssetPartnerNoticeDoc> {
    const notice = await this.reviewable(id);
    const updated = await this.decide(notice, by, 'absorbed', note, notice.paidByPartner ? { reimburseInPeriod: periodOf(new Date()) } : {});
    await this.tellPartner(updated, notice.paidByPartner ? 'CatoDrive is paying this. You’ll get your money back on your next statement.' : 'CatoDrive is paying this notice. You don’t need to do anything.');
    return updated;
  }

  /** Not ours to pay: another car, a duplicate, or before the car joined. */
  async reject(id: string, by: string, note: string): Promise<AssetPartnerNoticeDoc> {
    const notice = await this.reviewable(id);
    const updated = await this.decide(notice, by, 'rejected', note, {});
    await this.tellPartner(updated, `We can’t take this one on: ${note}`);
    return updated;
  }

  /** CatoDrive paid the agency itself, so the partner's registration is never held over it. */
  async markAgencyPaid(id: string, by: string, reference?: string): Promise<AssetPartnerNoticeDoc> {
    const updated = await AssetPartnerNoticeModel.findOneAndUpdate(
      { _id: id, paidByPartner: false, agencyPaid: { $exists: false }, status: { $in: ['matched', 'absorbed'] } },
      { $set: { agencyPaid: { at: new Date(), by, reference: reference?.trim() || undefined } }, $push: { timeline: { at: new Date(), by, event: 'agency_paid', note: reference } } },
      { new: true },
    ).lean<AssetPartnerNoticeDoc>();
    if (!updated) throw new ConflictError('This notice isn’t waiting for CatoDrive to pay the agency.', 'NOTICE_STATE');
    await this.tellPartner(updated, 'CatoDrive has paid this notice. You don’t need to do anything.');
    return updated;
  }

  /** What the partner is paid back on a statement month: notices they paid that CatoDrive accepted. */
  async reimbursementsFor(partnerId: string, period: string): Promise<{ count: number; amount: number }> {
    const rows = await AssetPartnerNoticeModel.find({ partnerId, reimburseInPeriod: period, paidByPartner: true, status: { $in: ['matched', 'absorbed'] } }).select('amountCents').lean<{ amountCents: number }[]>();
    return { count: rows.length, amount: rows.reduce((s, r) => s + r.amountCents, 0) };
  }

  private async reviewable(id: string): Promise<AssetPartnerNoticeDoc> {
    const notice = await AssetPartnerNoticeModel.findById(id).lean<AssetPartnerNoticeDoc>();
    if (!notice) throw new NotFoundError('Notice');
    if (notice.status !== 'needs_review') throw new ConflictError('This notice has already been decided.', 'NOTICE_STATE');
    return notice;
  }

  private async decide(notice: AssetPartnerNoticeDoc, by: string, status: 'absorbed' | 'rejected', note: string, extra: Record<string, unknown>): Promise<AssetPartnerNoticeDoc> {
    if (!note.trim()) throw new ValidationError('Add a short note; the partner sees it.');
    const updated = await AssetPartnerNoticeModel.findOneAndUpdate(
      { _id: notice._id, status: 'needs_review' },
      { $set: { status, resolution: { by, at: new Date(), note: note.trim() }, ...extra }, $push: { timeline: { at: new Date(), by, event: status, note } } },
      { new: true },
    ).lean<AssetPartnerNoticeDoc>();
    if (!updated) throw new ConflictError('Someone else just decided this notice. Reload it.', 'NOTICE_STATE');
    return updated;
  }

  private async tellPartner(notice: AssetPartnerNoticeDoc, body: string): Promise<void> {
    const partner = await AssetPartnerModel.findById(notice.partnerId).select('userId').lean<{ userId: string }>();
    if (!partner) return;
    await notificationService
      .send({ userId: partner.userId, templateKey: 'account.asset_partner_notice_update', title: `${notice.issuedBy} notice ${notice.noticeRef}`, body, deepLink: '/notices', data: { noticeId: notice._id } })
      .catch((err) => logger.warn({ err: (err as Error).message, noticeId: notice._id }, 'partner notice message failed'));
  }
}

export const assetPartnerNoticeService = new AssetPartnerNoticeService();
