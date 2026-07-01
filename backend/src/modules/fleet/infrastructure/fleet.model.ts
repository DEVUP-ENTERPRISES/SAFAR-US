import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export interface FleetDoc {
  _id: string;
  hostId: string;
  name: string;
  region?: string;
  group?: string; // arbitrary grouping label (e.g. "Airport fleet")
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const schema = new Schema<FleetDoc>(
  {
    _id: { type: String, default: () => uuid() },
    hostId: { type: String, required: true },
    name: { type: String, required: true },
    region: String,
    group: String,
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

schema.index({ hostId: 1 });

export const FleetModel = model<FleetDoc>('Fleet', schema);
