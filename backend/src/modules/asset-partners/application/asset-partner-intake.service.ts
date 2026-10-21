import { AssetPartnerIntakeModel, type AssetPartnerIntakeDoc, type FuelLevel } from '../infrastructure/asset-partner-intake.model';
import { AssetPartnerApplicationModel, type AssetPartnerApplicationDoc } from '../infrastructure/asset-partner-application.model';
import type { AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { assetPartnerService } from './asset-partner.service';
import { buildTextPdf } from './asset-partner-agreement.service';
import { notificationService } from '../../notifications/application/notification.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

export type IntakeStatus = 'awaiting_partner' | 'acknowledged' | 'objected' | 'deemed_accepted';

export interface IntakeInput {
  applicationId?: string;
  vehicleId?: string;
  vehicle: { year: string; make: string; model: string; trim?: string; color?: string; vin: string; plate: string };
  odometer: number;
  estimatedMarketValue?: string;
  listingUrl?: string;
  intakeDate: Date;
  location: string;
  fuelLevel: FuelLevel;
  preExistingDamage: string;
  conditionNotes?: string;
  photos?: { url: string; key?: string; label?: string }[];
  signedName: string;
  signedTitle: string;
}

const FUEL: Record<FuelLevel, string> = { full: 'Full', three_quarters: '3/4', half: '1/2', quarter: '1/4' };
const day = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });

export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

export function intakeStatus(doc: Pick<AssetPartnerIntakeDoc, 'partnerResponse' | 'catodriveSignature'>, objectionDays: number, now = new Date()): { status: IntakeStatus; respondBy: Date } {
  const respondBy = addBusinessDays(new Date(doc.catodriveSignature.signedAt), objectionDays);
  if (doc.partnerResponse) return { status: doc.partnerResponse.kind, respondBy };
  return { status: now > respondBy ? 'deemed_accepted' : 'awaiting_partner', respondBy };
}

// The objection window is an admin setting (Partner Terms), matching the agreement.
export const objectionDays = async () => (await platformConfigService.get()).assetPartner.intakeObjectionDays ?? 3;
const withStatus = (doc: AssetPartnerIntakeDoc, days: number) => ({ ...doc, ...intakeStatus(doc, days) });

