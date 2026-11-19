import { Schema, model } from 'mongoose';
import type { DisclosureSection } from '../domain/defaults';

// One published version of the website disclosures; versions are never edited, only superseded.
export interface DisclosureVersionDoc {
  _id: string;
  version: number;
  sections: DisclosureSection[];
  changeNote: string;
  publishedBy: string;
  effectiveAt: Date;
  createdAt: Date;
}

const schema = new Schema<DisclosureVersionDoc>(
  {
    _id: { type: String, required: true },
    version: { type: Number, required: true },
    sections: {
      type: [new Schema<DisclosureSection>({ id: { type: String, required: true }, title: { type: String, required: true }, note: { type: String, required: true }, body: { type: [String], required: true } }, { _id: false })],
      required: true,
    },
    changeNote: { type: String, required: true },
    publishedBy: { type: String, required: true },
    effectiveAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
);

schema.index({ version: 1 }, { unique: true });

export const DisclosureVersionModel = model<DisclosureVersionDoc>('DisclosureVersion', schema, 'website_disclosure_versions');
