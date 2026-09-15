import {
  AssetPartnerApplicationModel,
  type AssetPartnerApplicationDoc,
  type ApplicationStatus,
} from '../infrastructure/asset-partner-application.model';
import type { CreateApplicationDto } from '../dto/asset-partner-application.schemas';
import { UserModel } from '../../users/infrastructure/user.model';
import { hostService } from '../../hosts/application/host.service';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { assetPartnerService } from './asset-partner.service';
import {
  assetPartnerStatementService,
  type PartnerStatement,
} from './asset-partner-statement.service';
import type { AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { NotFoundError, ConflictError } from '../../../core/errors/app-error';
import { randomId } from '../../../shared/utils/uuid';
import { logger } from '../../../infrastructure/logging/logger';

/** "CD-AP-482913" — server-generated, never client-supplied. */
function generateReference(): string {
  const digits = randomId().replace(/\D/g, '').padEnd(6, '0').slice(0, 6);
  return `CD-AP-${digits}`;
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
  /**
   * Public intake. The applicant may or may not have a CATO account yet — this
   * only ever creates a LEAD record; nothing here grants any access.
   */
  async create(
    dto: CreateApplicationDto,
    ctx: { userId?: string; ip?: string; userAgent?: string },
  ): Promise<AssetPartnerApplicationDoc> {
    let reference = generateReference();
    // Vanishingly unlikely to collide, but the reference is user-facing and
    // must be unique — retry once rather than trust a hex slice blindly.
    if (await AssetPartnerApplicationModel.exists({ reference })) reference = generateReference();

    const doc = await AssetPartnerApplicationModel.create({
      reference,
      status: 'submitted',
      fullName: dto.fullName,
      businessName: dto.businessName,
      partnerType: dto.partnerType,
      email: dto.email.toLowerCase(),
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
      submittedByUserId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    logger.info({ reference, email: dto.email }, '🚗 New Asset Partner application submitted');
    return doc.toObject();
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

  async adminList(opts: { status?: ApplicationStatus; limit?: number; skip?: number }): Promise<{
    items: AssetPartnerApplicationDoc[];
    total: number;
  }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const filter: Record<string, unknown> = {};
    if (opts.status) filter.status = opts.status;
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
   * already holds a CATO account, this is where that account's host profile
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
    decision: 'approved' | 'rejected',
    notes?: string,
  ): Promise<AssetPartnerApplicationDoc> {
    const app = await AssetPartnerApplicationModel.findById(id);
    if (!app) throw new NotFoundError('Application');
    if (app.status === 'approved' || app.status === 'rejected') {
      throw new ConflictError(`Application already ${app.status}`, 'ALREADY_DECIDED');
    }

    let hostVerified = false;
    if (decision === 'approved') {
      const user = await UserModel.findOne({ email: app.email, deletedAt: null }).lean();
      if (user) {
        /*
         * The Host record is marketplace plumbing — the seller identity a
         * Vehicle hangs off so partner cars are bookable like any other car.
         * Programme membership is the AssetPartner record: its own lifecycle
         * (onboarding → active → suspended → exited) and its own commercial
         * terms. host.verificationStatus used to carry both jobs and could
         * express neither.
         */
        let host = await hostService.getByUserId(user._id);
        if (!host) {
          host = await hostService.onboard(user._id, app.businessName || app.fullName);
        }
        if (host.verificationStatus !== 'verified') {
          await hostService.setVerification(host._id, 'verified');
        }
        hostVerified = true;

        await assetPartnerService.enrol({
          userId: user._id,
          hostId: host._id,
          applicationId: app._id,
          partnerType: app.partnerType,
          displayName: app.businessName || app.fullName,
          businessName: app.businessName,
          email: app.email,
          phone: app.phone,
        });
      }
    }

    app.status = decision;
    app.reviewedBy = reviewerId;
    app.reviewedAt = new Date();
    app.reviewNotes = notes;
    app.hostVerified = hostVerified;
    await app.save();

    logger.info(
      { reference: app.reference, decision, hostVerified },
      decision === 'approved' ? '✅ Asset Partner application approved' : '❌ Asset Partner application rejected',
    );
    return app.toObject();
  }
}

export const assetPartnerApplicationService = new AssetPartnerApplicationService();
