import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export type MaintenanceApproval = 'not_required' | 'pending' | 'approved' | 'declined';

export interface MaintenanceDoc {
  _id: string;
  vehicleId: string;
  hostId: string;
  type: 'service' | 'repair' | 'inspection' | 'cleaning';
  scheduledFor: Date;
  odometerKm?: number;
  /** Minor units, matching the rest of the app's money convention. */
  cost?: number;
  notes?: string;
  status: 'scheduled' | 'in_progress' | 'completed';
  reminded?: boolean;

  /**
   * Set when the vehicle is Asset Partner-managed. Ops schedules this record
   * (a partner never creates their own — that is the host self-service route
   * below, a different flow), and the partner agreement says maintenance over
   * the agreed threshold needs their sign-off before it proceeds.
   */
  assetPartnerId?: string;
  approval: MaintenanceApproval;
  /**
   * The threshold AT THE TIME this record was created, in minor units.
   * Snapshotted rather than resolved live, so a later change to the partner's
   * terms cannot rewrite whether a past repair required approval.
   */
  approvalThresholdCents?: number;
  approvedAt?: Date;
  approvedBy?: string;
  declineReason?: string;

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

    assetPartnerId: String,
    approval: {
      type: String,
      enum: ['not_required', 'pending', 'approved', 'declined'],
      default: 'not_required',
    },
    approvalThresholdCents: Number,
    approvedAt: Date,
    approvedBy: String,
    declineReason: String,
  },
  { timestamps: true, _id: false },
);

schema.index({ vehicleId: 1, scheduledFor: -1 });
schema.index({ hostId: 1, status: 1 });
// A partner's own approval queue, and the vehicle detail page's history.
schema.index({ assetPartnerId: 1, approval: 1 });

export const MaintenanceModel = model<MaintenanceDoc>('Maintenance', schema);
