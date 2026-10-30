import {
  AssetPartnerExitModel,
  OPEN_EXIT_STATUSES,
  type AssetPartnerExitDoc,
  type ChecklistItem,
  type ChecklistKey,
  type ContactAttempt,
  type EstateDocument,
  type ExitCar,
  type ExitReason,
  type ExitStatus,
} from '../infrastructure/asset-partner-exit.model';
import { AssetPartnerModel, type AssetPartnerDoc, type PartnerContact } from '../infrastructure/asset-partner.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { MaintenanceModel } from '../../maintenance/infrastructure/maintenance.model';
import { TollAccountModel } from '../../tolls/infrastructure/toll.model';
import { HostStaffModel } from '../../hosts/infrastructure/host-staff.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { notificationService } from '../../notifications/application/notification.service';
import { resolveOwnedUpload } from '../../../infrastructure/storage/owned-upload';
import { storageGateway } from '../../../infrastructure/storage/storage.provider';
import { randomId } from '../../../shared/utils/uuid';
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';
import { assetPartnerService } from './asset-partner.service';

const DAY = 24 * 3600_000;
const tidy = (s?: string) => (s ?? '').trim().replace(/\s+/g, ' ');
const longDate = (d: Date) => new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
const chicagoDay = (d: Date) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

/** What the runner sees for each step; auto steps are worked out from live data. */
export const CHECKLIST: { key: ChecklistKey; label: string; hint: string; auto: boolean }[] = [
  { key: 'no_trips', label: 'No guest trips left on the car', hint: 'Every booked or active trip has ended, been moved or been cancelled.', auto: true },
  { key: 'delisted', label: 'Taken off the marketplace', hint: 'Done automatically when the runner starts the return.', auto: true },
  { key: 'repairs_closed', label: 'Repairs closed', hint: 'No repair or service is still scheduled or in progress.', auto: true },
  { key: 'insurance_removed', label: 'Removed from CatoDrive’s insurance', hint: 'Car taken off the fleet policy; note the confirmation number.', auto: false },
  { key: 'toll_tag_removed', label: 'TollTag removed (NTTA)', hint: 'Tag taken off the windshield and the car removed from CatoDrive’s toll account.', auto: false },
  { key: 'gps_removed', label: 'GPS tracker removed', hint: 'CatoDrive’s tracker taken out of the car.', auto: false },
  { key: 'keys_returned', label: 'All keys and fobs collected', hint: 'Out of the lockbox or key safe; enter how many.', auto: false },
  { key: 'accessories_removed', label: 'Lockbox and CatoDrive items removed', hint: 'Lockbox, phone mount, chargers, stickers and anything else CatoDrive put in.', auto: false },
  { key: 'papers_removed', label: 'CatoDrive papers out of the glovebox', hint: 'Remove CatoDrive’s insurance card and trip papers; leave the owner’s registration.', auto: false },
  { key: 'interior_checked', label: 'Car checked and cleaned', hint: 'Guests’ left-behind items removed, car cleaned.', auto: false },
  { key: 'condition_photos', label: 'Return photos taken', hint: 'Every side, the interior, the odometer and the fuel gauge.', auto: true },
  { key: 'odometer_fuel', label: 'Odometer and fuel recorded', hint: 'Enter the reading and the fuel level at handover.', auto: true },
];
const LABEL = new Map(CHECKLIST.map((c) => [c.key, c]));
const MANUAL = new Set(CHECKLIST.filter((c) => !c.auto).map((c) => c.key));

export const REASON_LABEL: Record<ExitReason, string> = {
  partner_request: 'Partner asked for their car back',
  unresponsive: 'Partner can’t be reached',
  deceased: 'Partner passed away',
};

export interface ExitRequestInput {
  vehicleIds: string[];
  preferredDate: Date;
  note?: string;
  handoverPreference: 'pickup' | 'deliver';
  deliveryAddress?: string;
}

export interface OpsOpenInput {
  reason: ExitReason;
  vehicleIds?: string[];
  note?: string;
  reportedBy?: PartnerContact;
  preferredDate?: Date;
}

export interface CarUpdate {
  items?: { key: ChecklistKey; done: boolean; note?: string }[];
  odometer?: number;
  fuelLevel?: ExitCar['fuelLevel'];
  keysReturned?: number;
  damageNotes?: string;
  addPhotos?: { key: string; label?: string }[];
  removePhotoKeys?: string[];
}

export interface HandoverInput {
  to: 'owner' | 'representative' | 'estate' | 'storage';
  receiverName: string;
  receiverSignature: string;
  location: string;
  ownerInsuranceConfirmed: boolean;
}

interface CarFacts {
  upcomingTrips: number;
  listed: boolean;
  openRepairs: number;
  hasTollTag: boolean;
  tollTagId?: string;
  insuredAs?: string;
}

function reference(): string {
  return `CD-RT-${randomId().replace(/\D/g, '').padEnd(6, '0').slice(0, 6)}`;
}

function freshChecklist(): ChecklistItem[] {
  return CHECKLIST.map((c) => ({ key: c.key, done: false, auto: c.auto, required: true }));
}

async function factsFor(vehicleId: string): Promise<CarFacts> {
  const [v, upcomingTrips, openRepairs, inTollAccount] = await Promise.all([
    VehicleModel.findById(vehicleId).select('status tollTagId wheelbase').lean<{ status: string; tollTagId?: string; wheelbase?: { name?: string } }>(),
    vehicleService.upcomingTrips(vehicleId),
    MaintenanceModel.countDocuments({ vehicleId, status: { $in: ['scheduled', 'in_progress'] } }),
    TollAccountModel.exists({ vehicleIds: vehicleId }),
  ]);
  return {
    upcomingTrips,
    listed: v?.status === 'listed',
    openRepairs,
    hasTollTag: !!(v?.tollTagId || inTollAccount),
    tollTagId: v?.tollTagId,
    insuredAs: v?.wheelbase?.name,
  };
}

