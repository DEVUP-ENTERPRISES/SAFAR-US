import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * An Asset Partner — a vehicle owner in CATO's managed programme.
 *
 * Deliberately its OWN entity rather than a flag on Host, because the two are
 * different businesses. A host self-manages: they set their own price, run
 * their own calendar and are paid per booking. A partner does nothing — CATO
 * lists, prices, delivers, cleans and services the car — and is paid a monthly
 * net after a management fee, fleet insurance and detailing.
 *
 * The published terms this models (see /asset-partners):
 *   gross booking revenue
 *   − 20% management fee
 *   − Roamly fleet insurance   (recurring, per vehicle, per month)
 *   − professional detailing   (recurring, per vehicle, per month)
 *   = partner net, paid monthly on the 5th by check or Zelle
 *
 * None of those recurring deductions can be expressed as a commission rate,
 * which is why partner economics live here and not in the host take rate.
 *
 * A partner still has a Host record underneath: that is the marketplace SELLER
 * identity a Vehicle hangs off, so partner cars are bookable by guests exactly
 * like any other car. The Host record is plumbing; programme membership,
 * status and commercial terms are this document's job.
 */

/**
 * Programme lifecycle. Separate from host.verificationStatus, which previously
 * did double duty and could not express onboarding or suspension.
 */
export type PartnerStatus =
  /** Approved on paper; car not yet photographed, inspected or live. */
  | 'onboarding'
  /** Live and earning. */
  | 'active'
  /** Temporarily out of the programme — no new bookings, still owed money. */
  | 'suspended'
  /** Left the programme. */
  | 'exited';

export type PartnerType = 'individual' | 'business' | 'fleet';
export type PayoutMethod = 'check' | 'zelle';

/**
 * Per-partner commercial overrides. Everything is optional: an unset field
 * falls back to the platform default, so a negotiated fleet deal only has to
 * state what is actually different. Resolved by
 * assetPartnerService.termsFor().
 */
export interface PartnerTermsOverride {
  /** Management fee in basis points. 2000 = the published 20%. */
  managementFeeBps?: number;
  /** Fleet insurance recharged per vehicle per month, in minor units. */
  insuranceMonthlyCents?: number;
  /** Professional detailing per vehicle per month, in minor units. */
  detailingMonthlyCents?: number;
  /** Partner's damage exposure ceiling per incident, in minor units. */
  deductibleCapCents?: number;
  /** Maintenance at or below this is done without asking; above needs approval. */
  maintenanceApprovalCents?: number;
  payoutMethod?: PayoutMethod;
  /** Day of the month partner payouts land. */
  payoutDayOfMonth?: number;
}

export interface AssetPartnerDoc {
  _id: string;
  /** The CATO account this partner signs in with. */
  userId: string;
  /** Marketplace seller identity their vehicles hang off. */
  hostId: string;
  /** The approved application that admitted them to the programme. */
  applicationId?: string;
  status: PartnerStatus;
  partnerType: PartnerType;

  displayName: string;
  businessName?: string;
  /** Contact as given on the application — may differ from the account. */
  email?: string;
  phone?: string;

  /** Only what is negotiated away from the platform defaults. */
  terms: PartnerTermsOverride;

  /**
   * Where the monthly net actually goes. Separate from `terms.payoutMethod`
   * (check vs Zelle is a negotiated TERM) — this is the recipient detail that
   * term requires, and it is the partner's own information to keep current,
   * not something ops negotiates.
   */
  payoutDetails?: {
    /** Required once payoutMethod is 'check'. */
    mailingAddress?: string;
    /** Required once payoutMethod is 'zelle' — the email or phone it's sent to. */
    zelleHandle?: string;
  };

  /** Programme milestones, for the partner's own status tracker. */
  approvedAt?: Date;
  onboardedAt?: Date;
  activatedAt?: Date;
  suspendedAt?: Date;
  suspendedReason?: string;
  exitedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<AssetPartnerDoc>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true },
    hostId: { type: String, required: true },
    applicationId: String,
    status: {
      type: String,
      required: true,
      default: 'onboarding',
      enum: ['onboarding', 'active', 'suspended', 'exited'],
    },
    partnerType: { type: String, required: true, enum: ['individual', 'business', 'fleet'] },

    displayName: { type: String, required: true },
    businessName: String,
    email: { type: String, lowercase: true, trim: true },
    phone: String,

    terms: {
      managementFeeBps: Number,
      insuranceMonthlyCents: Number,
      detailingMonthlyCents: Number,
      deductibleCapCents: Number,
      maintenanceApprovalCents: Number,
      payoutMethod: { type: String, enum: ['check', 'zelle'] },
      payoutDayOfMonth: Number,
    },
    payoutDetails: {
      mailingAddress: String,
      zelleHandle: String,
    },

    approvedAt: Date,
    onboardedAt: Date,
    activatedAt: Date,
    suspendedAt: Date,
    suspendedReason: String,
    exitedAt: Date,
  },
  { timestamps: true, _id: false },
);

// One programme membership per account.
schema.index({ userId: 1 }, { unique: true });
schema.index({ hostId: 1 });
schema.index({ status: 1, createdAt: -1 });

export const AssetPartnerModel = model<AssetPartnerDoc>('AssetPartner', schema);
