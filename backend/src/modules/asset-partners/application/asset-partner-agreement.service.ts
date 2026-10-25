import { createHash } from 'node:crypto';
import { AssetPartnerAgreementModel, type AgreementKind, type AssetPartnerAgreementDoc } from '../infrastructure/asset-partner-agreement.model';
import { AssetPartnerModel, type AssetPartnerDoc, type PartnerAgreementSignature } from '../infrastructure/asset-partner.model';
import { AssetPartnerApplicationModel, type AssetPartnerApplicationDoc } from '../infrastructure/asset-partner-application.model';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';
import { buildTextPdf } from './text-pdf';

export { buildTextPdf, type PdfOptions } from './text-pdf';
import { notificationService } from '../../notifications/application/notification.service';
import { assetPartnerTermsService } from './asset-partner-terms.service';
import { assetPartnerEnvelopeService } from './asset-partner-envelope.service';
import { SignatureEnvelopeModel } from '../infrastructure/signature-envelope.model';
import type { ResolvedTermsSnapshot } from '../infrastructure/asset-partner-terms.model';

const hashOf = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Placeholders CatoDrive can put in the text; each is filled from the partner's own details when they sign. */
export const AGREEMENT_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: 'effective_date', label: 'Date signed' },
  { key: 'partner_name', label: 'Full legal name' },
  { key: 'partner_email', label: 'Email' },
  { key: 'partner_phone', label: 'Phone' },
  { key: 'partner_address', label: 'Mailing address' },
  { key: 'vehicle', label: 'Year / make / model / trim' },
  { key: 'vin', label: 'VIN' },
  { key: 'plate', label: 'Licence plate & state' },
  { key: 'licence', label: 'Driver’s licence (state and last 4)' },
  { key: 'payout_method', label: 'Payout method' },
  { key: 'zelle_handle', label: 'Zelle phone or email' },
  { key: 'zelle_name', label: 'Name on Zelle' },
  { key: 'check_payable_to', label: 'Check payable to' },
  { key: 'check_address', label: 'Check mailing address' },
  { key: 'signed_name', label: 'Signature (typed name)' },
  { key: 'management_fee', label: 'Management fee (e.g. 20%)' },
  { key: 'insurance_monthly', label: 'Insurance per car per month' },
  { key: 'detailing_monthly', label: 'Detailing per car per month' },
  { key: 'deductible_cap', label: 'Damage cap per incident' },
  { key: 'maintenance_approval', label: 'Repairs above this need approval' },
  { key: 'payout_day', label: 'Payout day of the month' },
  { key: 'changes_table', label: 'Rate change only: list of old → new terms' },
  { key: 'changes_effective', label: 'Rate change only: date the new terms start' },
];

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** A partner's terms as the words that go into the agreement text. */
export function termFields(t: ResolvedTermsSnapshot): Record<string, string> {
  return {
    management_fee: `${t.managementFeeBps / 100}%`,
    insurance_monthly: usd(t.insuranceMonthlyCents),
    detailing_monthly: usd(t.detailingMonthlyCents),
    deductible_cap: usd(t.deductibleCapCents),
    maintenance_approval: usd(t.maintenanceApprovalCents),
    payout_day: `the ${ordinal(t.payoutDayOfMonth)} of each month`,
  };
}

const TERM_LABEL: Record<keyof ReturnType<typeof termFields>, string> = {
  management_fee: 'Management fee',
  insurance_monthly: 'Insurance per car per month',
  detailing_monthly: 'Detailing per car per month',
  deductible_cap: 'Damage cap per incident',
  maintenance_approval: 'Repairs needing your approval above',
  payout_day: 'Payout day',
};

/** "Management fee: 20% → 25%", one line per term that changes. */
export function changesTable(from: ResolvedTermsSnapshot, to: ResolvedTermsSnapshot): string {
  const a = termFields(from);
  const b = termFields(to);
  return (Object.keys(TERM_LABEL) as (keyof typeof TERM_LABEL)[])
    .filter((k) => a[k] !== b[k])
    .map((k) => `${TERM_LABEL[k]}: ${a[k]} -> ${b[k]}`)
    .join('\n');
}

const BLANK = '________';

export function renderAgreement(body: string, fields: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, key: string) => (fields[key]?.trim() ? fields[key] : BLANK));
}

export type PayoutElection =
  | { method: 'zelle'; zelleHandle: string; zelleName: string }
  | { method: 'check'; payableTo: string; mailingAddress: string };

