import { MaintenanceModel } from '../infrastructure/maintenance.model';

/**
 * Maintenance analytics. Costs feed fleet profitability (P&L) — kept behind a
 * service so other modules never touch the maintenance collection directly.
 */
export class MaintenanceService {
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
