import { DocumentModel } from '../infrastructure/document.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { notificationService } from '../../notifications/application/notification.service';
import { hostService } from '../../hosts/application/host.service';
import { logger } from '../../../infrastructure/logging/logger';

/** Documents a car must have valid to legally carry a paying guest. */
const MANDATORY = ['registration', 'insurance'] as const;

/**
 * Keeps the marketplace legal. A car whose insurance or registration has lapsed
 * must not carry a paying trip — that is the single worst event a P2P mobility
 * platform can have. This pauses such cars automatically and relists them the
 * moment the host renews, with no ops or host action required.
 */
export class DocumentComplianceService {
  /** Vehicle ids that currently have an expired mandatory document. */
  private async expiredVehicleIds(now = new Date()): Promise<Set<string>> {
    const docs = await DocumentModel.find(
      { category: { $in: MANDATORY as unknown as string[] }, expiresAt: { $lt: now }, deletedAt: null },
      { vehicleId: 1 },
    ).lean();
    return new Set(docs.map((d) => d.vehicleId).filter((v): v is string => !!v));
  }

  /** Booking-time guard — belt-and-suspenders for the gap between sweeps. */
  async hasExpiredMandatoryDoc(vehicleId: string): Promise<boolean> {
    const doc = await DocumentModel.findOne({
      vehicleId,
      category: { $in: MANDATORY as unknown as string[] },
      expiresAt: { $lt: new Date() },
      deletedAt: null,
    }).lean();
    return !!doc;
  }

  private async notifyHost(hostId: string, vehicleId: string, kind: 'paused' | 'restored'): Promise<void> {
    try {
      const host = await hostService.getById(hostId);
      await notificationService.send({
        userId: host.userId,
        priority: kind === 'paused' ? 'high' : 'normal',
        templateKey: `vehicle.compliance_${kind}`,
        title: kind === 'paused' ? 'A car was paused — document expired' : 'Your car is live again',
        body:
          kind === 'paused'
            ? 'One of your cars was paused because its insurance or registration has expired. Upload a valid document to relist it.'
            : 'Your renewed document was accepted and the car is bookable again.',
        deepLink: `/host/listings/${vehicleId}`,
      });
    } catch (err) {
      logger.warn({ err, vehicleId }, 'compliance notify failed');
    }
  }

  /**
   * Sweep: pause listed cars with a lapsed mandatory doc; relist compliance-held
   * cars whose docs are all valid again. Deliberately only touches cars that
   * actually HAVE an expired doc — a car that never uploaded insurance is an
   * onboarding matter, not something this job silently takes down.
   */
  async sweep(): Promise<{ paused: number; restored: number }> {
    const expired = await this.expiredVehicleIds();
    let paused = 0;
    let restored = 0;

    // Pause: a currently-listed car with an expired mandatory doc.
    for (const vehicleId of expired) {
      const v = await VehicleModel.findOne({ _id: vehicleId }, { status: 1, hostId: 1 }).lean();
      if (v && v.status === 'listed') {
        await VehicleModel.updateOne({ _id: vehicleId }, { status: 'paused', complianceHold: true });
        await this.notifyHost(v.hostId, vehicleId, 'paused');
        paused += 1;
      }
    }

    // Restore: a compliance-held car whose docs are all valid again. Only cars
    // this job paused (status 'paused' + flag) — never a host's own pause/delist.
    const held = await VehicleModel.find({ complianceHold: true, status: 'paused' }, { hostId: 1 }).lean();
    for (const v of held) {
      if (!expired.has(v._id)) {
        await VehicleModel.updateOne({ _id: v._id }, { status: 'listed', complianceHold: false });
        await this.notifyHost(v.hostId, v._id, 'restored');
        restored += 1;
      }
    }

    return { paused, restored };
  }
}

export const documentComplianceService = new DocumentComplianceService();
