import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/** A guest asked to hear the moment a car frees up for their dates. */
export interface DateWatchDoc {
  _id: string;
  userId: string;
  vehicleId: string;
  start: Date;
  end: Date;
  /** Set once the guest was told; a watch fires once. */
  notifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<DateWatchDoc>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true },
    vehicleId: { type: String, required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    notifiedAt: Date,
  },
  { timestamps: true, _id: false },
);

schema.index({ userId: 1, vehicleId: 1, start: 1, end: 1 }, { unique: true });
schema.index({ vehicleId: 1, notifiedAt: 1, start: 1 });
// Gone a day after the trip would have started; nobody needs a watch for the past.
schema.index({ start: 1 }, { expireAfterSeconds: 86_400 });

export const DateWatchModel = model<DateWatchDoc>('DateWatch', schema);
