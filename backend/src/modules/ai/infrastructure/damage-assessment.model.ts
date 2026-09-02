import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * The result of comparing a trip's check-in and checkout photos.
 *
 * Stored rather than recomputed for three reasons: the comparison costs money,
 * both parties must see the SAME verdict (a re-run that phrased it differently
 * would reopen the argument it exists to close), and a claim raised later needs
 * the assessment as it stood, not as the model would word it today.
 */

export interface DamageFinding {
  /** Panel or region — 'rear passenger door', 'front bumper', 'nearside wing'. */
  area: string;
  type: 'scratch' | 'dent' | 'crack' | 'chip' | 'stain' | 'missing_part' | 'tyre' | 'other';
  description: string;
  /** Indexes into the photos the model was shown, so a human can check its work. */
  checkinPhotoIndexes: number[];
  checkoutPhotoIndexes: number[];
  confidence: number;
  note?: string;
}

export interface DamageAssessmentDoc {
  _id: string;
  tripId: string;
  bookingId: string;
  vehicleId: string;
  findings: DamageFinding[];
  overallNote?: string;
  photosCompared: { pre: number; post: number };
  /** 'damage_found' only when at least one finding cleared the threshold. */
  verdict: 'no_new_damage' | 'damage_found';
  /** Something was seen but nothing confidently — a person should look. */
  needsHuman: boolean;
  model: string;
  costCents: number;
  latencyMs: number;
  requestedBy: string;
  reviewedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const findingSchema = new Schema<DamageFinding>(
  {
    area: { type: String, required: true },
    type: {
      type: String,
      enum: ['scratch', 'dent', 'crack', 'chip', 'stain', 'missing_part', 'tyre', 'other'],
      default: 'other',
    },
    description: { type: String, required: true },
    checkinPhotoIndexes: { type: [Number], default: [] },
    checkoutPhotoIndexes: { type: [Number], default: [] },
    confidence: { type: Number, default: 0 },
    note: String,
  },
  { _id: false },
);

const schema = new Schema<DamageAssessmentDoc>(
  {
    _id: { type: String, default: uuid },
    // One assessment per trip; a re-run replaces it rather than accumulating
    // contradictory verdicts against the same evidence.
    tripId: { type: String, required: true, unique: true },
    bookingId: { type: String, required: true, index: true },
    vehicleId: { type: String, required: true, index: true },
    findings: { type: [findingSchema], default: [] },
    overallNote: String,
    photosCompared: { pre: { type: Number, default: 0 }, post: { type: Number, default: 0 } },
    verdict: { type: String, enum: ['no_new_damage', 'damage_found'], default: 'no_new_damage' },
    needsHuman: { type: Boolean, default: false },
    model: { type: String, required: true },
    costCents: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
    requestedBy: { type: String, required: true },
    reviewedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false },
);

export const DamageAssessmentModel = model<DamageAssessmentDoc>('DamageAssessment', schema);
