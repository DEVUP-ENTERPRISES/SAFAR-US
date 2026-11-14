import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export const PAUSE_STATUSES = ['pending', 'scheduled', 'active', 'ended', 'declined', 'cancelled'] as const;
export type PauseStatus = (typeof PAUSE_STATUSES)[number];
export const OPEN_PAUSE: PauseStatus[] = ['pending', 'scheduled', 'active'];

export interface VehiclePauseDoc {
  _id: string;
  vehicleId: string;
  assetPartnerId?: string;
  /** 'ops' pauses straight away; 'partner' is a request ops approve or decline. */
  source: 'ops' | 'partner';
  status: PauseStatus;
  /** True while pending, scheduled or active: one open pause per car. */
  open: boolean;
  reason: string;
  /** First day off and the day the car is back, as YYYY-MM-DD in the car's time zone. */
  fromDay: string;
  backOnDay?: string;
  startsAt: Date;
  endsAt?: Date;
  requestedBy: string;
  decidedBy?: string;
  decidedAt?: Date;
  declineReason?: string;
  startedAt?: Date;
  endedAt?: Date;
  endedBy?: string;
  /** Set when the car could not go back live by itself (a recall or document hold). */
  endNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<VehiclePauseDoc>(
  {
    _id: { type: String, default: () => uuid() },
    vehicleId: { type: String, required: true },
    assetPartnerId: String,
    source: { type: String, required: true, enum: ['ops', 'partner'] },
    status: { type: String, required: true, enum: PAUSE_STATUSES },
    open: { type: Boolean, required: true },
    reason: { type: String, required: true },
    fromDay: { type: String, required: true },
    backOnDay: String,
    startsAt: { type: Date, required: true },
    endsAt: Date,
    requestedBy: { type: String, required: true },
    decidedBy: String,
    decidedAt: Date,
    declineReason: String,
    startedAt: Date,
    endedAt: Date,
    endedBy: String,
    endNote: String,
  },
  { timestamps: true, _id: false },
);

schema.index({ vehicleId: 1 }, { unique: true, partialFilterExpression: { open: true } });
schema.index({ vehicleId: 1, createdAt: -1 });
schema.index({ status: 1, startsAt: 1 });
schema.index({ status: 1, endsAt: 1 });
schema.index({ status: 1, createdAt: -1 });

export const VehiclePauseModel = model<VehiclePauseDoc>('VehiclePause', schema, 'vehicle_pauses');
