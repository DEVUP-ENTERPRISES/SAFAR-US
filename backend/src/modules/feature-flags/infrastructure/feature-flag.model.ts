import { Schema, model } from 'mongoose';

export interface FeatureFlagDoc {
  _id: string; // the flag key
  description: string;
  enabled: boolean;
  rollout: { percentage: number; allowUserIds: string[]; allowRoles: string[] };
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<FeatureFlagDoc>(
  {
    _id: { type: String },
    description: { type: String, default: '' },
    enabled: { type: Boolean, default: false },
    rollout: {
      percentage: { type: Number, default: 0 }, // 0–100
      allowUserIds: { type: [String], default: [] },
      allowRoles: { type: [String], default: [] },
    },
    updatedBy: String,
  },
  { timestamps: true, _id: false },
);

export const FeatureFlagModel = model<FeatureFlagDoc>('FeatureFlag', schema);
