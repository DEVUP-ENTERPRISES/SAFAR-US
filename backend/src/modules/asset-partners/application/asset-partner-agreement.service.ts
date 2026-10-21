import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { AssetPartnerAgreementModel, type AgreementKind, type AssetPartnerAgreementDoc } from '../infrastructure/asset-partner-agreement.model';
import { AssetPartnerModel, type AssetPartnerDoc, type PartnerAgreementSignature } from '../infrastructure/asset-partner.model';
import { AssetPartnerApplicationModel, type AssetPartnerApplicationDoc } from '../infrastructure/asset-partner-application.model';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

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
];

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
      return doc.toObject();
    } catch (err) {
      // Two people publishing at once collide on the unique version.
      if ((err as { code?: number }).code === 11000) throw new ConflictError('Someone else just published a version. Reload and try again.', 'AGREEMENT_VERSION_TAKEN');
      throw err;
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
    const signature = (doc: AssetPartnerAgreementDoc): PartnerAgreementSignature => ({
      version: doc.version, bodyHash: doc.bodyHash, signedName, signedAt: now, ip: ctx.ip, userAgent: ctx.userAgent, fields,
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
    logger.info({ partnerId: partner._id, agreement: agreement.version, nda: nda.version }, 'Asset Partner documents signed');
    return doc ?? (await AssetPartnerModel.findById(partner._id).lean<AssetPartnerDoc>())!;
  }

  /** The signed document as a PDF, rebuilt from the exact version and details that were signed. */
  async signedPdf(partner: AssetPartnerDoc, kind: AgreementKind): Promise<{ pdf: Buffer; filename: string }> {
    const sig = kind === 'nda' ? partner.nda : partner.agreement;
    if (!sig?.signedAt) throw new NotFoundError('Signed document');
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

const SWAPS: Record<string, string> = { '□': '[ ]', '☐': '[ ]', '☑': '[x]', 'ʺ': '"', '≥': '>=', '≤': '<=', '→': '->', '\t': '    ' };

/** Keeps only characters the standard PDF font can draw, swapping the common ones for look-alikes. */
function drawable(font: PDFFont, text: string, cache: Map<string, string>): string {
  let out = '';
  for (const ch of text) {
    let ok = cache.get(ch);
    if (ok === undefined) {
      try {
        font.widthOfTextAtSize(ch, 10);
        ok = ch;
      } catch {
        ok = SWAPS[ch] ?? '?';
      }
      cache.set(ch, ok);
    }
    out += ok;
  }
  return out;
}

export async function buildTextPdf(title: string, body: string, footer: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const cache = new Map<string, string>();
  const W = 612, H = 792, M = 54, size = 10, lead = 14;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const line = (text: string, f: PDFFont, s = size, color = rgb(0.1, 0.1, 0.12)) => {
    if (y < M + lead) newPage();
    page.drawText(text, { x: M, y, size: s, font: f, color });
    y -= s === size ? lead : s + 8;
  };
  const wrap = (text: string, f: PDFFont, s = size) => {
    const clean = drawable(f, text, cache);
    if (!clean.trim()) { y -= lead / 2; return; }
    let current = '';
    for (const word of clean.split(/\s+/)) {
      const next = current ? `${current} ${word}` : word;
      if (f.widthOfTextAtSize(next, s) > W - 2 * M && current) {
        line(current, f, s);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) line(current, f, s);
  };

  wrap(title, bold, 16);
  y -= 6;
  for (const para of body.replace(/\r\n/g, '\n').split('\n')) wrap(para, font);
  y -= lead;
  for (const f of footer) wrap(f, font, 8);
  return Buffer.from(await doc.save());
}

export const assetPartnerAgreementService = new AssetPartnerAgreementService();