export const assetPartnerIntakeService = {
  /** Fields CatoDrive can start from: the partner's own application for that car. */
  async draftFor(partnerId: string, applicationId?: string): Promise<Partial<IntakeInput>> {
    const filter = applicationId ? { _id: applicationId } : { partnerId };
    const app = await AssetPartnerApplicationModel.findOne(filter).sort({ createdAt: -1 }).lean<AssetPartnerApplicationDoc>();
    if (!app) return {};
    return {
      applicationId: app._id,
      vehicleId: app.vehicleId,
      vehicle: { year: app.vehicle.year, make: app.vehicle.make, model: app.vehicle.model, trim: app.vehicle.trim, color: app.vehicle.exteriorColor, vin: app.vehicle.vin, plate: app.vehicle.plate },
      odometer: app.vehicle.mileage,
      estimatedMarketValue: app.estimatedMarketValue,
    };
  },

  /** CatoDrive records and signs the intake report; the partner is asked to review it. */
  async create(partnerId: string, operatorUserId: string, input: IntakeInput) {
    const partner = await assetPartnerService.getById(partnerId);
    if (!input.preExistingDamage.trim()) throw new ValidationError('Describe any pre-existing damage, or write “None”');
    if (input.signedName.trim().length < 2 || input.signedTitle.trim().length < 2) throw new ValidationError('Sign with your name and title');
    const doc = await AssetPartnerIntakeModel.create({
      partnerId: partner._id,
      applicationId: input.applicationId,
      vehicleId: input.vehicleId,
      vehicle: { ...input.vehicle, vin: input.vehicle.vin.trim().toUpperCase(), plate: input.vehicle.plate.trim().toUpperCase() },
      odometer: input.odometer,
      estimatedMarketValue: input.estimatedMarketValue,
      listingUrl: input.listingUrl,
      intakeDate: input.intakeDate,
      location: input.location.trim(),
      fuelLevel: input.fuelLevel,
      preExistingDamage: input.preExistingDamage.trim(),
      conditionNotes: input.conditionNotes?.trim() || undefined,
      photos: input.photos ?? [],
      catodriveSignature: { name: input.signedName.trim(), title: input.signedTitle.trim(), signedAt: new Date(), userId: operatorUserId },
    });
    const days = await objectionDays();
    const { respondBy } = intakeStatus(doc.toObject(), days);
    logger.info({ partnerId, intakeId: doc._id }, 'Asset Partner intake report signed by CatoDrive');
    void notificationService
      .send({
        userId: partner.userId,
        priority: 'high',
        deepLink: '/asset-partners/documents',
        templateKey: 'account.asset_partner_intake_ready',
        title: 'Please review your car’s intake report',
        body: `CatoDrive recorded your ${input.vehicle.year} ${input.vehicle.make} ${input.vehicle.model}’s condition at intake. Review it by ${day(respondBy)}; after that it stands as written.`,
        data: { intakeId: doc._id },
      })
      .catch(() => undefined);
    return withStatus(doc.toObject(), days);
  },

  async list(partnerId: string) {
    const [docs, days] = await Promise.all([AssetPartnerIntakeModel.find({ partnerId }).sort({ createdAt: -1 }).lean<AssetPartnerIntakeDoc[]>(), objectionDays()]);
    return docs.map((d) => withStatus(d, days));
  },

  async get(partnerId: string, intakeId: string): Promise<AssetPartnerIntakeDoc> {
    const doc = await AssetPartnerIntakeModel.findOne({ _id: intakeId, partnerId }).lean<AssetPartnerIntakeDoc>();
    if (!doc) throw new NotFoundError('Intake report');
    return doc;
  },

  /** The partner agrees with the report, or objects in writing, within the window. */
  async respond(partner: AssetPartnerDoc, intakeId: string, response: { kind: 'acknowledged'; signedName: string } | { kind: 'objected'; objection: string }, ip?: string) {
    const doc = await this.get(partner._id, intakeId);
    const days = await objectionDays();
    const { status } = intakeStatus(doc, days);
    if (status !== 'awaiting_partner') throw new ConflictError('This report can no longer be changed.', 'INTAKE_CLOSED');
    if (response.kind === 'acknowledged' && response.signedName.trim().length < 2) throw new ValidationError('Type your full legal name to sign');
    if (response.kind === 'objected' && response.objection.trim().length < 10) throw new ValidationError('Say what is wrong with the report');
    const partnerResponse = response.kind === 'acknowledged'
      ? { kind: 'acknowledged' as const, signedName: response.signedName.trim(), at: new Date(), ip }
      : { kind: 'objected' as const, objection: response.objection.trim(), at: new Date(), ip };
    const updated = await AssetPartnerIntakeModel.findOneAndUpdate(
      { _id: doc._id, partnerResponse: { $exists: false } },
      { $set: { partnerResponse } },
      { new: true },
    ).lean<AssetPartnerIntakeDoc>();
    if (!updated) throw new ConflictError('This report can no longer be changed.', 'INTAKE_CLOSED');
    return withStatus(updated, days);
  },

  async pdf(partnerId: string, intakeId: string): Promise<{ pdf: Buffer; filename: string }> {
    const d = await this.get(partnerId, intakeId);
    const { status, respondBy } = intakeStatus(d, await objectionDays());
    const v = d.vehicle;
    const lines = [
      `Vehicle: ${[v.year, v.make, v.model, v.trim].filter(Boolean).join(' ')}`,
      `Color: ${v.color || '-'}`,
      `VIN: ${v.vin}`,
      `License plate: ${v.plate}`,
      `Odometer at intake: ${d.odometer.toLocaleString('en-US')} miles`,
      `Estimated market value: ${d.estimatedMarketValue || '-'}`,
      `Listing URL: ${d.listingUrl || '-'}`,
      `Intake date: ${day(new Date(d.intakeDate))}`,
      `Intake location: ${d.location}`,
      `Fuel/charge level at intake: ${FUEL[d.fuelLevel]}`,
      '',
      'Pre-existing damage:',
      d.preExistingDamage,
      '',
      'Condition notes:',
      d.conditionNotes || '-',
      '',
      `Photos on record: ${d.photos.length}`,
      '',
      'Intake Certification: Both parties confirm that the above information is accurate and, together with the accompanying photographic record, constitutes the vehicle’s condition of record under Section 2.5.',
    ].join('\n');
    const partnerLine = d.partnerResponse?.kind === 'acknowledged'
      ? `Asset Partner signature: ${d.partnerResponse.signedName}, ${new Date(d.partnerResponse.at).toUTCString()}${d.partnerResponse.ip ? ` from ${d.partnerResponse.ip}` : ''}.`
      : d.partnerResponse?.kind === 'objected'
        ? `Asset Partner objected on ${new Date(d.partnerResponse.at).toUTCString()}: ${d.partnerResponse.objection}`
        : status === 'deemed_accepted'
          ? `No written objection was received by ${day(respondBy)}; the report is deemed accepted under Section 2.5.`
          : `Awaiting the Asset Partner’s review until ${day(respondBy)}.`;
    const pdf = await buildTextPdf('Exhibit A: Enrolled Vehicle Addendum (Intake Report)', lines, [
      `CatoDrive representative: ${d.catodriveSignature.name}, ${d.catodriveSignature.title}. Signed ${new Date(d.catodriveSignature.signedAt).toUTCString()}.`,
      partnerLine,
    ]);
    return { pdf, filename: `CatoDrive-Intake-Report-${v.vin}.pdf` };
  },
};
