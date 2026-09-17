import { MaintenanceModel, type MaintenanceDoc } from '../../maintenance/infrastructure/maintenance.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { assetPartnerService } from './asset-partner.service';
import { notificationService } from '../../notifications/application/notification.service';
import { NotFoundError, ConflictError, ForbiddenError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';
import type { AssetPartnerDoc } from '../infrastructure/asset-partner.model';

/**
 * Maintenance approval for Asset Partner vehicles.
 *
 * The published agreement: "Routine maintenance under $500 is handled without
 * interrupting you. Anything above $500 requires your approval first." Ops
 * schedules the work (a partner does not run their own maintenance calendar —
 * that is the self-service host flow in maintenance.routes.ts, a different
 * product for a different kind of owner). This service is the gate: does a
 * given cost clear the partner's threshold, and if not, get their yes/no
 * before work proceeds.
 */
export class AssetPartnerMaintenanceService {
  /**
   * Ops creates a maintenance record for a partner-managed vehicle. Whether it
   * needs the partner's sign-off is computed from THEIR terms, not asked for —
   * an ops user should not have to know each partner's negotiated threshold.
   */
  async create(input: {
    vehicleId: string;
    type: MaintenanceDoc['type'];
    scheduledFor: Date;
    costCents?: number;
    odometerKm?: number;
    notes?: string;
  }): Promise<MaintenanceDoc> {
    const vehicle = await VehicleModel.findById(input.vehicleId).lean();
    if (!vehicle) throw new NotFoundError('Vehicle');
    if (!vehicle.assetPartnerId) {
      throw new ConflictError('This vehicle is not Asset Partner-managed', 'NOT_PARTNER_VEHICLE');
    }

    const partner = await assetPartnerService.getById(vehicle.assetPartnerId);
    const terms = await assetPartnerService.termsFor(partner);
    const cost = input.costCents ?? 0;
    const needsApproval = cost > terms.maintenanceApprovalCents;

    const rec = await MaintenanceModel.create({
      vehicleId: input.vehicleId,
      hostId: vehicle.hostId,
      type: input.type,
      scheduledFor: input.scheduledFor,
      cost: input.costCents,
      odometerKm: input.odometerKm,
      notes: input.notes,
      assetPartnerId: partner._id,
      approval: needsApproval ? 'pending' : 'not_required',
      approvalThresholdCents: terms.maintenanceApprovalCents,
    });

    if (needsApproval) {
      // The one notification a passive owner actually needs to act on — every
      // other update in the programme is informational.
      await notificationService
        .send({
          userId: partner.userId,
          priority: 'high',
          templateKey: 'asset_partner.maintenance_approval',
          title: 'Maintenance needs your approval',
          body: `A ${input.type} estimated at ${(cost / 100).toFixed(2)} on one of your vehicles is above your ${(terms.maintenanceApprovalCents / 100).toFixed(2)} approval line.`,
          deepLink: '/asset-partners/maintenance',
          data: { maintenanceId: rec._id, vehicleId: input.vehicleId },
        })
        .catch((err) => logger.warn({ err, maintenanceId: rec._id }, 'partner maintenance-approval notification failed'));
    }

    logger.info(
      { maintenanceId: rec._id, vehicleId: input.vehicleId, needsApproval, costCents: cost },
      'Asset Partner maintenance record created',
    );
    return rec.toObject();
  }

  /** Everything awaiting or decided for this partner's vehicles. */
  async listForPartner(
    partner: AssetPartnerDoc,
    opts: { approval?: MaintenanceDoc['approval'] } = {},
  ): Promise<MaintenanceDoc[]> {
    const filter: Record<string, unknown> = { assetPartnerId: partner._id };
    if (opts.approval) filter.approval = opts.approval;
    return MaintenanceModel.find(filter).sort({ scheduledFor: -1 }).lean<MaintenanceDoc[]>();
  }

  private async getOwned(userId: string, maintenanceId: string): Promise<MaintenanceDoc> {
    const partner = await assetPartnerService.getByUserId(userId);
    if (!partner) throw new ForbiddenError('Not an Asset Partner');
    const rec = await MaintenanceModel.findOne({
      _id: maintenanceId,
      assetPartnerId: partner._id,
    }).lean<MaintenanceDoc>();
    if (!rec) throw new NotFoundError('Maintenance record');
    return rec;
  }

  async approve(userId: string, maintenanceId: string): Promise<MaintenanceDoc> {
    const rec = await this.getOwned(userId, maintenanceId);
    if (rec.approval !== 'pending') {
      throw new ConflictError('This request is not awaiting approval', 'NOT_PENDING');
    }
    await MaintenanceModel.updateOne(
      { _id: maintenanceId },
      { approval: 'approved', approvedAt: new Date(), approvedBy: userId },
    );
    logger.info({ maintenanceId }, 'Asset Partner approved maintenance');
    return this.getOwned(userId, maintenanceId);
  }

  async decline(userId: string, maintenanceId: string, reason?: string): Promise<MaintenanceDoc> {
    const rec = await this.getOwned(userId, maintenanceId);
    if (rec.approval !== 'pending') {
      throw new ConflictError('This request is not awaiting approval', 'NOT_PENDING');
    }
    await MaintenanceModel.updateOne(
      { _id: maintenanceId },
      { approval: 'declined', approvedAt: new Date(), approvedBy: userId, declineReason: reason },
    );
    logger.info({ maintenanceId, reason }, 'Asset Partner declined maintenance');
    return this.getOwned(userId, maintenanceId);
  }
}

export const assetPartnerMaintenanceService = new AssetPartnerMaintenanceService();
