import { MaintenanceModel } from '../infrastructure/maintenance.model';
import { hostService } from '../../hosts/application/host.service';
import { notificationService } from '../../notifications/application/notification.service';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Maintenance analytics. Costs feed fleet profitability (P&L) — kept behind a
 * service so other modules never touch the maintenance collection directly.
 */
export class MaintenanceService {
  /**
   * Cron: remind hosts of maintenance due within the next 24h. Marked once so a
   * host isn't pinged every hour for the same service.
   */
  async remindDue(): Promise<number> {
    const soon = new Date(Date.now() + 24 * 3_600_000);
    const due = await MaintenanceModel.find({
      status: 'scheduled',
      reminded: { $ne: true },
      scheduledFor: { $lte: soon },
    }).lean();

    let sent = 0;
    for (const m of due) {
      try {
        const host = await hostService.getById(m.hostId);
        await notificationService.send({
          userId: host.userId,
          priority: 'normal',
          templateKey: 'vehicle.maintenance_due',
          title: 'Maintenance due soon',
          body: `A ${m.type} is scheduled for ${new Date(m.scheduledFor).toLocaleDateString()} on one of your cars.`,
          deepLink: `/host/listings/${m.vehicleId}`,
          data: { vehicleId: m.vehicleId, maintenanceId: m._id },
        });
        await MaintenanceModel.updateOne({ _id: m._id }, { reminded: true });
        sent += 1;
      } catch (err) {
        logger.warn({ err, maintenanceId: m._id }, 'maintenance reminder failed');
      }
    }
    if (sent) logger.info({ sent }, 'maintenance reminders sent');
    return sent;
  }

  /** Total maintenance spend per vehicle (used for fleet net-profit). */
  async costByVehicles(vehicleIds: string[]): Promise<Record<string, number>> {
    if (vehicleIds.length === 0) return {};
    const rows = await MaintenanceModel.aggregate<{ _id: string; cost: number }>([
      { $match: { vehicleId: { $in: vehicleIds }, cost: { $gt: 0 } } },
      { $group: { _id: '$vehicleId', cost: { $sum: '$cost' } } },
    ]).exec();
    const map: Record<string, number> = {};
    for (const r of rows) map[r._id] = r.cost;
    return map;
  }
}

export const maintenanceService = new MaintenanceService();
