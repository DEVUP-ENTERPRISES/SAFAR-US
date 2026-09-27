import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export type FailureArea = 'booking' | 'payment' | 'identity' | 'auth' | 'security' | 'other';

/** One request that failed in a way ops should see: every server error, and every refusal on the money and booking paths. */
export interface RequestFailureDoc {
  _id: string;
  at: Date;
  area: FailureArea;
  method: string;
  path: string;
  status: number;
  code: string;
  message: string;
  userId?: string;
  requestId?: string;
  vehicleId?: string;
  bookingId?: string;
  country?: string;
  userAgent?: string;
}

const schema = new Schema<RequestFailureDoc>(
  {
    _id: { type: String, default: () => uuid() },
    at: { type: Date, default: () => new Date() },
    area: { type: String, required: true },
    method: String,
    path: String,
    status: Number,
    code: String,
    message: String,
    userId: String,
    requestId: String,
    vehicleId: String,
    bookingId: String,
    country: String,
    userAgent: String,
  },
  { versionKey: false, _id: false },
);

schema.index({ at: -1 });
schema.index({ area: 1, at: -1 });
schema.index({ at: 1 }, { expireAfterSeconds: 90 * 86_400 });

export const RequestFailureModel = model<RequestFailureDoc>('RequestFailure', schema);
