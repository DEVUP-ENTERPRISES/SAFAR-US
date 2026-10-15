import {
  AssetPartnerApplicationModel,
  type AssetPartnerApplicationDoc,
  type ApplicationStatus,
  type ApplicationKind,
} from '../infrastructure/asset-partner-application.model';
import type { CreateApplicationDto, PortalApplicationDto } from '../dto/asset-partner-application.schemas';
import { UserModel } from '../../users/infrastructure/user.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { vinDecodeService, type DecodedVin } from '../../vehicles/application/vin-decode.service';
import { assetPartnerService } from './asset-partner.service';
import {
  assetPartnerStatementService,
  type PartnerStatement,
} from './asset-partner-statement.service';
import type { AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { AppError, NotFoundError, ConflictError, ValidationError } from '../../../core/errors/app-error';
import { assetPartnerAgreementService } from './asset-partner-agreement.service';
import { notificationService } from '../../notifications/application/notification.service';
import { randomId } from '../../../shared/utils/uuid';
import { logger } from '../../../infrastructure/logging/logger';

/** "CD-AP-482913" — server-generated, never client-supplied. */
function generateReference(): string {
  const digits = randomId().replace(/\D/g, '').padEnd(6, '0').slice(0, 6);
  return `CD-AP-${digits}`;
}

const OPEN: ApplicationStatus[] = ['submitted', 'under_review', 'changes_requested'];

function fieldsFrom(dto: PortalApplicationDto) {
  return {
    fullName: dto.fullName,
    businessName: dto.businessName,
    partnerType: dto.partnerType,
    phone: dto.phone,
    address: dto.address,
    city: dto.city,
    state: dto.state.toUpperCase(),
    zip: dto.zip,
    referral: dto.referral,
    vehicle: dto.vehicle,
    ownership: dto.ownership,
    lienholder: dto.lienholder,
    lienAccountLast4: dto.lienAccountLast4,
    estimatedMarketValue: dto.estimatedMarketValue,
    hadAccident: dto.accident === 'yes',
    accidentDetail: dto.accidentDetail,
    smokeFree: dto.smokeFree === 'yes',
    petFree: dto.petFree === 'yes',
    hasMaintenanceRecords: dto.hasMaintenanceRecords ? dto.hasMaintenanceRecords === 'yes' : undefined,
    photos: dto.photos ?? [],
    insurance: dto.insurance,
    availability: dto.availability,
    preferredZone: dto.preferredZone,
    targetStartDate: dto.targetStartDate,
    notes: dto.notes,
    acknowledgedAccurate: dto.acknowledgedAccurate,
    acknowledgedInspection: dto.acknowledgedInspection,
    acknowledgedTerms: dto.acknowledgedTerms,
    signature: dto.signature,
    signedAt: dto.signDate,
  };
}

export type ReviewDecision = 'approved' | 'changes_requested' | 'rejected';

export type OnboardingStage = 'verify_email' | 'apply' | 'review' | 'changes' | 'rejected' | 'agreement' | 'payout' | 'ready';

export interface PartnerOnboarding {
  stage: OnboardingStage;
  email?: string;
  emailVerified: boolean;
  application?: AssetPartnerApplicationDoc;
  partner?: { displayName: string; status: string };
  /** Null while CatoDrive has not published an agreement yet. */
  agreement?: { version: number; title: string; body: string } | null;
  payoutMethod?: 'check' | 'zelle';
}

export interface PartnerVehicleSummary {
  _id: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  status: string;
  photo?: string;
  trips: number;
  /** Gross booking revenue this car produced this month, in minor units. */
  gross: number;
  /** Partner net for this car this month — gross less fee, insurance, detailing. */
  net: number;
}

/** What the partner's own dashboard renders — see dashboardFor(). */
export interface PartnerDashboard {
  applications: AssetPartnerApplicationDoc[];
  /** Programme membership. Absent until an application is approved. */
  partner?: Pick<
    AssetPartnerDoc,
    '_id' | 'status' | 'partnerType' | 'displayName' | 'approvedAt' | 'activatedAt'
  >;
  /**
   * This month so far, on PARTNER terms — gross less management fee, fleet
   * insurance and detailing. Absent until they are in the programme.
   */
  currentStatement?: PartnerStatement;
  /** Recent closed months, newest first — the earnings history. */
  history?: PartnerStatement[];
  vehicles: PartnerVehicleSummary[];
}

export class AssetPartnerApplicationService {
  /** Public intake from the guest site; creates a lead only and grants no access. */
  async create(
    dto: CreateApplicationDto,
    ctx: { userId?: string; ip?: string; userAgent?: string },
  ): Promise<AssetPartnerApplicationDoc> {
    return this.insert(dto, ctx, { kind: 'partner', email: dto.email.toLowerCase() });
  }

  /** An application from a signed-in, email-verified account: a new partner, or another car from an existing one. */
  async createForAccount(
    userId: string,
    dto: PortalApplicationDto,
    ctx: { ip?: string; userAgent?: string },
  ): Promise<AssetPartnerApplicationDoc> {
    const user = await this.verifiedUser(userId);
    const partner = await assetPartnerService.getByUserId(userId);
    if (partner) {
      await assetPartnerService.requirePortalReady(userId);
      return this.insert(dto, { ...ctx, userId }, { kind: 'vehicle', partnerId: partner._id, email: user.email });
    }
    const open = await AssetPartnerApplicationModel.exists({ submittedByUserId: userId, kind: 'partner', status: { $in: OPEN } });
    if (open) throw new ConflictError('You already have an application with us.', 'APPLICATION_OPEN');
    return this.insert(dto, { ...ctx, userId }, { kind: 'partner', email: user.email });
  }

  /** Sends an application back after CatoDrive asked for changes. */
  async resubmit(userId: string, id: string, dto: PortalApplicationDto): Promise<AssetPartnerApplicationDoc> {
    const user = await this.verifiedUser(userId);
    const doc = await AssetPartnerApplicationModel.findOneAndUpdate(
      { _id: id, submittedByUserId: userId, status: 'changes_requested' },
      { $set: { ...fieldsFrom(dto), email: user.email, status: 'submitted' } },
      { new: true },
    ).lean<AssetPartnerApplicationDoc>();
    if (!doc) throw new NotFoundError('Application');
    logger.info({ reference: doc.reference }, 'Asset Partner application resubmitted');
    return doc;
  }

  async lookupVin(raw: string): Promise<{ decoded: DecodedVin | null; alreadyWithUs: boolean }> {
    const vin = raw.trim().toUpperCase();
    const [decodedList, listed, applied] = await Promise.all([
      vinDecodeService.decodeBatch([vin]).catch((err) => {
        logger.warn({ err }, 'VIN decode unavailable');
        return [] as DecodedVin[];
      }),
      VehicleModel.exists({ vin, deletedAt: null }),
      AssetPartnerApplicationModel.exists({ 'vehicle.vin': vin, status: { $in: [...OPEN, 'approved'] } }),
    ]);
    const decoded = decodedList[0];
    return { decoded: decoded?.ok ? decoded : null, alreadyWithUs: !!(listed || applied) };
  }

  private async verifiedUser(userId: string): Promise<{ email: string }> {
    const user = await UserModel.findOne({ _id: userId, deletedAt: null }).select('email emailVerified').lean<{ email?: string; emailVerified?: boolean }>();
    if (!user) throw new NotFoundError('User');
    if (!user.email || !user.emailVerified) {
      throw new AppError({ code: 'EMAIL_NOT_VERIFIED', message: 'Confirm your email first.', httpStatus: 403 });
    }
    return { email: user.email.toLowerCase() };
  }

  private async insert(
    dto: PortalApplicationDto,
    ctx: { userId?: string; ip?: string; userAgent?: string },
    extra: { kind: ApplicationKind; partnerId?: string; email: string },
  ): Promise<AssetPartnerApplicationDoc> {
    let reference = generateReference();
    if (await AssetPartnerApplicationModel.exists({ reference })) reference = generateReference();

    const doc = await AssetPartnerApplicationModel.create({
      reference,
      status: 'submitted',
      ...fieldsFrom(dto),
      ...extra,
      submittedByUserId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    logger.info({ reference, kind: extra.kind }, '🚗 New Asset Partner application submitted');
    return doc.toObject();
  }

  /** Where a signed-in account is in becoming a partner; the portal shows only this step until it is 'ready'. */
  async onboarding(userId: string): Promise<PartnerOnboarding> {
    const user = await UserModel.findOne({ _id: userId, deletedAt: null }).select('email emailVerified').lean<{ email?: string; emailVerified?: boolean }>();
    if (!user) throw new NotFoundError('User');
    const base = { email: user.email, emailVerified: !!user.emailVerified };

    const partner = await assetPartnerService.getByUserId(userId);
    if (partner) {
      const stage = await assetPartnerService.portalStage(partner);
      const summary = { displayName: partner.displayName, status: partner.status };
      if (stage === 'agreement') {
        const agreement = await assetPartnerAgreementService.current();
        return { ...base, stage, partner: summary, agreement: agreement ? { version: agreement.version, title: agreement.title, body: agreement.body } : null };
      }
      if (stage === 'payout') {
        const { payoutMethod } = await assetPartnerService.termsFor(partner);
        return { ...base, stage, partner: summary, payoutMethod };
      }
      return { ...base, stage, partner: summary };
    }

    if (!base.emailVerified) return { ...base, stage: 'verify_email' };
    const application = await AssetPartnerApplicationModel.findOne({ submittedByUserId: userId, kind: 'partner' })
      .sort({ createdAt: -1 })
      .lean<AssetPartnerApplicationDoc>();
    if (!application) return { ...base, stage: 'apply' };
    const stage = application.status === 'changes_requested' ? 'changes' : application.status === 'rejected' ? 'rejected' : 'review';
    return { ...base, stage, application };
  }

  /**
   * Everything the partner's own dashboard needs, in one call.
   *
   * Applications are matched on the ACCOUNT EMAIL as well as submittedByUserId:
   * the intake form is public and never asks for a password, so most applicants
   * are not signed in when they submit. Matching only on the user id meant
   * someone who applied first and registered afterwards — the common path —
   * could never see their own application again.
   *
   * Money is reported on PARTNER terms — gross less the management fee, fleet
   * insurance and detailing — never host earnings, which omit the two
   * recurring costs and would overstate what the partner actually receives.
   */
  async dashboardFor(userId: string): Promise<PartnerDashboard> {
    const user = await UserModel.findOne({ _id: userId, deletedAt: null }).lean();
    if (!user) throw new NotFoundError('User');

    // An account can have no email at all (phone-only signup; Apple withholds
    // it), so only add the email clause when there is one to match on.
    const match: Record<string, unknown>[] = [{ submittedByUserId: userId }];
    if (user.email) match.push({ email: user.email.toLowerCase() });

    const applications = await AssetPartnerApplicationModel.find({ $or: match })
      .sort({ createdAt: -1 })
      .lean<AssetPartnerApplicationDoc[]>();

    const partner = await assetPartnerService.getByUserId(userId);

    // Still an applicant. Nothing is owed, and reporting zeroed money here
    // would read as "my car earned nothing" rather than "not started yet".
    if (!partner) return { applications, vehicles: [] };

    const vehicles = await VehicleModel.find({ assetPartnerId: partner._id })
      .select('_id year make model trim status photos')
      .lean<
        {
          _id: string;
          year: number;
          make: string;
          model: string;
          trim?: string;
          status: string;
          photos?: { url: string; isCover?: boolean }[];
        }[]
      >();

    const [currentStatement, history] = await Promise.all([
      assetPartnerStatementService.statement(partner),
      assetPartnerStatementService.history(partner, 6),
    ]);

    // Per-vehicle figures come off the same statement the totals do, so a car's
    // row can never disagree with the month it belongs to.
    const byVehicle = new Map(currentStatement.lines.map((l) => [l.vehicleId, l]));

    return {
      applications,
      partner: {
        _id: partner._id,
        status: partner.status,
        partnerType: partner.partnerType,
        displayName: partner.displayName,
        approvedAt: partner.approvedAt,
        activatedAt: partner.activatedAt,
      },
      currentStatement,
      history,
      vehicles: vehicles.map((v) => ({
        _id: v._id,
        year: v.year,
        make: v.make,
        model: v.model,
        trim: v.trim,
        status: v.status,
        photo: (v.photos ?? []).find((p) => p.isCover)?.url ?? v.photos?.[0]?.url,
        trips: byVehicle.get(v._id)?.trips ?? 0,
        /** Partner net for this vehicle this month, not host earnings. */
        net: byVehicle.get(v._id)?.net ?? 0,
        gross: byVehicle.get(v._id)?.gross ?? 0,
      })),
    };
  }

  async adminList(opts: { status?: ApplicationStatus; kind?: ApplicationKind; limit?: number; skip?: number }): Promise<{
    items: AssetPartnerApplicationDoc[];
    total: number;
  }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const filter: Record<string, unknown> = {};
    if (opts.status) filter.status = opts.status;
    if (opts.kind) filter.kind = opts.kind === 'partner' ? { $in: ['partner', null] } : opts.kind;
    const [items, total] = await Promise.all([
      AssetPartnerApplicationModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(opts.skip ?? 0)
        .limit(limit)
        .lean<AssetPartnerApplicationDoc[]>(),
      AssetPartnerApplicationModel.countDocuments(filter),
    ]);
    return { items, total };
  }

  async adminOne(id: string): Promise<AssetPartnerApplicationDoc> {
    const doc = await AssetPartnerApplicationModel.findById(id).lean<AssetPartnerApplicationDoc>();
    if (!doc) throw new NotFoundError('Application');
    return doc;
  }

  /**
   * The approval gate. Approving is the admin decision the business asked
   * for: "only once approved can they onboard a vehicle." If the applicant
   * already holds a CatoDrive account, this is where that account's host profile
   * gets created (if missing) and VERIFIED — which is exactly the flag
   * vehicle.service checks before allowing a listing.
   *
   * If no account exists yet for their email, the application is still marked
   * approved (so the decision is recorded), but `hostVerified` stays false —
   * ops follows up once the applicant registers. Final vehicle listing is
   * still a human "onboarding & agreement" step (photographing the car,
   * confirming terms), matching the published process; this does not
   * auto-create a listing.
   */
  async review(
    id: string,
    reviewerId: string,
    decision: ReviewDecision,
    notes?: string,
  ): Promise<AssetPartnerApplicationDoc> {
    const app = await AssetPartnerApplicationModel.findById(id);
    if (!app) throw new NotFoundError('Application');
    if (app.status === 'approved' || app.status === 'rejected') {
      throw new ConflictError(`Application already ${app.status}`, 'ALREADY_DECIDED');
    }
    if (decision !== 'approved' && !notes?.trim()) {
      throw new ValidationError('Add a note for the applicant');
    }

    let hostVerified = app.hostVerified ?? false;
    // Only a new partner is enrolled; another car from an existing partner goes to inspection and listing by ops.
    if (decision === 'approved' && (app.kind ?? 'partner') === 'partner') {
      const { partner, accountCreated } = await assetPartnerService.enrolByEmail({
        email: app.email,
        fullName: app.fullName,
        businessName: app.businessName,
        phone: app.phone,
        partnerType: app.partnerType,
        applicationId: app._id,
        // Every approved applicant signs the agreement in the portal before the dashboard opens.
        agreementRequired: true,
      });
      app.partnerId = partner._id;
      hostVerified = true;
      if (accountCreated) {
        logger.info(
          { reference: app.reference },
          'Account created for approved applicant who had not registered',
        );
      }
    }

    app.status = decision;
    app.reviewedBy = reviewerId;
    app.reviewedAt = new Date();
    app.reviewNotes = notes;
    app.hostVerified = hostVerified;
    await app.save();

    logger.info({ reference: app.reference, decision, hostVerified }, 'Asset Partner application reviewed');
    await this.tellApplicant(app.toObject(), decision, notes);
    return app.toObject();
  }

  private async tellApplicant(app: AssetPartnerApplicationDoc, decision: ReviewDecision, notes?: string): Promise<void> {
    const userId = app.submittedByUserId ?? (await UserModel.findOne({ email: app.email, deletedAt: null }).select('_id').lean<{ _id: string }>())?._id;
    if (!userId) return;
    const car = `${app.vehicle.year} ${app.vehicle.make} ${app.vehicle.model}`;
    const vehicle = (app.kind ?? 'partner') === 'vehicle';
    const copy: Record<ReviewDecision, { title: string; body: string }> = {
      approved: vehicle
        ? { title: `Your ${car} is approved`, body: 'We’ll contact you to schedule the inspection and get it listed.' }
        : { title: 'You’re approved as a CatoDrive Asset Partner', body: 'Sign your agreement and add your payout details to open your dashboard.' },
      changes_requested: { title: 'Your application needs a few changes', body: notes ?? '' },
      rejected: { title: vehicle ? `We can’t take your ${car} right now` : 'We can’t approve your application right now', body: notes ?? '' },
    };
    await notificationService
      .send({
        userId,
        priority: 'high',
        deepLink: '/asset-partners/dashboard',
        templateKey: `account.asset_partner_application_${decision}`,
        title: copy[decision].title,
        body: copy[decision].body,
        data: { applicationId: app._id, reference: app.reference, decision },
      })
      .catch((err) => logger.warn({ err, reference: app.reference }, 'application review notice failed'));
  }
}

export const assetPartnerApplicationService = new AssetPartnerApplicationService();
