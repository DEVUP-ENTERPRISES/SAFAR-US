import { AssetPartnerModel, type AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { AssetPartnerPayoutModel } from '../infrastructure/asset-partner-payout.model';
import { assetPartnerStatementService, currentPeriod, type PartnerStatement } from './asset-partner-statement.service';
import { buildTextPdf } from './text-pdf';
import { buildStatementPdf, type LedgerVehicle } from './statement-pdf';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { ValidationError } from '../../../core/errors/app-error';
import { AssetPartnerApplicationModel } from '../infrastructure/asset-partner-application.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { toCsv } from '../../../shared/utils/csv';

const usd = (cents: number) => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthName = (period: string) => MONTH.format(new Date(`${period}-01T00:00:00Z`));

export interface YearSummary {
  year: number;
  months: { period: string; trips: number; gross: number; net: number }[];
  totals: { trips: number; gross: number; managementFee: number; insurance: number; detailing: number; repairs: number; noticeRefunds: number; registrationFee: number; net: number };
  /** Money actually sent in the calendar year, which is what a 1099 reports. */
  paidInYear: number;
}

export interface TaxYearRow {
  partnerId: string;
  name: string;
  legalName?: string;
  businessName?: string;
  partnerType: string;
  email?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  payoutMethod?: string;
  payouts: number;
  /** Minor units actually sent in the calendar year. */
  paidCents: number;
  needs1099: boolean;
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

export const assetPartnerReportsService = {
  /** Every partner paid in a calendar year, with what was sent and whether it reaches the 1099 amount set in admin. */
  async taxYear(year: number): Promise<{ year: number; thresholdCents: number; rows: TaxYearRow[] }> {
    const now = new Date();
    if (!Number.isInteger(year) || year < 2024 || year > now.getUTCFullYear()) throw new ValidationError('Pick a year that has started.');
    const [paid, cfg] = await Promise.all([
      AssetPartnerPayoutModel.aggregate<{ _id: string; cents: number; count: number }>([
        { $match: { paidAt: { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) } } },
        { $group: { _id: '$partnerId', cents: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      platformConfigService.get(),
    ]);
    const threshold = cfg.assetPartner.form1099ThresholdCents ?? 0;
    const partners = await AssetPartnerModel.find({ _id: { $in: paid.map((p) => p._id) } })
      .select('displayName businessName partnerType email phone applicationId payoutDetails terms.payoutMethod')
      .lean<AssetPartnerDoc[]>();
    const apps = await AssetPartnerApplicationModel.find({ _id: { $in: partners.map((p) => p.applicationId).filter(Boolean) } })
      .select('fullName address city state zip')
      .lean<{ _id: string; fullName: string; address: string; city: string; state: string; zip: string }[]>();
    const partnerById = new Map(partners.map((p) => [p._id, p]));
    const appById = new Map(apps.map((a) => [a._id, a]));
    const rows = paid.map((t): TaxYearRow => {
      const p = partnerById.get(t._id);
      const a = p?.applicationId ? appById.get(p.applicationId) : undefined;
      return {
        partnerId: t._id, name: p?.displayName ?? 'Removed partner', legalName: a?.fullName, businessName: p?.businessName, partnerType: p?.partnerType ?? '',
        email: p?.email, phone: p?.phone, street: a?.address, city: a?.city, state: a?.state, zip: a?.zip,
        payoutMethod: p?.payoutDetails?.method ?? p?.terms?.payoutMethod, payouts: t.count, paidCents: t.cents, needs1099: t.cents >= threshold,
      };
    });
    rows.sort((x, y) => y.paidCents - x.paidCents || x.name.localeCompare(y.name));
    return { year, thresholdCents: threshold, rows };
  },

  async taxYearCsv(year: number): Promise<{ csv: string; filename: string }> {
    const { rows } = await this.taxYear(year);
    const head = ['Partner', 'Legal name', 'Business', 'Type', 'Email', 'Phone', 'Street', 'City', 'State', 'ZIP', 'Paid by', 'Payouts', `Paid in ${year} (USD)`, 'Needs a 1099'];
    const body = rows.map((r) => [r.name, r.legalName, r.businessName, r.partnerType, r.email, r.phone, r.street, r.city, r.state, r.zip, r.payoutMethod, r.payouts, dollars(r.paidCents), r.needs1099 ? 'Yes' : 'No']);
    return { csv: toCsv([head, ...body]), filename: `catodrive-partner-1099-${year}.csv` };
  },

  async statementPdf(partner: AssetPartnerDoc, period: string): Promise<{ pdf: Buffer; filename: string }> {
    if (!/^\d{4}-\d{2}$/.test(period) || period > currentPeriod()) throw new ValidationError('Pick a month that has started.');
    const s = await assetPartnerStatementService.statement(partner, period);
    const pdf = await buildStatementPdf({ partnerName: partner.displayName, statement: s, vehicles: await this.ledger(s) });
    return { pdf, filename: `catodrive-statement-${period}.pdf` };
  },

  /** Each car on the statement with the completed trips that earned its gross, in the order they happened. */
  async ledger(s: PartnerStatement): Promise<LedgerVehicle[]> {
    const [y, m] = s.period.split('-').map(Number);
    const ids = s.lines.map((l) => l.vehicleId);
    const [cars, trips] = await Promise.all([
      VehicleModel.find({ _id: { $in: ids } }).select('registrationNumber').lean<{ _id: string; registrationNumber?: string }[]>(),
      BookingModel.find({ vehicleId: { $in: ids }, status: 'completed', 'period.end': { $gte: new Date(Date.UTC(y, m - 1, 1)), $lt: new Date(Date.UTC(y, m, 1)) } })
        .sort({ 'period.start': 1 })
        .select('vehicleId period delivery priceBreakdown.subtotal')
        .lean<{ vehicleId: string; period: { start: Date; end: Date }; delivery?: { locationName?: string; address?: string }; priceBreakdown: { subtotal?: { amount: number } } }[]>(),
    ]);
    const plate = new Map(cars.map((c) => [c._id, c.registrationNumber]));
    return s.lines.map((l) => ({
      vehicleId: l.vehicleId,
      label: l.label,
      plate: plate.get(l.vehicleId),
      trips: trips
        .filter((t) => t.vehicleId === l.vehicleId)
        .map((t) => ({ start: t.period.start, end: t.period.end, where: t.delivery?.locationName || t.delivery?.address || 'Picked up at the CatoDrive base', gross: t.priceBreakdown?.subtotal?.amount ?? 0 })),
    }));
  },

  async yearSummary(partner: AssetPartnerDoc, year: number): Promise<YearSummary> {
    const now = new Date();
    if (!Number.isInteger(year) || year < 2024 || year > now.getUTCFullYear()) throw new ValidationError('Pick a year you were a partner in.');
    const lastMonth = year === now.getUTCFullYear() ? now.getUTCMonth() + 1 : 12;
    const periods = Array.from({ length: lastMonth }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
    const statements = await Promise.all(periods.map((p) => assetPartnerStatementService.statement(partner, p)));
    const sum = (pick: (s: PartnerStatement) => number) => statements.reduce((a, s) => a + pick(s), 0);
    const paid = await AssetPartnerPayoutModel.find({ partnerId: partner._id, paidAt: { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) } })
      .select('amount')
      .lean<{ amount: number }[]>();
    return {
      year,
      months: statements.filter((s) => s.lines.length > 0).map((s) => ({ period: s.period, trips: s.totals.trips, gross: s.totals.gross, net: s.totals.net })),
      totals: {
        trips: sum((s) => s.totals.trips),
        gross: sum((s) => s.totals.gross),
        managementFee: sum((s) => s.totals.managementFee),
        insurance: sum((s) => s.totals.insurance),
        detailing: sum((s) => s.totals.detailing),
        repairs: sum((s) => s.totals.repairs),
        noticeRefunds: sum((s) => s.totals.noticeRefunds),
        registrationFee: sum((s) => s.totals.registrationFee ?? 0),
        net: sum((s) => s.totals.net),
      },
      paidInYear: paid.reduce((a, p) => a + p.amount, 0),
    };
  },

  async yearSummaryPdf(partner: AssetPartnerDoc, year: number): Promise<{ pdf: Buffer; filename: string }> {
    const y = await this.yearSummary(partner, year);
    const t = y.totals;
    const body = [
      ...y.months.map((m) => `${monthName(m.period)}: ${m.trips} trips, gross ${usd(m.gross)}, net ${usd(m.net)}`),
      '',
      `Gross bookings: ${usd(t.gross)}`,
      `Management fee: -${usd(t.managementFee)}`,
      `Fleet insurance: -${usd(t.insurance)}`,
      `Detailing: -${usd(t.detailing)}`,
      `Repairs: -${usd(t.repairs)}`,
      `Tolls and tickets refunded: ${usd(t.noticeRefunds)}`,
      ...(t.registrationFee ? [`Registration fee from earnings: -${usd(t.registrationFee)}`] : []),
      `Net earned: ${usd(t.net)}`,
      '',
      `Paid to you in ${year}: ${usd(y.paidInYear)}`,
      'Your 1099 reports what was paid to you in the calendar year. A month earned in December is usually paid in January of the next year.',
    ].join('\n');
    const pdf = await buildTextPdf(`Earnings summary, ${year}`, body, [partner.displayName, 'For your records and your tax preparer']);
    return { pdf, filename: `catodrive-earnings-${year}.pdf` };
  },
};
