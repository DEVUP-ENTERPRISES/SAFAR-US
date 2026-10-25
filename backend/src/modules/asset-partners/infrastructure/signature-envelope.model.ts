import { Schema, model, type Query } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';
import type { ResolvedTermsSnapshot } from './asset-partner-terms.model';

/** Why a set of documents was signed: joining the programme, or agreeing to new terms. */
export type EnvelopePurpose = 'onboarding' | 'amendment';
export type SignedDocKind = 'agreement' | 'nda' | 'amendment';
export type SigningEventType =
  | 'sent'
  | 'opened'
  | 'read_agreement'
  | 'read_nda'
  | 'read_amendment'
  | 'consented'
  | 'signed'
  | 'countersigned'
  | 'completed'
  | 'copy_sent'
  | 'declined';

export interface SigningEvent {
  type: SigningEventType;
  at: Date;
  ip?: string;
  userAgent?: string;
  detail?: string;
}

export interface EnvelopeDocument {
  /** Printed on the page and the certificate, e.g. CD-DOC-7K3M-92QX. */
  documentId: string;
  kind: SignedDocKind;
  title: string;
  version: number;
  /** The exact text the partner signed, details filled in, kept so the sealed PDF can always be rebuilt and checked. */
  text: string;
  /** SHA-256 of that text. */
  textHash: string;
  /** SHA-256 of the sealed PDF bytes stored in SignedDocumentModel. */
  pdfHash: string;
}

/** One completed signing, sealed at the moment it happened; never updated or deleted. */
export interface SignatureEnvelopeDoc {
  _id: string;
  envelopeId: string;
  partnerId: string;
  userId: string;
  purpose: EnvelopePurpose;
  /** Set on an amendment: the terms version it brings into force. */
  termsVersionId?: string;
  documents: EnvelopeDocument[];
  signer: { name: string; email?: string; ip?: string; userAgent?: string };
  countersigner: { name: string; title: string; organisation: string };
  /** Every step up to completion, copied in when sealed. */
  events: SigningEvent[];
  terms?: ResolvedTermsSnapshot;
  completedAt: Date;
  createdAt: Date;
}

/** The sealed PDF bytes; insert-only, read back and checked against pdfHash before anyone gets them. */
export interface SignedDocumentDoc {
  _id: string;
  documentId: string;
  envelopeId: string;
  partnerId: string;
  filename: string;
  bytes: Buffer;
  sha256: string;
  createdAt: Date;
}

/** Steps before and after sealing (opened, read to the end, copy sent); append-only. */
export interface SigningEventDoc extends SigningEvent {
  _id: string;
  partnerId: string;
  purpose: EnvelopePurpose;
  /** Present once the envelope exists (copy_sent and later). */
  envelopeId?: string;
  /** Present for amendment steps. */
  termsVersionId?: string;
}

const eventSchema = { type: { type: String, required: true }, at: { type: Date, required: true }, ip: String, userAgent: String, detail: String };

const envelopeSchema = new Schema<SignatureEnvelopeDoc>(
  {
    _id: { type: String, default: () => uuid() },
    envelopeId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true },
    userId: { type: String, required: true },
    purpose: { type: String, enum: ['onboarding', 'amendment'], required: true },
    termsVersionId: String,
    documents: {
      type: [new Schema({ documentId: String, kind: String, title: String, version: Number, text: String, textHash: String, pdfHash: String }, { _id: false })],
      required: true,
    },
    signer: { type: new Schema({ name: String, email: String, ip: String, userAgent: String }, { _id: false }), required: true },
    countersigner: { type: new Schema({ name: String, title: String, organisation: String }, { _id: false }), required: true },
    events: { type: [new Schema(eventSchema, { _id: false })], default: [] },
    terms: { type: Schema.Types.Mixed },
    completedAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
);
envelopeSchema.index({ partnerId: 1, completedAt: -1 });
// One onboarding envelope per partner and one per amendment, so a double tap cannot seal twice.
envelopeSchema.index({ partnerId: 1, purpose: 1, termsVersionId: 1 }, { unique: true });
envelopeSchema.index({ 'documents.pdfHash': 1 });

const signedDocSchema = new Schema<SignedDocumentDoc>(
  {
    _id: { type: String, default: () => uuid() },
    documentId: { type: String, required: true, unique: true },
    envelopeId: { type: String, required: true, index: true },
    partnerId: { type: String, required: true },
    filename: { type: String, required: true },
    bytes: { type: Buffer, required: true },
    sha256: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
);

const signingEventSchema = new Schema<SigningEventDoc>(
  {
    _id: { type: String, default: () => uuid() },
    partnerId: { type: String, required: true },
    purpose: { type: String, enum: ['onboarding', 'amendment'], required: true },
    envelopeId: String,
    termsVersionId: String,
    ...eventSchema,
  },
  { _id: false },
);
signingEventSchema.index({ partnerId: 1, purpose: 1, at: 1 });
signingEventSchema.index({ envelopeId: 1, at: 1 }, { sparse: true });

/** Signed records are evidence: the application can add them, never change or remove them. */
function sealed(schema: Schema, name: string) {
  const refuse = function (this: Query<unknown, unknown>) {
    throw new Error(`${name} records cannot be changed or deleted`);
  };
  for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as const) {
    schema.pre(op, refuse);
  }
}
sealed(envelopeSchema, 'Signature envelope');
sealed(signedDocSchema, 'Signed document');
sealed(signingEventSchema, 'Signing event');

export const SignatureEnvelopeModel = model<SignatureEnvelopeDoc>('SignatureEnvelope', envelopeSchema);
export const SignedDocumentModel = model<SignedDocumentDoc>('SignedDocument', signedDocSchema);
export const SigningEventModel = model<SigningEventDoc>('SigningEvent', signingEventSchema);