export interface SignInput {
  agreementVersion: number;
  ndaVersion: number;
  signedName: string;
  licenceNumber: string;
  licenceState: string;
  payout: PayoutElection;
}

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');
const signedDate = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });

export class AssetPartnerAgreementService {
  async current(kind: AgreementKind = 'agreement'): Promise<AssetPartnerAgreementDoc | null> {
    const filter = kind === 'agreement' ? { kind: { $in: ['agreement', null] } } : { kind };
    return AssetPartnerAgreementModel.findOne(filter).sort({ version: -1 }).lean<AssetPartnerAgreementDoc>().exec();
  }

  async versions(limit = 40): Promise<AssetPartnerAgreementDoc[]> {
    return AssetPartnerAgreementModel.find().sort({ version: -1 }).limit(limit).lean<AssetPartnerAgreementDoc[]>().exec();
  }

  async publish(userId: string, input: { kind?: AgreementKind; title: string; body: string }): Promise<AssetPartnerAgreementDoc> {
    const kind = input.kind ?? 'agreement';
    const latest = await this.current(kind);
    const bodyHash = hashOf(input.body);
    if (latest && latest.bodyHash === bodyHash && latest.title === input.title) return latest;
    const newest = await AssetPartnerAgreementModel.findOne().sort({ version: -1 }).select('version').lean<{ version: number }>();
    try {
      const doc = await AssetPartnerAgreementModel.create({ kind, version: (newest?.version ?? 0) + 1, title: input.title, body: input.body, bodyHash, publishedBy: userId });
      logger.info({ kind, version: doc.version }, 'Asset Partner document published');
      // The waiting screen promises an email; a mail failure must not undo the publish.
      if (kind !== 'amendment') void this.tellWaitingPartners().catch((err) => logger.warn({ err }, 'agreement ready notice failed'));
      return doc.toObject();
    } catch (err) {
      // Two people publishing at once collide on the unique version.
      if ((err as { code?: number }).code === 11000) throw new ConflictError('Someone else just published a version. Reload and try again.', 'AGREEMENT_VERSION_TAKEN');
      throw err;
    }
  }

  /** Once both the agreement and the NDA exist, every approved partner still waiting to sign is told they can. */
  private async tellWaitingPartners(): Promise<void> {
    const [agreement, nda] = await Promise.all([this.current('agreement'), this.current('nda')]);
    if (!agreement || !nda) return;
    const waiting = await AssetPartnerModel.find({ agreementRequired: true, status: { $ne: 'exited' }, $or: [{ 'agreement.signedAt': { $exists: false } }, { 'nda.signedAt': { $exists: false } }] })
      .select('_id userId')
      .limit(1000)
      .lean<{ _id: string; userId: string }[]>();
    for (const p of waiting) {
      await assetPartnerEnvelopeService.recordEvent(p._id, 'onboarding', 'sent', {}).catch(() => undefined);
      await notificationService
        .send({
          userId: p.userId,
          priority: 'high',
          deepLink: '/asset-partners/dashboard',
          templateKey: 'account.asset_partner_agreement_ready',
          title: 'Your partner agreement is ready to sign',
          body: 'Your CatoDrive Asset Partner agreement and NDA are ready. Sign in to read and sign them.',
          data: { agreementVersion: agreement.version, ndaVersion: nda.version },
        })
        .catch((err) => logger.warn({ err, userId: p.userId }, 'agreement ready notice failed'));
    }
  }

  private async applicationOf(partner: AssetPartnerDoc): Promise<AssetPartnerApplicationDoc | null> {
    if (partner.applicationId) {
      const app = await AssetPartnerApplicationModel.findById(partner.applicationId).lean<AssetPartnerApplicationDoc>();
      if (app) return app;
    }
    return AssetPartnerApplicationModel.findOne({ submittedByUserId: partner.userId, kind: { $in: ['partner', null] } })
      .sort({ createdAt: -1 })
      .lean<AssetPartnerApplicationDoc>();
  }