/** Each step with its live state; a car with no toll tag on record has nothing to remove. */
function evaluate(car: ExitCar, facts: CarFacts, photoMin: number): (ChecklistItem & { label: string; hint: string })[] {
  const stored = new Map((car.checklist ?? []).map((i) => [i.key, i]));
  return CHECKLIST.map((c) => {
    const s = stored.get(c.key) ?? { key: c.key, done: false, auto: c.auto, required: true };
    let item: ChecklistItem = { ...s, auto: c.auto, required: true };
    let hint = c.hint;
    if (c.key === 'no_trips') item = { ...item, done: facts.upcomingTrips === 0, note: facts.upcomingTrips ? `${facts.upcomingTrips} trip${facts.upcomingTrips === 1 ? '' : 's'} still booked` : undefined };
    if (c.key === 'delisted') item = { ...item, done: !facts.listed };
    if (c.key === 'repairs_closed') item = { ...item, done: facts.openRepairs === 0, note: facts.openRepairs ? `${facts.openRepairs} open` : undefined };
    if (c.key === 'condition_photos') item = { ...item, done: car.photos.length >= photoMin, note: `${car.photos.length} of ${photoMin}` };
    if (c.key === 'odometer_fuel') item = { ...item, done: car.odometer != null && !!car.fuelLevel };
    if (c.key === 'keys_returned') item = { ...item, done: item.done && (car.keysReturned ?? 0) > 0 };
    if (c.key === 'toll_tag_removed' && !facts.hasTollTag) item = { ...item, required: false, done: true, note: 'No toll tag on record for this car' };
    if (c.key === 'toll_tag_removed' && facts.tollTagId) hint = `${c.hint} Tag ${facts.tollTagId}.`;
    if (c.key === 'insurance_removed' && facts.insuredAs) hint = `${c.hint} Insured as “${facts.insuredAs}”.`;
    return { ...item, label: c.label, hint };
  });
}

export class AssetPartnerExitService {
  private async cfg() {
    return (await platformConfigService.get()).assetPartner;
  }

  private async load(exitId: string): Promise<AssetPartnerExitDoc> {
    const doc = await AssetPartnerExitModel.findById(exitId).lean<AssetPartnerExitDoc>();
    if (!doc) throw new NotFoundError('Return');
    return doc;
  }

  /** Moves a case on only from the states given, so two people acting at once can't both win. */
  private async move(exitId: string, from: ExitStatus[], set: Record<string, unknown>, event: { by: string; type: string; detail?: string }, extra: Record<string, unknown> = {}): Promise<AssetPartnerExitDoc> {
    const doc = await AssetPartnerExitModel.findOneAndUpdate(
      { _id: exitId, status: { $in: from }, ...extra },
      { $set: set, $push: { events: { at: new Date(), ...event } } },
      { new: true },
    ).lean<AssetPartnerExitDoc>();
    if (doc) return doc;
    const current = await this.load(exitId);
    throw new ConflictError(`This return is ${current.status.replace('_', ' ')} and can’t do that now. Reload to see the latest.`, 'EXIT_STATE');
  }

  /** The partner's cars still in the programme, limited to the ones asked for. */
  private async activeCars(partnerId: string, vehicleIds?: string[]): Promise<ExitCar[]> {
    const filter: Record<string, unknown> = { assetPartnerId: partnerId, assetPartnerEndedAt: null, deletedAt: null };
    if (vehicleIds?.length) filter._id = { $in: vehicleIds };
    const cars = await VehicleModel.find(filter).select('_id year make model trim registrationNumber').lean<{ _id: string; year: number; make: string; model: string; trim?: string; registrationNumber?: string }[]>();
    if (vehicleIds?.length && cars.length !== new Set(vehicleIds).size) throw new ValidationError('Pick cars that are still with CatoDrive');
    if (cars.length === 0) throw new ConflictError('There are no cars with CatoDrive to return.', 'NO_CARS');
    const busy = await AssetPartnerExitModel.findOne({ status: { $in: OPEN_EXIT_STATUSES }, 'cars.vehicleId': { $in: cars.map((c) => c._id) } }).select('reference').lean<{ reference: string }>();
    if (busy) throw new ConflictError(`A return is already open for this car (${busy.reference}).`, 'EXIT_OPEN');
    return cars.map((c) => ({
      vehicleId: c._id,
      label: [c.year, c.make, c.model, c.trim].filter(Boolean).join(' '),
      plate: c.registrationNumber,
      checklist: freshChecklist(),
      photos: [],
    }));
  }

