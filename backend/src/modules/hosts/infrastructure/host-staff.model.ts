import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * A Captain — someone who works a host's fleet without being the host.
 *
 * Any host beyond one or two cars stops doing handovers personally. They use a
 * partner, a cleaner, a valet, a manager. Today they do that by sharing their
 * password, which means the person who wipes the seats can also change payout
 * details, read every guest's phone number, and delete listings. That is the
 * actual state of the art in this category, and it is a breach waiting to be
 * written up.
 *
 * A Captain gets their own login, scoped to named cars and named abilities.
 *
 * The permission set is deliberately small and deliberately excludes money.
 * Nothing a Captain can do moves a cent or changes what a car costs — those
 * stay with the account that owns the bank details. Anything not listed here
 * is refused, so adding an ability is an explicit decision rather than a
 * side-effect of a new endpoint.
 */

export type CaptainAbility =
  /** Run check-in and checkout: odometer, fuel, condition photos. */
  | 'trip:handover'
  /** Read and reply to guest messages on assigned cars. */
  | 'trip:message'
  /** Block and unblock dates on assigned cars. */
  | 'calendar:manage'
  /** Report damage and citations. Cannot charge for either. */
  | 'incident:report'
  /** See the trip list for assigned cars. */
  | 'trip:view';

export const CAPTAIN_ABILITIES: CaptainAbility[] = [
  'trip:view',
  'trip:handover',
  'trip:message',
  'calendar:manage',
  'incident:report',
];

/** What a new Captain gets unless the host says otherwise. */
export const DEFAULT_ABILITIES: CaptainAbility[] = ['trip:view', 'trip:handover', 'trip:message'];

export type CaptainStatus = 'invited' | 'active' | 'suspended';

export interface HostStaffDoc {
  _id: string;
  /** The host whose fleet this Captain works. */
  hostId: string;
  /** Set once the invited person accepts and has a user account. */
  userId?: string;
  name: string;
  email: string;
  phone?: string;
  /** Free-text job title shown in the UI — 'Valet', 'Cleaner', 'Fleet manager'. */
  title?: string;
  abilities: CaptainAbility[];
  /**
   * Cars this Captain works. Empty means the whole fleet, including cars added
   * later — a deliberate choice for the single-manager case, and stated as
   * "entire fleet" in the UI so it is never mistaken for "no access".
   */
  vehicleIds: string[];
  status: CaptainStatus;
  /** Single-use invite token; cleared on acceptance. */
  inviteToken?: string;
  invitedAt: Date;
  acceptedAt?: Date;
  lastActiveAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<HostStaffDoc>(
  {
    _id: { type: String, default: uuid },
    hostId: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    title: { type: String, trim: true },
    abilities: {
      type: [String],
      enum: CAPTAIN_ABILITIES,
      default: DEFAULT_ABILITIES,
    },
    vehicleIds: { type: [String], default: [] },
    status: { type: String, enum: ['invited', 'active', 'suspended'], default: 'invited', index: true },
    inviteToken: { type: String, index: true, sparse: true },
    invitedAt: { type: Date, default: Date.now },
    acceptedAt: Date,
    lastActiveAt: Date,
  },
  { timestamps: true, versionKey: false },
);

// The same person cannot be invited to the same fleet twice — otherwise
// revoking one row leaves another live and the host thinks access is gone.
schema.index({ hostId: 1, email: 1 }, { unique: true });

export const HostStaffModel = model<HostStaffDoc>('HostStaff', schema);