  /** Everything known before signing, filled into both texts; what the partner types at signing stays blank until then. */
  async prefill(partner: AssetPartnerDoc): Promise<Record<string, string>> {
    const app = await this.applicationOf(partner);
    const v = app?.vehicle;
    return {
      effective_date: signedDate(new Date()),
      partner_name: app?.fullName ?? partner.displayName,
      partner_email: partner.email ?? app?.email ?? '',
      partner_phone: partner.phone ?? app?.phone ?? '',
      partner_address: app ? `${app.address}, ${app.city}, ${app.state} ${app.zip}` : '',
      vehicle: v ? [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') : '',
      vin: v?.vin ?? '',
      plate: v ? `${v.plate}${app?.state ? ` (${app.state})` : ''}` : '',
      ...termFields(await assetPartnerTermsService.at(partner)),
    };
  }

  /** What the partner reads before signing: both texts with their details already in. */
  async forPartner(partner: AssetPartnerDoc) {
    const [agreement, nda, fields] = await Promise.all([this.current('agreement'), this.current('nda'), this.prefill(partner)]);
    const view = (d: AssetPartnerAgreementDoc | null) => (d ? { version: d.version, title: d.title, body: renderAgreement(d.body, fields) } : null);
    return { agreement: view(agreement), nda: view(nda), prefill: fields };
  }

  /** Signs the NDA and the agreement together on the versions the partner read, and records their payout choice. */
  async sign(partner: AssetPartnerDoc, input: SignInput, ctx: { ip?: string; userAgent?: string }): Promise<AssetPartnerDoc> {
    if (!partner.agreementRequired) throw new ForbiddenError('There is no agreement waiting for your signature.');
    if (partner.agreement?.signedAt && partner.nda?.signedAt) return partner;

    const [agreement, nda] = await Promise.all([this.current('agreement'), this.current('nda')]);
    if (!agreement || !nda) throw new ConflictError('Your agreement is still being prepared. We’ll email you when it’s ready.', 'AGREEMENT_NOT_READY');
    if (agreement.version !== input.agreementVersion || nda.version !== input.ndaVersion) {
      throw new ConflictError('The documents were updated. Please read the latest versions and sign again.', 'AGREEMENT_OUTDATED');
    }

    const signedName = tidy(input.signedName);
    if (signedName.length < 2) throw new ValidationError('Type your full legal name to sign');
    const licence = input.licenceNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const state = input.licenceState.trim().toUpperCase();
    if (licence.length < 4 || licence.length > 20 || !/^[A-Z]{2}$/.test(state)) throw new ValidationError('Enter your driver’s licence number and state');

    const p = input.payout;
    if (p.method === 'zelle' && (tidy(p.zelleHandle).length < 5 || tidy(p.zelleName).length < 2)) throw new ValidationError('Enter the Zelle phone or email and the name on the account');
    if (p.method === 'check' && (tidy(p.payableTo).length < 2 || tidy(p.mailingAddress).length < 8)) throw new ValidationError('Enter who the check is payable to and the mailing address');

    const now = new Date();
    const fields: Record<string, string> = {
      ...(await this.prefill(partner)),
      effective_date: signedDate(now),
      licence: `${state} •••• ${licence.slice(-4)}`,
      payout_method: p.method === 'zelle' ? 'Zelle' : 'Mailed check',
      zelle_handle: p.method === 'zelle' ? tidy(p.zelleHandle) : '',
      zelle_name: p.method === 'zelle' ? tidy(p.zelleName) : '',
      check_payable_to: p.method === 'check' ? tidy(p.payableTo) : '',
      check_address: p.method === 'check' ? tidy(p.mailingAddress) : '',
      signed_name: signedName,
    };
    // The terms they read are the terms they sign: the same draft that filled the text.
    const terms = await assetPartnerTermsService.at(partner, now);
    Object.assign(fields, termFields(terms));
    const envelope = await assetPartnerEnvelopeService.seal({
      partner,
      purpose: 'onboarding',
      docs: [
        { kind: 'agreement', title: agreement.title, version: agreement.version, text: renderAgreement(agreement.body, fields) },
        { kind: 'nda', title: nda.title, version: nda.version, text: renderAgreement(nda.body, fields) },
      ],
      signerName: signedName,
      signerEmail: partner.email,
      terms,
      ctx,
      at: now,
    });
    const signature = (doc: AssetPartnerAgreementDoc): PartnerAgreementSignature => ({
      version: doc.version, bodyHash: doc.bodyHash, signedName, signedAt: now, ip: ctx.ip, userAgent: ctx.userAgent, fields, envelopeId: envelope.envelopeId,
    });
    const payoutDetails = {
      ...(partner.payoutDetails ?? {}),
      method: p.method,
      ...(p.method === 'zelle'
        ? { zelleHandle: fields.zelle_handle, zelleName: fields.zelle_name }
        : { payableTo: fields.check_payable_to, mailingAddress: fields.check_address }),
    };

    const doc = await AssetPartnerModel.findOneAndUpdate(
      { _id: partner._id, 'agreement.signedAt': { $exists: false } },
      { $set: { agreement: signature(agreement), nda: signature(nda), payoutDetails } },
      { new: true },
    ).lean<AssetPartnerDoc>();
    logger.info({ partnerId: partner._id, agreement: agreement.version, nda: nda.version, envelopeId: envelope.envelopeId }, 'Asset Partner documents signed');
    if (doc) {
      await assetPartnerTermsService.writeBaseline(doc, terms, now, envelope.envelopeId);
      void assetPartnerEnvelopeService.sendCopy(envelope, ctx);
    }
    return doc ?? (await AssetPartnerModel.findById(partner._id).lean<AssetPartnerDoc>())!;
  }

  /** A partner who signed before envelopes existed: seal what they signed, from the record of that signing, once. */
  private async sealEarlierSigning(partner: AssetPartnerDoc): Promise<{ envelopeId: string } | null> {
    const a = partner.agreement;
    const n = partner.nda;
    if (!a?.signedAt || !n?.signedAt) return null;
    const existing = await SignatureEnvelopeModel.findOne({ partnerId: partner._id, purpose: 'onboarding' }).select('envelopeId').lean<{ envelopeId: string }>();
    if (existing) return existing;
    const [aDoc, nDoc] = await Promise.all([
      AssetPartnerAgreementModel.findOne({ version: a.version }).lean<AssetPartnerAgreementDoc>(),
      AssetPartnerAgreementModel.findOne({ version: n.version }).lean<AssetPartnerAgreementDoc>(),
    ]);
    if (!aDoc || !nDoc) return null;
    const fieldsOf = (s: PartnerAgreementSignature) => Object.fromEntries(Object.entries(s.fields ?? {}));
    const envelope = await assetPartnerEnvelopeService.seal({
      partner,
      purpose: 'onboarding',
      docs: [
        { kind: 'agreement', title: aDoc.title, version: aDoc.version, text: renderAgreement(aDoc.body, fieldsOf(a)) },
        { kind: 'nda', title: nDoc.title, version: nDoc.version, text: renderAgreement(nDoc.body, fieldsOf(n)) },
      ],
      signerName: a.signedName,
      signerEmail: partner.email,
      ctx: { ip: a.ip, userAgent: a.userAgent },
      at: new Date(a.signedAt),
      legacy: true,
    });
    await AssetPartnerModel.updateOne({ _id: partner._id }, { $set: { 'agreement.envelopeId': envelope.envelopeId, 'nda.envelopeId': envelope.envelopeId } });
    return envelope;
  }

  /** The signed document as a PDF: the sealed copy; only a record that cannot be sealed falls back to a rebuild. */
  async signedPdf(partner: AssetPartnerDoc, kind: 'agreement' | 'nda'): Promise<{ pdf: Buffer; filename: string }> {
    const sig = kind === 'nda' ? partner.nda : partner.agreement;
    if (!sig?.signedAt) throw new NotFoundError('Signed document');
    const envelopeId = sig.envelopeId ?? (await this.sealEarlierSigning(partner))?.envelopeId;
    if (envelopeId) {
      const envelope = await SignatureEnvelopeModel.findOne({ envelopeId }).select('documents.documentId documents.kind').lean<{ documents: { documentId: string; kind: string }[] }>();
      const documentId = envelope?.documents.find((d) => d.kind === kind)?.documentId;
      if (documentId) return assetPartnerEnvelopeService.pdf(documentId, partner._id);
    }
    const source = await AssetPartnerAgreementModel.findOne({ version: sig.version }).lean<AssetPartnerAgreementDoc>();
    if (!source) throw new NotFoundError('Signed document');
    const fields = Object.fromEntries(Object.entries(sig.fields ?? {}));
    const text = renderAgreement(source.body, fields);
    const pdf = await buildTextPdf(source.title, text, [
      `Signed electronically by ${sig.signedName} on ${new Date(sig.signedAt).toUTCString()}${sig.ip ? ` from ${sig.ip}` : ''}.`,
      `Document version ${sig.version}. Fingerprint of the signed text (SHA-256): ${hashOf(text)}`,
      'Electronic signatures are valid and binding under the E-SIGN Act and Texas law.',
    ]);
    const name = (fields.partner_name || partner.displayName).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return { pdf, filename: `CatoDrive-${kind === 'nda' ? 'NDA' : 'Asset-Partner-Agreement'}-${name || 'partner'}.pdf` };
  }
}

export const assetPartnerAgreementService = new AssetPartnerAgreementService();
