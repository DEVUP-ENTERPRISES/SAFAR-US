import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export interface MaintenanceDoc {
  _id: string;
  vehicleId: string;
  hostId: string;
  type: 'service' | 'repair' | 'inspection' | 'cleaning';
  scheduledFor: Date;
  odometerKm?: number;
  cost?: number;
  notes?: string;
  status: 'scheduled' | 'in_progress' | 'completed';
  reminded?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<MaintenanceDoc>(
  {
    _id: { type: String, default: () => uuid() },
    vehicleId: { type: String, required: true },
    hostId: { type: String, required: true },
    type: { type: String, enum: ['service', 'repair', 'inspection', 'cleaning'], required: true },
    scheduledFor: { type: Date, required: true },
    odometerKm: Number,
    cost: Number,
    notes: String,
    status: { type: String, enum: ['scheduled', 'in_progress', 'completed'], default: 'scheduled' },
    reminded: { type: Boolean, default: false },
  },
  { timestamps: true, _id: false },
);

schema.index({ vehicleId: 1, scheduledFor: -1 });
schema.index({ hostId: 1, status: 1 });

export const MaintenanceModel = model<MaintenanceDoc>('Maintenance', schema);
