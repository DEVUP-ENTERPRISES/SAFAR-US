import {
  AssetPartnerApplicationModel,
  type AssetPartnerApplicationDoc,
  type ApplicationStatus,
} from '../infrastructure/asset-partner-application.model';
import type { CreateApplicationDto } from '../dto/asset-partner-application.schemas';
import { UserModel } from '../../users/infrastructure/user.model';
import { hostService } from '../../hosts/application/host.service';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { earningsService } from '../../earnings/application/earnings.service';
import { hostAnalyticsService } from '../../earnings/application/host-analytics.service';
import { payoutService } from '../../payouts/application/payout.service';
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
  /** Host earnings from this vehicle, in minor units. */
  revenue: number;
}

/** What the partner's own dashboard renders — see dashboardFor(). */
export interface PartnerDashboard {
  applications: AssetPartnerApplicationDoc[];
  partner: { approved: boolean; hostId?: string; hostVerified: boolean };
  /** Absent until they hold a host account — nothing can have been earned yet. */
  earnings?: Awaited<ReturnType<typeof earningsService.dashboard>>;
  vehicles: PartnerVehicleSummary[];
  nextPayout?: { amount: number; currency: string; scheduledFor: Date };
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
   * Earnings are only meaningful once they hold a host account, so everything
   * past `applications` is optional and the page renders the stage they are
   * actually at.
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

    const host = await hostService.getByUserId(userId);
    const approved = applications.some((a) => a.status === 'approved');

    const partner = {
      approved,
      hostId: host?._id,
      hostVerified: host?.verificationStatus === 'verified',
    };

    // No host account yet — they are still an applicant, and there is nothing
    // to earn from. Returning empty here rather than zeroed money keeps the UI
    // honest: "not started" is not the same as "$0 earned".
    if (!host) return { applications, partner, vehicles: [] };

    const vehicles = await VehicleModel.find({ hostId: host._id })
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

    const [earnings, revenue, payouts] = await Promise.all([
      earningsService.dashboard(host._id),
      hostAnalyticsService.perVehicleRevenue(vehicles.map((v) => v._id)),
      payoutService.listForHost(host._id),
    ]);

    const byVehicle = new Map(revenue.map((r) => [r._id, r]));

    // The soonest scheduled payout — "when do I get paid" is the question a
    // passive owner opens this page to answer.
    const nextPayout = payouts
      .filter((p) => p.status === 'scheduled')
      .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())[0];

    return {
      applications,
      partner,
      earnings,
      vehicles: vehicles.map((v) => ({
        _id: v._id,
        year: v.year,
        make: v.make,
        model: v.model,
        trim: v.trim,
        status: v.status,
        photo: (v.photos ?? []).find((p) => p.isCover)?.url ?? v.photos?.[0]?.url,
        trips: byVehicle.get(v._id)?.trips ?? 0,
        revenue: byVehicle.get(v._id)?.revenue ?? 0,
      })),
      nextPayout: nextPayout
        ? {
            amount: nextPayout.amount,
            currency: nextPayout.currency,
            scheduledFor: nextPayout.scheduledFor,
          }
        : undefined,
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
        let host = await hostService.getByUserId(user._id);
        if (!host) {
          host = await hostService.onboard(user._id, app.businessName || app.fullName);
        }
        if (host.verificationStatus !== 'verified') {
          await hostService.setVerification(host._id, 'verified');
        }
        hostVerified = true;
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
