import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';
import type { PartnerContact } from './asset-partner.model';

/** Why a partner's cars are coming back: they asked, they can't be reached, or they passed away. */
export type ExitReason = 'partner_request' | 'unresponsive' | 'deceased';

// requested → (notice) → scheduled → in_progress (runner) → submitted → completed by a manager; cancelled at any open step.
export type ExitStatus = 'requested' | 'notice' | 'scheduled' | 'in_progress' | 'submitted' | 'completed' | 'cancelled';

export const OPEN_EXIT_STATUSES: ExitStatus[] = ['requested', 'notice', 'scheduled', 'in_progress', 'submitted'];

export type ChecklistKey =
  | 'no_trips'
  | 'delisted'
  | 'repairs_closed'
  | 'insurance_removed'
  | 'toll_tag_removed'
  | 'gps_removed'
  | 'keys_returned'
  | 'accessories_removed'
  | 'papers_removed'
  | 'interior_checked'
  | 'condition_photos'
  | 'odometer_fuel';

export interface ChecklistItem {
  key: ChecklistKey;
  done: boolean;
  /** System checks are worked out from live data, not ticked by hand. */
  auto: boolean;
  required: boolean;
  note?: string;
  doneAt?: Date;
  doneBy?: string;
}

export interface ExitCar {
  vehicleId: string;
  label: string;
  plate?: string;
  checklist: ChecklistItem[];
  photos: { url: string; key: string; label?: string }[];
  odometer?: number;
  fuelLevel?: 'full' | 'three_quarters' | 'half' | 'quarter' | 'empty';
  keysReturned?: number;
  damageNotes?: string;
}

export interface ContactAttempt {
  at: Date;
  by: string;
  channel: 'call' | 'text' | 'email' | 'letter' | 'visit';
  to: 'partner' | 'emergency_contact' | 'representative';
  outcome: 'no_answer' | 'left_message' | 'reached' | 'bounced' | 'wrong_number';
  note?: string;
}

export interface EstateDocument {
  kind: 'death_certificate' | 'authority' | 'other';
  key: string;
  url: string;
  uploadedBy: string;
  uploadedAt: Date;
  verified?: { by: string; at: Date };
}

export interface ExitEvent {
  at: Date;
  by: string;
  type: string;
  detail?: string;
}

export interface AssetPartnerExitDoc {
  _id: string;
  /** Shown to the partner and on the panel, e.g. CD-RT-482913. */
  reference: string;
  partnerId: string;
  reason: ExitReason;
  status: ExitStatus;
  cars: ExitCar[];

  /** 'partner' when the partner asked from their portal, otherwise the staff user id. */
  openedBy: string;
  partnerNote?: string;
  preferredDate?: Date;
  handoverPreference?: 'pickup' | 'deliver';
  deliveryAddress?: string;

  /** Unreachable partner: the formal notice and every attempt to reach them. */
  noticeSentAt?: Date;
  noticeEndsAt?: Date;
  attempts: ContactAttempt[];

  /** A partner who passed away: who told us, and the estate's representative and papers. */
  reportedBy?: PartnerContact;
  estate?: { contact?: PartnerContact; documents: EstateDocument[] };

  scheduledFor?: Date;
  runner?: { staffId?: string; userId: string; name: string; assignedAt: Date };
  startedAt?: Date;
  submittedAt?: Date;
  handover?: {
    to: 'owner' | 'representative' | 'estate' | 'storage';
    receiverName: string;
    receiverSignature: string;
    location: string;
    at: Date;
    ownerInsuranceConfirmed: boolean;
  };
  sentBack?: { by: string; at: Date; reason: string };
  approval?: { by: string; at: Date; note?: string };
  completedAt?: Date;
  cancelled?: { by: string; at: Date; reason: string };

  events: ExitEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const contactSchema = new Schema({ name: String, phone: String, relation: String, email: String }, { _id: false });

const schema = new Schema<AssetPartnerExitDoc>(
  {
    _id: { type: String, default: () => uuid() },
    reference: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true },
    reason: { type: String, required: true, enum: ['partner_request', 'unresponsive', 'deceased'] },
    status: { type: String, required: true, enum: ['requested', 'notice', 'scheduled', 'in_progress', 'submitted', 'completed', 'cancelled'] },
    cars: {
      type: [
        new Schema(
          {
            vehicleId: { type: String, required: true },
            label: String,
            plate: String,
            checklist: {
              type: [new Schema({ key: String, done: Boolean, auto: Boolean, required: Boolean, note: String, doneAt: Date, doneBy: String }, { _id: false })],
              default: [],
            },
            photos: { type: [new Schema({ url: String, key: String, label: String }, { _id: false })], default: [] },
            odometer: Number,
            fuelLevel: { type: String, enum: ['full', 'three_quarters', 'half', 'quarter', 'empty'] },
            keysReturned: Number,
            damageNotes: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    openedBy: { type: String, required: true },
    partnerNote: String,
    preferredDate: Date,
    handoverPreference: { type: String, enum: ['pickup', 'deliver'] },
    deliveryAddress: String,
    noticeSentAt: Date,
    noticeEndsAt: Date,
    attempts: {
      type: [new Schema({ at: Date, by: String, channel: String, to: String, outcome: String, note: String }, { _id: false })],
      default: [],
    },
    reportedBy: { type: contactSchema, default: undefined },
    estate: {
      type: new Schema(
        {
          contact: { type: contactSchema, default: undefined },
          documents: {
            type: [new Schema({ kind: String, key: String, url: String, uploadedBy: String, uploadedAt: Date, verified: { type: new Schema({ by: String, at: Date }, { _id: false }), default: undefined } }, { _id: false })],
            default: [],
          },
        },
        { _id: false },
      ),
      default: undefined,
    },
    scheduledFor: Date,
    runner: { type: new Schema({ staffId: String, userId: String, name: String, assignedAt: Date }, { _id: false }), default: undefined },
    startedAt: Date,
    submittedAt: Date,
    handover: {
      type: new Schema(
        { to: String, receiverName: String, receiverSignature: String, location: String, at: Date, ownerInsuranceConfirmed: Boolean },
        { _id: false },
      ),
      default: undefined,
    },
    sentBack: { type: new Schema({ by: String, at: Date, reason: String }, { _id: false }), default: undefined },
    approval: { type: new Schema({ by: String, at: Date, note: String }, { _id: false }), default: undefined },
    completedAt: Date,
    cancelled: { type: new Schema({ by: String, at: Date, reason: String }, { _id: false }), default: undefined },
    events: { type: [new Schema({ at: Date, by: String, type: String, detail: String }, { _id: false })], default: [] },
  },
  { timestamps: true, _id: false },
);

schema.index({ partnerId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });
schema.index({ 'runner.userId': 1, status: 1 });
schema.index({ 'cars.vehicleId': 1, status: 1 });

export const AssetPartnerExitModel = model<AssetPartnerExitDoc>('AssetPartnerExit', schema);