  private async create(partner: AssetPartnerDoc, data: Partial<AssetPartnerExitDoc> & { reason: ExitReason; status: ExitStatus; cars: ExitCar[]; openedBy: string }): Promise<AssetPartnerExitDoc> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const doc = await AssetPartnerExitModel.create({
          ...data,
          reference: reference(),
          partnerId: partner._id,
          attempts: [],
          events: [{ at: new Date(), by: data.openedBy, type: 'opened', detail: REASON_LABEL[data.reason] }],
        });
        return doc.toObject();
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
      }
    }
    throw new ConflictError('Please try again.', 'EXIT_REFERENCE');
  }

  private async tell(partner: Pick<AssetPartnerDoc, 'userId' | '_id'>, templateKey: string, title: string, body: string, exitId: string): Promise<void> {
    await notificationService
      .send({ userId: partner.userId, priority: 'high', deepLink: '/asset-partners/returns', templateKey: `account.asset_partner_${templateKey}`, title, body, data: { exitId, partnerId: partner._id } })
      .catch((err) => logger.warn({ err, exitId }, 'return notice failed'));
  }

  // ── Partner side ────────────────────────────────────────────────────

  /** The partner asks for cars back; the date must respect the notice period in their agreement. */
  async requestByPartner(userId: string, input: ExitRequestInput): Promise<AssetPartnerExitDoc> {
    const partner = await assetPartnerService.getByUserId(userId);
    if (!partner) throw new ForbiddenError('Not an Asset Partner');
    if (partner.status === 'exited') throw new ConflictError('You have already left the programme.', 'PARTNER_EXITED');
    const cfg = await this.cfg();
    const earliest = new Date(Date.now() + (cfg.exitNoticeDays ?? 30) * DAY);
    if (chicagoDay(input.preferredDate) < chicagoDay(earliest)) {
      throw new ValidationError(`Your agreement asks for ${cfg.exitNoticeDays} days’ notice. Pick ${longDate(earliest)} or later.`);
    }
    if (input.handoverPreference === 'deliver' && tidy(input.deliveryAddress).length < 8) throw new ValidationError('Enter the address to bring the car to');
    const cars = await this.activeCars(partner._id, input.vehicleIds);
    const exit = await this.create(partner, {
      reason: 'partner_request',
      status: 'requested',
      cars,
      openedBy: 'partner',
      partnerNote: tidy(input.note) || undefined,
      preferredDate: input.preferredDate,
      handoverPreference: input.handoverPreference,
      deliveryAddress: input.handoverPreference === 'deliver' ? tidy(input.deliveryAddress) : undefined,
    });
    logger.info({ exitId: exit._id, partnerId: partner._id, cars: cars.length }, 'Asset Partner asked for cars back');
    await this.tell(partner, 'return_requested', 'We’ve got your return request', `Reference ${exit.reference}. We’ll confirm the date and who will hand the car over. Your car keeps earning until then.`, exit._id);
    return exit;
  }

  async listForPartner(userId: string) {
    const partner = await assetPartnerService.getByUserId(userId);
    if (!partner) throw new ForbiddenError('Not an Asset Partner');
    const exits = await AssetPartnerExitModel.find({ partnerId: partner._id, reason: { $ne: 'deceased' } }).sort({ createdAt: -1 }).limit(20).lean<AssetPartnerExitDoc[]>();
    const cfg = await this.cfg();
    return {
      noticeDays: cfg.exitNoticeDays ?? 30,
      earliestDate: new Date(Date.now() + (cfg.exitNoticeDays ?? 30) * DAY),
      exits: exits.map((e) => ({
        _id: e._id,
        reference: e.reference,
        reason: e.reason,
        status: e.status,
        cars: e.cars.map((c) => ({ vehicleId: c.vehicleId, label: c.label, plate: c.plate })),
        preferredDate: e.preferredDate,
        scheduledFor: e.scheduledFor,
        handoverPreference: e.handoverPreference,
        deliveryAddress: e.deliveryAddress,
        noticeEndsAt: e.noticeEndsAt,
        completedAt: e.completedAt,
        cancelled: e.cancelled ? { at: e.cancelled.at, reason: e.cancelled.reason } : undefined,
        handover: e.handover ? { to: e.handover.to, receiverName: e.handover.receiverName, at: e.handover.at, location: e.handover.location } : undefined,
        canCancel: e.reason === 'partner_request' && ['requested', 'scheduled'].includes(e.status),
        canRespond: e.reason === 'unresponsive' && ['notice', 'scheduled'].includes(e.status),
        createdAt: e.createdAt,
      })),
    };
  }

  async cancelByPartner(userId: string, exitId: string): Promise<AssetPartnerExitDoc> {
    const partner = await assetPartnerService.getByUserId(userId);
    if (!partner) throw new ForbiddenError('Not an Asset Partner');
    const exit = await AssetPartnerExitModel.findOne({ _id: exitId, partnerId: partner._id, reason: 'partner_request' }).lean<AssetPartnerExitDoc>();
    if (!exit) throw new NotFoundError('Return');
    const done = await this.move(exitId, ['requested', 'scheduled'], { status: 'cancelled', cancelled: { by: 'partner', at: new Date(), reason: 'Partner withdrew the request' } }, { by: 'partner', type: 'cancelled', detail: 'Partner withdrew the request' });
    if (exit.runner) void this.tellRunner(exit.runner.userId, 'Return cancelled', `${exit.reference} was withdrawn by the owner. No need to go.`, exitId);
    return done;
  }

  /** An unreachable partner gets back in touch: the case closes and their payouts are released. */
  async respondByPartner(userId: string, exitId: string): Promise<AssetPartnerExitDoc> {
    const partner = await assetPartnerService.getByUserId(userId);
    if (!partner) throw new ForbiddenError('Not an Asset Partner');
    const exit = await AssetPartnerExitModel.findOne({ _id: exitId, partnerId: partner._id, reason: 'unresponsive' }).lean<AssetPartnerExitDoc>();
    if (!exit) throw new NotFoundError('Return');
    const done = await this.move(
      exitId,
      ['notice', 'scheduled'],
      { status: 'cancelled', cancelled: { by: 'partner', at: new Date(), reason: 'Partner got back in touch' } },
      { by: 'partner', type: 'partner_responded', detail: 'Partner confirmed from their portal' },
    );
    await this.releaseHoldFor(partner._id, exitId);
    await AssetPartnerModel.updateOne({ _id: partner._id }, { $set: { lastSeenAt: new Date() } });
    logger.info({ exitId, partnerId: partner._id }, 'Unreachable Asset Partner responded');
    if (exit.runner) void this.tellRunner(exit.runner.userId, 'Return cancelled', `${exit.reference}: the owner got back in touch. No need to go.`, exitId);
    return done;
  }

  // ── Ops side ────────────────────────────────────────────────────────

  async open(by: string, partnerId: string, input: OpsOpenInput): Promise<AssetPartnerExitDoc> {
    const partner = await assetPartnerService.getById(partnerId);
    if (partner.status === 'exited') throw new ConflictError('This partner has already left the programme.', 'PARTNER_EXITED');
    const cfg = await this.cfg();
    const cars = await this.activeCars(partnerId, input.vehicleIds);
    const now = new Date();
    const note = tidy(input.note) || undefined;

    if (input.reason === 'partner_request') {
      const exit = await this.create(partner, { reason: 'partner_request', status: 'requested', cars, openedBy: by, partnerNote: note, preferredDate: input.preferredDate });
      await this.tell(partner, 'return_requested', 'We’ve logged your return request', `Reference ${exit.reference}. We’ll confirm the date and who will hand the car over.`, exit._id);
      return exit;
    }

    if (input.reason === 'unresponsive') {
      const noticeEndsAt = new Date(now.getTime() + (cfg.unresponsiveNoticeDays ?? 30) * DAY);
      const exit = await this.create(partner, { reason: 'unresponsive', status: 'notice', cars, openedBy: by, partnerNote: note, noticeSentAt: now, noticeEndsAt });
      await AssetPartnerModel.updateOne({ _id: partnerId }, { $set: { payoutHold: { reason: 'unresponsive', since: now, exitId: exit._id } } });
      await this.tell(
        partner,
        'unreachable_notice',
        'Please get in touch with CatoDrive',
        `We haven’t been able to reach you about your car. Sign in to your partner portal and press “I’m here”, or call us, by ${longDate(noticeEndsAt)}. If we don’t hear from you, we’ll end management and hand the car to your named contact or keep it in storage, as your agreement allows. Your earnings are safe and held for you.`,
        exit._id,
      );
      logger.warn({ exitId: exit._id, partnerId }, 'Unreachable-partner notice sent');
      return exit;
    }

    const reportedBy = input.reportedBy ? this.contact(input.reportedBy, 'person reporting') : undefined;
    if (!reportedBy) throw new ValidationError('Enter who told us, and how to reach them');
    const exit = await this.create(partner, { reason: 'deceased', status: 'requested', cars, openedBy: by, partnerNote: note, reportedBy, estate: { documents: [] } });
    await AssetPartnerModel.updateOne({ _id: partnerId }, { $set: { payoutHold: { reason: 'deceased', since: now, exitId: exit._id } } });
    if (partner.status === 'active') await assetPartnerService.transition(partnerId, 'suspended', { reason: 'Owner passed away; estate in progress' });
    // Authority to rent the car ended with the owner, so no new bookings; trips already booked are for ops to decide.
    await VehicleModel.updateMany({ _id: { $in: cars.map((c) => c.vehicleId) }, status: 'listed' }, { $set: { status: 'paused' } });
    logger.warn({ exitId: exit._id, partnerId }, 'Asset Partner reported deceased; cars paused and payouts held');
    return exit;
  }

  private contact(c: PartnerContact, what: string): PartnerContact {
    const name = tidy(c.name);
    const phone = c.phone.replace(/\D/g, '');
    if (name.length < 2 || phone.length < 10) throw new ValidationError(`Enter the ${what}’s name and phone number`);
    return { name, phone, relation: tidy(c.relation) || 'Not given', ...(tidy(c.email) ? { email: tidy(c.email).toLowerCase() } : {}) };
  }

  async logAttempt(exitId: string, by: string, attempt: Omit<ContactAttempt, 'at' | 'by'>): Promise<AssetPartnerExitDoc> {
    const entry: ContactAttempt = { ...attempt, note: tidy(attempt.note) || undefined, at: new Date(), by };
    const doc = await AssetPartnerExitModel.findOneAndUpdate(
      { _id: exitId, status: { $in: OPEN_EXIT_STATUSES } },
      { $push: { attempts: entry, events: { at: entry.at, by, type: 'contact_attempt', detail: `${attempt.channel} to ${attempt.to.replace('_', ' ')}: ${attempt.outcome.replace('_', ' ')}` } } },
      { new: true },
    ).lean<AssetPartnerExitDoc>();
    if (!doc) throw new ConflictError('This return is closed.', 'EXIT_STATE');
    return doc;
  }

  async setEstateContact(exitId: string, by: string, contact: PartnerContact): Promise<AssetPartnerExitDoc> {
    const c = this.contact(contact, 'estate representative');
    const doc = await AssetPartnerExitModel.findOneAndUpdate(
      { _id: exitId, reason: 'deceased', status: { $in: OPEN_EXIT_STATUSES } },
      { $set: { 'estate.contact': c }, $push: { events: { at: new Date(), by, type: 'estate_contact', detail: `${c.name} (${c.relation})` } } },
      { new: true },
    ).lean<AssetPartnerExitDoc>();
    if (!doc) throw new ConflictError('This return is closed or isn’t for an estate.', 'EXIT_STATE');
    return doc;
  }

  /** Death certificate and the papers that give someone authority over the estate; only the uploader's own private file is accepted. */
  async addEstateDocument(exitId: string, by: string, input: { kind: EstateDocument['kind']; key: string }): Promise<AssetPartnerExitDoc> {
    const file = resolveOwnedUpload({ key: input.key }, by, 'partner_exit');
    const doc = await AssetPartnerExitModel.findOneAndUpdate(
      { _id: exitId, reason: 'deceased', status: { $in: OPEN_EXIT_STATUSES }, 'estate.documents.20': { $exists: false } },
      { $push: { 'estate.documents': { kind: input.kind, key: file.key, url: file.url, uploadedBy: by, uploadedAt: new Date() }, events: { at: new Date(), by, type: 'estate_document', detail: input.kind.replace('_', ' ') } } },
      { new: true },
    ).lean<AssetPartnerExitDoc>();
    if (!doc) throw new ConflictError('This return is closed or isn’t for an estate.', 'EXIT_STATE');
    return doc;
  }

  async verifyEstateDocument(exitId: string, by: string, index: number): Promise<AssetPartnerExitDoc> {
    const exit = await this.load(exitId);
    const d = exit.estate?.documents?.[index];
    if (!d) throw new NotFoundError('Document');
    if (d.uploadedBy === by && (await this.cfg()).exitSeparateApprover !== false) throw new ForbiddenError('Someone other than the uploader has to check this paper.');
    return (await AssetPartnerExitModel.findOneAndUpdate(
      { _id: exitId, [`estate.documents.${index}.key`]: d.key },
      { $set: { [`estate.documents.${index}.verified`]: { by, at: new Date() } }, $push: { events: { at: new Date(), by, type: 'estate_document_checked', detail: d.kind.replace('_', ' ') } } },
      { new: true },
    ).lean<AssetPartnerExitDoc>())!;
  }

  async estateDocumentUrl(exitId: string, index: number): Promise<string> {
    const d = (await this.load(exitId)).estate?.documents?.[index];
    if (!d) throw new NotFoundError('Document');
    return storageGateway.createDownloadUrl(d.key);
  }

  /** Why a case can't be scheduled yet, in plain sentences; empty when it can. */
  private async scheduleBlockers(exit: AssetPartnerExitDoc): Promise<string[]> {
    const cfg = await this.cfg();
    const out: string[] = [];
    if (exit.reason === 'unresponsive') {
      if (exit.noticeEndsAt && new Date() < new Date(exit.noticeEndsAt)) out.push(`The notice period runs until ${longDate(exit.noticeEndsAt)}.`);
      const min = cfg.unresponsiveMinAttempts ?? 3;
      if (exit.attempts.length < min) out.push(`Record at least ${min} attempts to reach them (${exit.attempts.length} so far).`);
      if (exit.attempts.some((a) => a.outcome === 'reached' && a.to === 'partner')) out.push('You reached the partner. Cancel this return, or open one as their request.');
    }
    if (exit.reason === 'deceased' && !exit.estate?.contact) out.push('Add the estate’s representative first.');
    return out;
  }

  private approveBlockers(exit: AssetPartnerExitDoc): string[] {
    const out: string[] = [];
    if (exit.reason === 'deceased') {
      const ok = (kind: EstateDocument['kind']) => exit.estate?.documents?.some((d) => d.kind === kind && d.verified);
      if (!ok('death_certificate')) out.push('A checked death certificate is needed.');
      if (!ok('authority')) out.push('A checked paper showing who can act for the estate is needed.');
    }
    return out;
  }

  async schedule(exitId: string, by: string, input: { scheduledFor: Date; runnerStaffId?: string }): Promise<AssetPartnerExitDoc> {
    const exit = await this.load(exitId);
    const blockers = await this.scheduleBlockers(exit);
    if (blockers.length) throw new ConflictError(blockers.join(' '), 'EXIT_NOT_READY');
    if (chicagoDay(input.scheduledFor) < chicagoDay(new Date())) throw new ValidationError('Pick today or a later date');

    let runner: AssetPartnerExitDoc['runner'];
    if (input.runnerStaffId) {
      const hostIds = await VehicleModel.distinct('hostId', { _id: { $in: exit.cars.map((c) => c.vehicleId) } });
      const staff = await HostStaffModel.findOne({ _id: input.runnerStaffId, hostId: { $in: hostIds }, status: 'active', userId: { $exists: true } })
        .select('_id userId name')
        .lean<{ _id: string; userId: string; name: string }>();
      if (!staff) throw new ValidationError('Pick an active runner from your team');
      runner = { staffId: staff._id, userId: staff.userId, name: staff.name, assignedAt: new Date() };
    } else {
      const me = await UserModel.findById(by).select('firstName lastName email').lean<{ firstName?: string; lastName?: string; email?: string }>();
      runner = { userId: by, name: [me?.firstName, me?.lastName].filter(Boolean).join(' ') || me?.email || 'Operations', assignedAt: new Date() };
    }

    const done = await this.move(
      exitId,
      ['requested', 'notice', 'scheduled'],
      { status: 'scheduled', scheduledFor: input.scheduledFor, runner },
      { by, type: exit.status === 'scheduled' ? 'rescheduled' : 'scheduled', detail: `${longDate(input.scheduledFor)}, runner ${runner.name}` },
    );
    if (exit.runner && exit.runner.userId !== runner.userId) void this.tellRunner(exit.runner.userId, 'Return moved to someone else', `${exit.reference} is no longer yours.`, exitId);
    void this.tellRunner(runner.userId, 'New car return', `${exit.reference}: ${exit.cars.map((c) => c.label).join(', ')} on ${longDate(input.scheduledFor)}.`, exitId);
    if (exit.reason !== 'deceased') {
      const partner = await assetPartnerService.getById(exit.partnerId);
      await this.tell(partner, 'return_scheduled', 'Your car return is booked', `${exit.reference}: ${longDate(input.scheduledFor)}. ${runner.name} from CatoDrive will hand it over. Please make sure your own insurance covers the car from that day.`, exitId);
    }
    return done;
  }

  async cancelByOps(exitId: string, by: string, reason: string): Promise<AssetPartnerExitDoc> {
    const text = tidy(reason);
    if (text.length < 5) throw new ValidationError('Say why you’re cancelling');
    const exit = await this.load(exitId);
    const done = await this.move(exitId, ['requested', 'notice', 'scheduled', 'in_progress', 'submitted'], { status: 'cancelled', cancelled: { by, at: new Date(), reason: text } }, { by, type: 'cancelled', detail: text });
    if (exit.reason !== 'deceased') await this.releaseHoldFor(exit.partnerId, exitId);
    if (exit.runner) void this.tellRunner(exit.runner.userId, 'Return cancelled', `${exit.reference} was cancelled.`, exitId);
    if (exit.reason === 'partner_request') {
      const partner = await assetPartnerService.getById(exit.partnerId);
      await this.tell(partner, 'return_cancelled', 'Your car return was cancelled', `${exit.reference}: ${text}`, exitId);
    }
    return done;
  }

  // ── Runner side ─────────────────────────────────────────────────────

  private assertRunnerOrOps(exit: AssetPartnerExitDoc, userId: string, isOps: boolean): void {
    if (!isOps && exit.runner?.userId !== userId) throw new ForbiddenError('This return isn’t assigned to you.');
  }

  /** The runner starts: every car must be free of guest trips, then comes off the marketplace. */
  async start(exitId: string, userId: string, isOps = false): Promise<AssetPartnerExitDoc> {
    const exit = await this.load(exitId);
    this.assertRunnerOrOps(exit, userId, isOps);
    if (exit.status !== 'scheduled') throw new ConflictError('This return isn’t ready to start.', 'EXIT_STATE');
    for (const car of exit.cars) {
      const trips = await vehicleService.upcomingTrips(car.vehicleId);
      if (trips > 0) throw new ConflictError(`${car.label} still has ${trips} guest trip${trips === 1 ? '' : 's'} booked. Operations must finish or move them first.`, 'HAS_ACTIVE_BOOKINGS');
    }
    const done = await this.move(exitId, ['scheduled'], { status: 'in_progress', startedAt: new Date() }, { by: userId, type: 'started' });
    for (const car of exit.cars) await vehicleService.retireFromMarketplace(car.vehicleId);
    return done;
  }

  async updateCar(exitId: string, userId: string, vehicleId: string, patch: CarUpdate, isOps = false): Promise<AssetPartnerExitDoc> {
    const exit = await this.load(exitId);
    this.assertRunnerOrOps(exit, userId, isOps);
    if (exit.status !== 'in_progress') throw new ConflictError('Start the return before filling in the checklist.', 'EXIT_STATE');
    const idx = exit.cars.findIndex((c) => c.vehicleId === vehicleId);
    if (idx < 0) throw new NotFoundError('Car');
    const car: ExitCar = { ...exit.cars[idx], checklist: [...(exit.cars[idx].checklist ?? freshChecklist())], photos: [...exit.cars[idx].photos] };
    const now = new Date();

    for (const item of patch.items ?? []) {
      if (!MANUAL.has(item.key)) throw new ValidationError(`“${LABEL.get(item.key)?.label ?? item.key}” is checked automatically`);
      const at = car.checklist.findIndex((i) => i.key === item.key);
      const next: ChecklistItem = { key: item.key, auto: false, required: true, done: item.done, note: tidy(item.note) || undefined, doneAt: item.done ? now : undefined, doneBy: item.done ? userId : undefined };
      if (at >= 0) car.checklist[at] = next;
      else car.checklist.push(next);
    }
    if (patch.odometer !== undefined) car.odometer = patch.odometer;
    if (patch.fuelLevel !== undefined) car.fuelLevel = patch.fuelLevel;
    if (patch.keysReturned !== undefined) car.keysReturned = patch.keysReturned;
    if (patch.damageNotes !== undefined) car.damageNotes = tidy(patch.damageNotes) || undefined;
    if (patch.removePhotoKeys?.length) car.photos = car.photos.filter((p) => !patch.removePhotoKeys!.includes(p.key));
    for (const p of patch.addPhotos ?? []) {
      const file = resolveOwnedUpload({ key: p.key }, userId, 'trip_photo');
      if (!car.photos.some((x) => x.key === file.key)) car.photos.push({ url: file.url, key: file.key, label: tidy(p.label) || undefined });
    }
    if (car.photos.length > 40) throw new ValidationError('Up to 40 photos per car');

    const doc = await AssetPartnerExitModel.findOneAndUpdate(
      { _id: exitId, status: 'in_progress' },
      { $set: { [`cars.${idx}`]: car } },
      { new: true },
    ).lean<AssetPartnerExitDoc>();
    if (!doc) throw new ConflictError('This return moved on. Reload to see the latest.', 'EXIT_STATE');
    return doc;
  }

  /** The runner hands the car over and sends the case for a manager's approval. */
  async submit(exitId: string, userId: string, handover: HandoverInput, isOps = false): Promise<AssetPartnerExitDoc> {
    const exit = await this.load(exitId);
    this.assertRunnerOrOps(exit, userId, isOps);
    if (exit.status !== 'in_progress') throw new ConflictError('This return isn’t in progress.', 'EXIT_STATE');
    const cfg = await this.cfg();
    const missing: string[] = [];
    const cars: ExitCar[] = [];
    for (const car of exit.cars) {
      const items = evaluate(car, await factsFor(car.vehicleId), cfg.returnPhotoMin ?? 8);
      for (const i of items) if (i.required && !i.done) missing.push(`${car.label}: ${i.label}`);
      // The record keeps what the system checks showed at handover.
      cars.push({ ...car, checklist: items.map(({ label: _l, hint: _h, ...i }) => i) });
    }
    if (missing.length) throw new AppError({ code: 'CHECKLIST_INCOMPLETE', message: `Finish these first: ${missing.slice(0, 6).join('; ')}${missing.length > 6 ? '…' : ''}`, httpStatus: 409 });

    const name = tidy(handover.receiverName);
    if (handover.to !== 'storage') {
      if (name.length < 2) throw new ValidationError('Enter the name of the person receiving the car');
      if (tidy(handover.receiverSignature).toLowerCase() !== name.toLowerCase()) throw new ValidationError('The receiver signs by typing their full name exactly as entered');
      if (!handover.ownerInsuranceConfirmed) throw new ValidationError('Confirm the receiver has their own insurance on the car from today');
    }
    if (exit.reason === 'deceased' && !['estate', 'storage'].includes(handover.to)) throw new ValidationError('This car can only go to the estate’s representative or into storage');
    if (tidy(handover.location).length < 3) throw new ValidationError('Enter where the car was handed over');

    return this.move(
      exitId,
      ['in_progress'],
      {
        status: 'submitted',
        submittedAt: new Date(),
        cars,
        handover: { to: handover.to, receiverName: handover.to === 'storage' ? name || 'CatoDrive storage' : name, receiverSignature: tidy(handover.receiverSignature), location: tidy(handover.location), at: new Date(), ownerInsuranceConfirmed: handover.ownerInsuranceConfirmed },
      },
      { by: userId, type: 'submitted', detail: `Handed to ${handover.to === 'storage' ? 'storage' : name}` },
    );
  }

  async sendBack(exitId: string, by: string, reason: string): Promise<AssetPartnerExitDoc> {
    const text = tidy(reason);
    if (text.length < 5) throw new ValidationError('Say what needs fixing');
    const exit = await this.load(exitId);
    const done = await this.move(exitId, ['submitted'], { status: 'in_progress', sentBack: { by, at: new Date(), reason: text } }, { by, type: 'sent_back', detail: text });
    if (exit.runner) void this.tellRunner(exit.runner.userId, 'Return sent back', `${exit.reference}: ${text}`, exitId);
    return done;
  }

  /** A manager approves: cars leave the programme, toll tags come off CatoDrive's accounts, and the partner exits once no car is left. */
  async approve(exitId: string, by: string, note?: string): Promise<AssetPartnerExitDoc> {
    const exit = await this.load(exitId);
    if (exit.status !== 'submitted') throw new ConflictError('Only a submitted return can be approved.', 'EXIT_STATE');
    const cfg = await this.cfg();
    if (cfg.exitSeparateApprover !== false && exit.runner?.userId === by) throw new ForbiddenError('A different team member has to approve the return the runner did.');
    const blockers = this.approveBlockers(exit);
    if (blockers.length) throw new ConflictError(blockers.join(' '), 'EXIT_NOT_READY');

    const done = await this.move(exitId, ['submitted'], { status: 'completed', approval: { by, at: new Date(), note: tidy(note) || undefined }, completedAt: new Date() }, { by, type: 'approved', detail: tidy(note) || undefined });

    const ids = exit.cars.map((c) => c.vehicleId);
    const now = new Date();
    await VehicleModel.updateMany({ _id: { $in: ids }, assetPartnerEndedAt: null }, { $set: { assetPartnerEndedAt: now } });
    await VehicleModel.updateMany({ _id: { $in: ids } }, { $set: { status: 'delisted' }, $unset: { tollTagId: 1 } });
    await TollAccountModel.updateMany({ vehicleIds: { $in: ids } }, { $pull: { vehicleIds: { $in: ids } } });

    const left = await VehicleModel.countDocuments({ assetPartnerId: exit.partnerId, assetPartnerEndedAt: null, deletedAt: null });
    const partner = await assetPartnerService.getById(exit.partnerId);
    if (left === 0 && partner.status !== 'exited') await assetPartnerService.transition(exit.partnerId, 'exited');
    logger.info({ exitId, partnerId: exit.partnerId, cars: ids.length, partnerExited: left === 0 }, 'Asset Partner return approved');

    if (exit.reason !== 'deceased') {
      await this.tell(
        partner,
        'return_completed',
        'Your car has been returned',
        `${exit.reference} is complete. ${left === 0 ? 'Your partnership has ended. ' : ''}Your final statement is paid on the usual payout day${partner.payoutHold ? ' once we’ve confirmed your payout details' : ''}.`,
        exitId,
      );
    }
    return done;
  }

  private async releaseHoldFor(partnerId: string, exitId: string): Promise<void> {
    await AssetPartnerModel.updateOne({ _id: partnerId, 'payoutHold.exitId': exitId }, { $unset: { payoutHold: 1 } });
  }

  /** Ops lifts a payout hold; for an estate, only once its papers are checked and the payee is the estate. */
  async releaseHold(partnerId: string, by: string, payee?: { payableTo: string; mailingAddress: string }): Promise<void> {
    const partner = await assetPartnerService.getById(partnerId);
    if (!partner.payoutHold) return;
    if (partner.payoutHold.reason === 'deceased') {
      const exit = partner.payoutHold.exitId ? await AssetPartnerExitModel.findById(partner.payoutHold.exitId).lean<AssetPartnerExitDoc>() : null;
      const blockers = exit ? this.approveBlockers(exit) : ['The estate’s papers are missing.'];
      if (blockers.length) throw new ConflictError(blockers.join(' '), 'EXIT_NOT_READY');
      if (!payee || tidy(payee.payableTo).length < 2 || tidy(payee.mailingAddress).length < 8) throw new ValidationError('Enter who the estate’s check is payable to and where to mail it');
      await AssetPartnerModel.updateOne(
        { _id: partnerId },
        { $set: { payoutDetails: { ...(partner.payoutDetails ?? {}), method: 'check', payableTo: tidy(payee.payableTo), mailingAddress: tidy(payee.mailingAddress) }, 'terms.payoutMethod': 'check' }, $unset: { payoutHold: 1 } },
      );
    } else {
      await AssetPartnerModel.updateOne({ _id: partnerId }, { $unset: { payoutHold: 1 } });
    }
    if (partner.payoutHold.exitId) {
      await AssetPartnerExitModel.updateOne({ _id: partner.payoutHold.exitId }, { $push: { events: { at: new Date(), by, type: 'payout_hold_released' } } });
    }
    logger.info({ partnerId, by, reason: partner.payoutHold.reason }, 'Asset Partner payout hold released');
  }

  private async tellRunner(userId: string, title: string, body: string, exitId: string): Promise<void> {
    await notificationService
      .send({ userId, priority: 'high', deepLink: `/captain/returns/${exitId}`, templateKey: 'ops.asset_partner_return_job', title, body, data: { exitId } })
      .catch(() => undefined);
  }

  // ── Views ───────────────────────────────────────────────────────────

  async list(opts: { status?: ExitStatus | 'open'; reason?: ExitReason; limit?: number; skip?: number }) {
    const filter: Record<string, unknown> = {};
    if (opts.status === 'open') filter.status = { $in: OPEN_EXIT_STATUSES };
    else if (opts.status) filter.status = opts.status;
    if (opts.reason) filter.reason = opts.reason;
    const limit = Math.min(opts.limit ?? 20, 50);
    const [items, total] = await Promise.all([
      AssetPartnerExitModel.find(filter).sort({ createdAt: -1 }).skip(opts.skip ?? 0).limit(limit).select('-cars.photos -events -estate.documents.key -estate.documents.url').lean<AssetPartnerExitDoc[]>(),
      AssetPartnerExitModel.countDocuments(filter),
    ]);
    const partners = await AssetPartnerModel.find({ _id: { $in: [...new Set(items.map((i) => i.partnerId))] } }).select('_id displayName').lean<{ _id: string; displayName: string }[]>();
    const name = new Map(partners.map((p) => [p._id, p.displayName]));
    return {
      items: items.map((e) => ({
        _id: e._id,
        reference: e.reference,
        reason: e.reason,
        status: e.status,
        partnerId: e.partnerId,
        partnerName: name.get(e.partnerId) ?? 'Partner',
        cars: e.cars.map((c) => ({ vehicleId: c.vehicleId, label: c.label, plate: c.plate })),
        preferredDate: e.preferredDate,
        scheduledFor: e.scheduledFor,
        noticeEndsAt: e.noticeEndsAt,
        runner: e.runner ? { name: e.runner.name } : undefined,
        attempts: e.attempts.length,
        createdAt: e.createdAt,
      })),
      total,
    };
  }

  /** Everything ops needs on one case: the partner's contacts, live checklist, blockers and history. */
  async detail(exitId: string, viewerId: string) {
    const exit = await this.load(exitId);
    const [partner, cfg] = await Promise.all([assetPartnerService.getById(exit.partnerId), this.cfg()]);
    const cars = await Promise.all(exit.cars.map(async (c) => ({ ...c, checklist: evaluate(c, await factsFor(c.vehicleId), cfg.returnPhotoMin ?? 8) })));
    const scheduleBlockers = ['requested', 'notice', 'scheduled'].includes(exit.status) ? await this.scheduleBlockers(exit) : [];
    const approveBlockers = exit.status === 'submitted' ? this.approveBlockers(exit) : [];
    if (exit.status === 'submitted' && cfg.exitSeparateApprover !== false && exit.runner?.userId === viewerId) approveBlockers.push('You did this return, so someone else has to approve it.');
    return {
      ...exit,
      cars,
      estate: exit.estate ? { contact: exit.estate.contact, documents: exit.estate.documents.map(({ key: _k, url: _u, ...d }, index) => ({ ...d, index })) } : undefined,
      partner: {
        _id: partner._id,
        displayName: partner.displayName,
        email: partner.email,
        phone: partner.phone,
        status: partner.status,
        lastSeenAt: partner.lastSeenAt,
        profile: partner.profile,
        payoutHold: partner.payoutHold,
      },
      rules: { photoMin: cfg.returnPhotoMin ?? 8, minAttempts: cfg.unresponsiveMinAttempts ?? 3, separateApprover: cfg.exitSeparateApprover !== false },
      scheduleBlockers,
      approveBlockers,
      reasonLabel: REASON_LABEL[exit.reason],
    };
  }

  /** The runner's jobs: only what they need to find the car and hand it over. */
  async runnerJobs(userId: string) {
    const exits = await AssetPartnerExitModel.find({ 'runner.userId': userId, status: { $in: ['scheduled', 'in_progress', 'submitted'] } })
      .sort({ scheduledFor: 1 })
      .limit(50)
      .lean<AssetPartnerExitDoc[]>();
    return exits.map((e) => ({ _id: e._id, reference: e.reference, status: e.status, scheduledFor: e.scheduledFor, cars: e.cars.map((c) => ({ vehicleId: c.vehicleId, label: c.label, plate: c.plate })), sentBack: e.sentBack }));
  }

  async runnerDetail(exitId: string, userId: string, isOps = false) {
    const exit = await this.load(exitId);
    this.assertRunnerOrOps(exit, userId, isOps);
    const [partner, cfg] = await Promise.all([assetPartnerService.getById(exit.partnerId), this.cfg()]);
    const cars = await Promise.all(exit.cars.map(async (c) => ({ ...c, checklist: evaluate(c, await factsFor(c.vehicleId), cfg.returnPhotoMin ?? 8) })));
    const receiver =
      exit.reason === 'deceased'
        ? exit.estate?.contact
        : { name: partner.displayName, phone: partner.phone ?? '', relation: 'Owner', email: partner.email };
    return {
      _id: exit._id,
      reference: exit.reference,
      reason: exit.reason,
      status: exit.status,
      scheduledFor: exit.scheduledFor,
      handoverPreference: exit.handoverPreference,
      deliveryAddress: exit.deliveryAddress,
      receiver,
      representative: exit.reason === 'unresponsive' ? partner.profile?.representative : undefined,
      cars,
      handover: exit.handover,
      sentBack: exit.sentBack,
      photoMin: cfg.returnPhotoMin ?? 8,
    };
  }

  /** Partners to keep an eye on: gone quiet, visa ending soon, or no emergency contact on file. */
  async watchList() {
    const cfg = await this.cfg();
    const now = Date.now();
    const quietSince = new Date(now - (cfg.unresponsiveAfterDays ?? 60) * DAY);
    const openPartnerIds = await AssetPartnerExitModel.distinct('partnerId', { status: { $in: OPEN_EXIT_STATUSES } });
    const live = { status: { $in: ['onboarding', 'active'] }, _id: { $nin: openPartnerIds } };
    const pick = '_id displayName email phone lastSeenAt approvedAt profile.visaExpiry profile.residency profile.completedAt';
    const [quiet, visa, noContact] = await Promise.all([
      AssetPartnerModel.find({ ...live, $or: [{ lastSeenAt: { $lt: quietSince } }, { lastSeenAt: { $exists: false }, approvedAt: { $lt: quietSince } }] })
        .select(pick)
        .sort({ lastSeenAt: 1 })
        .limit(50)
        .lean<AssetPartnerDoc[]>(),
      AssetPartnerModel.find({ ...live, 'profile.residency': 'visa', 'profile.visaExpiry': { $lt: new Date(now + 45 * DAY) } })
        .select(pick)
        .sort({ 'profile.visaExpiry': 1 })
        .limit(50)
        .lean<AssetPartnerDoc[]>(),
      AssetPartnerModel.find({ status: 'active', 'profile.completedAt': { $exists: false } }).select(pick).limit(50).lean<AssetPartnerDoc[]>(),
    ]);
    const row = (p: AssetPartnerDoc) => ({ _id: p._id, displayName: p.displayName, email: p.email, phone: p.phone, lastSeenAt: p.lastSeenAt, visaExpiry: p.profile?.visaExpiry });
    return { quietAfterDays: cfg.unresponsiveAfterDays ?? 60, quiet: quiet.map(row), visa: visa.map(row), noEmergencyContact: noContact.map(row) };
  }

  async attentionCounts(): Promise<{ returnsRequested: number; returnsToApprove: number }> {
    const [returnsRequested, returnsToApprove] = await Promise.all([
      AssetPartnerExitModel.countDocuments({ status: 'requested' }),
      AssetPartnerExitModel.countDocuments({ status: 'submitted' }),
    ]);
    return { returnsRequested, returnsToApprove };
  }
}

export const assetPartnerExitService = new AssetPartnerExitService();
