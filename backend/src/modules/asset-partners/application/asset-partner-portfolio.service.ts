import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { MaintenanceModel } from '../../maintenance/infrastructure/maintenance.model';
import { hostService } from '../../hosts/application/host.service';
import { AssetPartnerModel, type AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { AssetPartnerIntakeModel } from '../infrastructure/asset-partner-intake.model';
import { assetPartnerStatementService, currentPeriod, type StatementLine } from './asset-partner-statement.service';
import { assetPartnerPayoutService } from './asset-partner-payout.service';
import { intakeStatus, objectionDays } from './asset-partner-intake.service';
import { ValidationError } from '../../../core/errors/app-error';

export interface PortfolioCar {
  vehicleId: string;
  label: string;
  plate?: string;
  photo?: string;
  status: string;
  dailyPrice: number;
  partnerId: string;
  partnerName: string;
  partnerStatus: string;
  managementFeeBps: number;
  since?: Date;
  endedAt?: Date;
  pendingRepairs: number;
  /** This car's line on its partner's statement for the chosen month; absent if it wasn't in the programme then. */
  month?: Omit<StatementLine, 'vehicleId' | 'label'>;
}

export interface PortfolioOverview {
  period: string;
  cars: { inProgramme: number; listed: number; returned: number };
  partners: { active: number; onboarding: number };
  month: { trips: number; gross: number; managementFee: number; insurance: number; detailing: number; partnerNet: number };
  todo: { repairsAwaitingPartner: number; intakesAwaitingPartner: number; unpaidLastMonth: number; lastMonth: string };
}

const isPeriod = (p: string) => /^\d{4}-\d{2}$/.test(p);

function previousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** One view of every partner car: who owns it, what it rents for, and what it earned each side in a month, using the partners' own statements. */
export const assetPartnerPortfolioService = {
  async cars(period = currentPeriod()): Promise<PortfolioCar[]> {
    if (!isPeriod(period)) throw new ValidationError('Pick a month');
    const vehicles = await VehicleModel.find({ assetPartnerId: { $exists: true, $ne: null }, deletedAt: null })
      .select('_id year make model trim registrationNumber photos status pricing.dailyPrice assetPartnerId assetPartnerSince assetPartnerEndedAt createdAt')
      .lean<{
        _id: string; year: number; make: string; model: string; trim?: string; registrationNumber?: string; photos?: { url: string; isCover?: boolean }[];
        status: string; pricing?: { dailyPrice?: number }; assetPartnerId: string; assetPartnerSince?: Date; assetPartnerEndedAt?: Date; createdAt: Date;
      }[]>();
    if (!vehicles.length) return [];

    const partnerIds = [...new Set(vehicles.map((v) => v.assetPartnerId))];
    const [partners, repairs] = await Promise.all([
      AssetPartnerModel.find({ _id: { $in: partnerIds } }).lean<AssetPartnerDoc[]>(),
      MaintenanceModel.aggregate<{ _id: string; n: number }>([
        { $match: { vehicleId: { $in: vehicles.map((v) => v._id) }, approval: 'pending' } },
        { $group: { _id: '$vehicleId', n: { $sum: 1 } } },
      ]).exec(),
    ]);
    const statements = await Promise.all(partners.map((p) => assetPartnerStatementService.statement(p, period)));
    const partnerById = new Map(partners.map((p) => [p._id, p]));
    const feeByPartner = new Map(statements.map((s, i) => [partners[i]._id, s.terms.managementFeeBps]));
    const lineByVehicle = new Map(statements.flatMap((s) => s.lines.map((l) => [l.vehicleId, l] as const)));
    const repairsByVehicle = new Map(repairs.map((r) => [r._id, r.n]));

    return vehicles
      .map((v): PortfolioCar => {
        const p = partnerById.get(v.assetPartnerId);
        const line = lineByVehicle.get(v._id);
        return {
          vehicleId: v._id,
          label: `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ''}`,
          plate: v.registrationNumber,
          photo: (v.photos?.find((ph) => ph.isCover) ?? v.photos?.[0])?.url,
          status: v.status,
          dailyPrice: v.pricing?.dailyPrice ?? 0,
          partnerId: v.assetPartnerId,
          partnerName: p?.displayName ?? 'Unknown partner',
          partnerStatus: p?.status ?? 'unknown',
          managementFeeBps: feeByPartner.get(v.assetPartnerId) ?? 0,
          since: v.assetPartnerSince ?? v.createdAt,
          endedAt: v.assetPartnerEndedAt,
          pendingRepairs: repairsByVehicle.get(v._id) ?? 0,
          ...(line ? { month: { trips: line.trips, gross: line.gross, managementFee: line.managementFee, insurance: line.insurance, detailing: line.detailing, net: line.net } } : {}),
        };
      })
      .sort((a, b) => Number(!!a.endedAt) - Number(!!b.endedAt) || a.partnerName.localeCompare(b.partnerName) || a.label.localeCompare(b.label));
  },

  async overview(period = currentPeriod()): Promise<PortfolioOverview> {
    const lastMonth = previousPeriod(period);
    const [cars, partnerCounts, intakes, payouts] = await Promise.all([
      this.cars(period),
      AssetPartnerModel.aggregate<{ _id: string; n: number }>([{ $match: { status: { $in: ['active', 'onboarding'] } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]).exec(),
      Promise.all([AssetPartnerIntakeModel.find({ partnerResponse: { $exists: false } }).select('catodriveSignature partnerResponse').lean(), objectionDays()])
        .then(([docs, days]) => docs.filter((d) => intakeStatus(d, days).status === 'awaiting_partner')),
      lastMonth < currentPeriod() ? assetPartnerPayoutService.month(lastMonth) : Promise.resolve(null),
    ]);
    const live = cars.filter((c) => !c.endedAt);
    const sum = (pick: (m: NonNullable<PortfolioCar['month']>) => number) => cars.reduce((s, c) => s + (c.month ? pick(c.month) : 0), 0);
    const count = (status: string) => partnerCounts.find((p) => p._id === status)?.n ?? 0;
    return {
      period,
      cars: { inProgramme: live.length, listed: live.filter((c) => c.status === 'listed').length, returned: cars.length - live.length },
      partners: { active: count('active'), onboarding: count('onboarding') },
      month: {
        trips: sum((m) => m.trips),
        gross: sum((m) => m.gross),
        managementFee: sum((m) => m.managementFee),
        insurance: sum((m) => m.insurance),
        detailing: sum((m) => m.detailing),
        partnerNet: sum((m) => m.net),
      },
      todo: {
        repairsAwaitingPartner: cars.reduce((s, c) => s + c.pendingRepairs, 0),
        intakesAwaitingPartner: intakes.length,
        unpaidLastMonth: payouts?.totals.unpaid ?? 0,
        lastMonth,
      },
    };
  },

  /** House Fleet cars with no owner on record yet, for the "record who owns this car" picker. */
  async unassigned(operatorUserId: string): Promise<{ vehicleId: string; label: string; plate?: string; status: string }[]> {
    const host = await hostService.requireHostForUser(operatorUserId);
    const cars = await VehicleModel.find({ hostId: host._id, deletedAt: null, $or: [{ assetPartnerId: { $exists: false } }, { assetPartnerId: null }] })
      .select('_id year make model trim registrationNumber status')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean<{ _id: string; year: number; make: string; model: string; trim?: string; registrationNumber?: string; status: string }[]>();
    return cars.map((v) => ({ vehicleId: v._id, label: `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ''}`, plate: v.registrationNumber, status: v.status }));
  },
};
