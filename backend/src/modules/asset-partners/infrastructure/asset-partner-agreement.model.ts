import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/** One published version of the Asset Partner agreement; versions are never edited, only superseded. */
export type AgreementKind = 'agreement' | 'nda' | 'amendment';

export interface AssetPartnerAgreementDoc {
  _id: string;
  /** Older records have none and are the partner agreement. */
  kind?: AgreementKind;
  version: number;
  title: string;
  body: string;
  bodyHash: string;
  publishedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<AssetPartnerAgreementDoc>(
  {
    _id: { type: String, default: () => uuid() },
    kind: { type: String, enum: ['agreement', 'nda', 'amendment'], default: 'agreement' },
    // One running number across both documents, so every published text has its own version.
    version: { type: Number, required: true, unique: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    bodyHash: { type: String, required: true },
    publishedBy: { type: String, required: true },
  },
  { timestamps: true, _id: false },
);

export const AssetPartnerAgreementModel = model<AssetPartnerAgreementDoc>('AssetPartnerAgreement', schema);
