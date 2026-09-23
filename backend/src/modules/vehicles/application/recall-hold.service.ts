import { VehicleModel, type VehicleDoc } from '../infrastructure/vehicle.model';
import { DocumentModel } from '../../documents/infrastructure/document.model';
import { vehicleHistoryService } from './vehicle-history.service';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Safety recalls, enforced rather than just displayed.
 *
 * A recall was only ever shown as a note on the listing. This holds the car
 * off the market until someone proves the work was done — but never mid-trip:
 * the hold is applied after a booking ends, so a guest is not stranded by a
 * recall published while they had the keys.
 *
 * Mirrors the compliance-hold mechanism: pause + a flag, and only ever restore
 * a car this put on hold, so a host's own pause is never overridden.
 */
export const recallHoldService = {
  /** Has anyone proven this car's recall work was done? */
  async hasVerifiedReceipt(vehicleId: string): Promise<boolean> {
    const doc = await DocumentModel.findOne({
      vehicleId,
      category: 'recall_receipt',
      'verification.status': 'verified',
      deletedAt: null,
    }).lean();
    return !!doc;
  },

  /**
   * Called when a trip ends. Holds the car if NHTSA still lists an open recall
   * for its model year and nobody has produced a verified repair receipt.
   */
  async applyAfterTrip(vehicleId: string): Promise<boolean> {
    try {
      const v = await VehicleModel.findOne({ _id: vehicleId, deletedAt: null }).lean<VehicleDoc>();
      if (!v || v.status !== 'listed') return false;

      const recalls = await vehicleHistoryService.recalls(v.make, v.model, v.year);
      if (recalls.length === 0) return false;
      if (await this.hasVerifiedReceipt(vehicleId)) return false;

      await VehicleModel.updateOne({ _id: vehicleId }, { status: 'paused', recallHold: true });
      logger.warn({ vehicleId, recalls: recalls.length }, '🛠️ vehicle placed on recall hold after trip');
      return true;
    } catch (err) {
      // A recall lookup outage must never break trip completion.
      logger.warn({ vehicleId, err: (err as Error).message }, 'recall hold check failed');
      return false;
    }
  },

  /**
   * Called when ops verifies a repair receipt. Releases the hold so the car can
   * be booked again — only if this service is what paused it.
   */
  async releaseIfHeld(vehicleId: string): Promise<boolean> {
    const v = await VehicleModel.findOne(
      { _id: vehicleId, recallHold: true, status: 'paused' },
      { _id: 1 },
    ).lean();
    if (!v) return false;
    await VehicleModel.updateOne({ _id: vehicleId }, { status: 'listed', recallHold: false });
    logger.info({ vehicleId }, '✅ recall hold released — repair receipt verified');
    return true;
  },
};
