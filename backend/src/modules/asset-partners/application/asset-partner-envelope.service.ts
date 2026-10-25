import { createHash } from 'node:crypto';
import {
  SignatureEnvelopeModel,
  SignedDocumentModel,
  SigningEventModel,
  type EnvelopeDocument,
  type EnvelopePurpose,
  type SignatureEnvelopeDoc,
  type SignedDocKind,
  type SigningEvent,
  type SigningEventType,
} from '../infrastructure/signature-envelope.model';
import type { ResolvedTermsSnapshot } from '../infrastructure/asset-partner-terms.model';
import type { AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { newDocumentId, newEnvelopeId, initialsOf } from '../domain/envelope-id';
import { buildTextPdf } from './text-pdf';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { notificationService } from '../../notifications/application/notification.service';
import { config } from '../../../config';
import { ConflictError, NotFoundError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

export interface Ctx {
  ip?: string;
  userAgent?: string;
}

const EVENT_LABEL: Record<SigningEventType, string> = {
  sent: 'Documents ready to sign',
  opened: 'Opened by the signer',
  read_agreement: 'Agreement read to the end',
  read_nda: 'NDA read to the end',
  read_amendment: 'Amendment read to the end',
  consented: 'Agreed to sign electronically',
  signed: 'Signed by the partner',
  countersigned: 'Countersigned for CatoDrive',
  completed: 'Completed and sealed',
  copy_sent: 'Signed copies sent to the partner',
  declined: 'Declined by the partner',
};
const PURPOSE_LABEL: Record<EnvelopePurpose, string> = { onboarding: 'Asset Partner onboarding', amendment: 'Change to partner terms' };
const KIND_FILE: Record<SignedDocKind, string> = { agreement: 'Asset-Partner-Agreement', nda: 'NDA', amendment: 'Terms-Amendment' };
// Opening a page repeatedly is one fact, not many.
const EVENT_DEDUPE_MS = 10 * 60_000;
const fileName = (kind: SignedDocKind, signer: string, envelopeId: string) =>
  `CatoDrive-${KIND_FILE[kind]}-${signer.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'partner'}-${envelopeId}.pdf`;
const utc = (d: Date) => `${new Date(d).toISOString().replace('T', ' ').slice(0, 19)} UTC`;

function verifyBase(): string {
  return config.notifications.partnerWebUrl || config.notifications.webUrl;
}

/** The sealed PDF for one document, built only from what the envelope stores, so it can be rebuilt byte for byte. */
async function buildSealedPdf(env: Pick<SignatureEnvelopeDoc, 'envelopeId' | 'purpose' | 'documents' | 'signer' | 'countersigner' | 'events' | 'completedAt'>, doc: Pick<EnvelopeDocument, 'documentId' | 'kind' | 'title' | 'version' | 'text' | 'textHash'>): Promise<Buffer> {
  const when = utc(env.completedAt);
  const body = [
    doc.text,
    '',
    'SIGNATURES',
    `Partner: ${env.signer.name}, signed electronically on ${when}.`,
    `For ${env.countersigner.organisation}: ${env.countersigner.name}${env.countersigner.title ? `, ${env.countersigner.title}` : ''}, countersigned electronically on ${when}.`,
  ].join('\n');
  const certificate = [
    `Envelope ID: ${env.envelopeId}`,
    `Purpose: ${PURPOSE_LABEL[env.purpose]}`,
    `Completed: ${when}`,
    '',
    'Documents in this envelope',
    ...env.documents.map((d) => `${d.documentId}  ${d.title} (version ${d.version})  Text fingerprint SHA-256: ${d.textHash}`),
    '',
    'Signer',
    `${env.signer.name}${env.signer.email ? `  <${env.signer.email}>` : ''}`,
    `Internet address: ${env.signer.ip ?? 'not recorded'}`,
    `Device: ${env.signer.userAgent ?? 'not recorded'}`,
    '',
    'Countersigner',
    `${env.countersigner.name}${env.countersigner.title ? `, ${env.countersigner.title}` : ''}, ${env.countersigner.organisation}`,
    '',
    'History',
    ...env.events.map((e) => `${utc(e.at)}  ${EVENT_LABEL[e.type] ?? e.type}${e.ip ? `  from ${e.ip}` : ''}${e.detail ? `  (${e.detail})` : ''}`),
    '',
    `Check that this copy is genuine at ${verifyBase()}/verify using the envelope ID or the file itself.`,
    'Signed electronically under the U.S. E-SIGN Act and the Texas Uniform Electronic Transactions Act.',
  ];
  return buildTextPdf(doc.title, body, [`Document ${doc.documentId}, version ${doc.version}. Text fingerprint SHA-256: ${doc.textHash}`], {
    date: new Date(env.completedAt),
    stamp: `Envelope ${env.envelopeId}  ·  Document ${doc.documentId}`,
    appendix: { title: 'Certificate of completion', lines: certificate },
  });
}

export interface SealInput {
  partner: AssetPartnerDoc;
  purpose: EnvelopePurpose;
  termsVersionId?: string;
  docs: { kind: SignedDocKind; title: string; version: number; text: string }[];
  signerName: string;
  signerEmail?: string;
  terms?: ResolvedTermsSnapshot;
  ctx: Ctx;
  at: Date;
  /** Older signatures sealed after the fact keep their own history line. */
  legacy?: boolean;
}

export class AssetPartnerEnvelopeService {
  /** Adds one step to the partner's signing history; repeats of the same step within minutes are folded together. */
  async recordEvent(partnerId: string, purpose: EnvelopePurpose, type: SigningEventType, ctx: Ctx, opts: { termsVersionId?: string; envelopeId?: string; detail?: string } = {}): Promise<void> {
    const recent = await SigningEventModel.exists({
      partnerId, purpose, type, termsVersionId: opts.termsVersionId, envelopeId: opts.envelopeId, at: { $gte: new Date(Date.now() - EVENT_DEDUPE_MS) },
    });
    if (recent) return;
    await SigningEventModel.create({ partnerId, purpose, type, at: new Date(), ip: ctx.ip, userAgent: ctx.userAgent?.slice(0, 300), ...opts });
  }

  private async eventsBefore(partnerId: string, purpose: EnvelopePurpose, termsVersionId?: string): Promise<SigningEvent[]> {
    const rows = await SigningEventModel.find({ partnerId, purpose, envelopeId: { $exists: false }, ...(termsVersionId ? { termsVersionId } : {}) })
      .sort({ at: 1 })
      .limit(200)
      .lean<SigningEvent[]>();
    return rows.map(({ type, at, ip, userAgent, detail }) => ({ type, at, ip, userAgent, detail }));
  }

  private async countersigner() {
    const c = (await platformConfigService.get()).assetPartner;
    const organisation = c.countersignerOrganisation || 'CatoDrive';
    return { name: c.countersignerName || organisation, title: c.countersignerTitle || 'Authorised signatory', organisation };
  }

  /**
   * Seals a completed signing: fills the history, builds each PDF once, fingerprints it, and stores the
   * envelope and the files where nothing can change them. A second seal of the same signing loses on the
   * unique index and gets the first one back.
   */
  async seal(input: SealInput): Promise<SignatureEnvelopeDoc> {
    const { partner, purpose, ctx, at } = input;
    const prior = input.legacy ? [] : await this.eventsBefore(partner._id, purpose, input.termsVersionId);
    const events: SigningEvent[] = [
      ...prior,
      { type: 'signed', at, ip: ctx.ip, userAgent: ctx.userAgent?.slice(0, 300), ...(input.legacy ? { detail: 'sealed from the original signing record' } : {}) },
      { type: 'countersigned', at },
      { type: 'completed', at },
    ];
    const base = {
      envelopeId: newEnvelopeId(),
      purpose,
      signer: { name: input.signerName, email: input.signerEmail, ip: ctx.ip, userAgent: ctx.userAgent?.slice(0, 300) },
      countersigner: await this.countersigner(),
      events,
      completedAt: at,
    };
    const drafts = input.docs.map((d) => ({ documentId: newDocumentId(), kind: d.kind, title: d.title, version: d.version, text: d.text, textHash: sha256(d.text) }));
    const withPdf = await Promise.all(
      drafts.map(async (d) => {
        const pdf = await buildSealedPdf({ ...base, documents: drafts.map((x) => ({ ...x, pdfHash: '' })) }, d);
        return { doc: { ...d, pdfHash: sha256(pdf) }, pdf };
      }),
    );

    let envelope: SignatureEnvelopeDoc;
    try {
      envelope = (
        await SignatureEnvelopeModel.create({
          ...base,
          partnerId: partner._id,
          userId: partner.userId,
          termsVersionId: input.termsVersionId,
          documents: withPdf.map((w) => w.doc),
          terms: input.terms,
        })
      ).toObject();
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      const existing = await SignatureEnvelopeModel.findOne({ partnerId: partner._id, purpose, termsVersionId: input.termsVersionId }).lean<SignatureEnvelopeDoc>();
      if (!existing) throw err;
      return existing;
    }

    await SignedDocumentModel.insertMany(
      withPdf.map((w) => ({
        documentId: w.doc.documentId, envelopeId: envelope.envelopeId, partnerId: partner._id,
        filename: fileName(w.doc.kind, input.signerName, envelope.envelopeId), bytes: w.pdf, sha256: w.doc.pdfHash,
      })),
    ).catch((err) => logger.error({ err, envelopeId: envelope.envelopeId }, 'sealed PDFs not stored; they are rebuilt and checked on first open'));
    logger.info({ partnerId: partner._id, envelopeId: envelope.envelopeId, purpose }, 'Signing envelope sealed');
    return envelope;
  }

  /** Tells the partner their signed copies are ready and records that it was sent. */
  async sendCopy(envelope: SignatureEnvelopeDoc, ctx: Ctx = {}): Promise<void> {
    try {
      await notificationService.send({
        userId: envelope.userId,
        priority: 'high',
        deepLink: '/asset-partners/dashboard',
        templateKey: 'account.asset_partner_signed_copy',
        title: 'Your signed documents',
        body: `Envelope ${envelope.envelopeId} is complete. Your signed copies are in your partner portal under Documents, ready to download.`,
        data: { envelopeId: envelope.envelopeId },
      });
      await this.recordEvent(envelope.partnerId, envelope.purpose, 'copy_sent', ctx, { envelopeId: envelope.envelopeId });
    } catch (err) {
      logger.warn({ err, envelopeId: envelope.envelopeId }, 'signed copy notice failed');
    }
  }

  /** The partner's envelopes, newest first, without the full texts. */
  async list(partnerId: string): Promise<(Omit<SignatureEnvelopeDoc, 'documents'> & { documents: Omit<EnvelopeDocument, 'text'>[]; after: SigningEvent[] })[]> {
    const envelopes = await SignatureEnvelopeModel.find({ partnerId }).sort({ completedAt: -1 }).limit(50).lean<SignatureEnvelopeDoc[]>();
    const after = await SigningEventModel.find({ envelopeId: { $in: envelopes.map((e) => e.envelopeId) } }).sort({ at: 1 }).lean<(SigningEvent & { envelopeId: string })[]>();
    return envelopes.map((e) => ({
      ...e,
      documents: e.documents.map(({ text: _text, ...d }) => d),
      after: after.filter((a) => a.envelopeId === e.envelopeId).map(({ type, at, ip, detail }) => ({ type, at, ip, detail })),
    }));
  }

  /**
   * The sealed PDF, checked before anyone gets it: the stored bytes must match the fingerprint sealed in the
   * envelope. A missing file is rebuilt from the envelope and must match too; anything else is refused.
   */
  async pdf(documentId: string, partnerId?: string): Promise<{ pdf: Buffer; filename: string }> {
    const envelope = await SignatureEnvelopeModel.findOne({ 'documents.documentId': documentId, ...(partnerId ? { partnerId } : {}) }).lean<SignatureEnvelopeDoc>();
    if (!envelope) throw new NotFoundError('Signed document');
    const doc = envelope.documents.find((d) => d.documentId === documentId)!;
    const stored = await SignedDocumentModel.findOne({ documentId }).lean<{ bytes: Buffer; sha256: string; filename: string }>();
    const filename = stored?.filename ?? fileName(doc.kind, envelope.signer.name, envelope.envelopeId);
    const bytes = stored ? Buffer.from(stored.bytes.buffer ?? stored.bytes) : await buildSealedPdf(envelope, doc);
    const actual = sha256(bytes);
    if (actual !== doc.pdfHash || (stored && stored.sha256 !== doc.pdfHash)) {
      logger.error({ envelopeId: envelope.envelopeId, documentId, expected: doc.pdfHash, actual }, 'SEALED DOCUMENT FAILED ITS INTEGRITY CHECK');
      throw new ConflictError('This document can’t be opened right now. Our team has been told.', 'DOCUMENT_INTEGRITY');
    }
    if (!stored) {
      await SignedDocumentModel.create({ documentId, envelopeId: envelope.envelopeId, partnerId: envelope.partnerId, filename, bytes, sha256: actual }).catch(() => undefined);
    }
    return { pdf: bytes, filename };
  }

  /** Public check by envelope ID: genuine or not, with nothing private in the answer. */
  async verify(envelopeId: string): Promise<{ valid: boolean; envelope?: PublicEnvelope }> {
    const e = await SignatureEnvelopeModel.findOne({ envelopeId }).lean<SignatureEnvelopeDoc>();
    return e ? { valid: true, envelope: publicView(e) } : { valid: false };
  }

  /** Public check of a file's fingerprint (worked out in the visitor's browser): which sealed document it is, if any. */
  async verifyFile(pdfHash: string): Promise<{ valid: boolean; documentId?: string; envelope?: PublicEnvelope }> {
    const e = await SignatureEnvelopeModel.findOne({ 'documents.pdfHash': pdfHash }).lean<SignatureEnvelopeDoc>();
    if (!e) return { valid: false };
    return { valid: true, documentId: e.documents.find((d) => d.pdfHash === pdfHash)!.documentId, envelope: publicView(e) };
  }
}

export interface PublicEnvelope {
  envelopeId: string;
  purpose: EnvelopePurpose;
  completedAt: Date;
  signer: string;
  countersignedBy: string;
  documents: { documentId: string; title: string; version: number }[];
}

function publicView(e: SignatureEnvelopeDoc): PublicEnvelope {
  return {
    envelopeId: e.envelopeId,
    purpose: e.purpose,
    completedAt: e.completedAt,
    signer: initialsOf(e.signer.name),
    countersignedBy: e.countersigner.organisation,
    documents: e.documents.map((d) => ({ documentId: d.documentId, title: d.title, version: d.version })),
  };
}

export const assetPartnerEnvelopeService = new AssetPartnerEnvelopeService();
