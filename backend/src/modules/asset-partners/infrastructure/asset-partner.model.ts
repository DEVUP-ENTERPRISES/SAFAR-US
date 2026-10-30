import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * An Asset Partner — a vehicle owner in CatoDrive's managed programme.
 *
 * Deliberately its OWN entity rather than a flag on Host, because the two are
 * different businesses. A host self-manages: they set their own price, run
 * their own calendar and are paid per booking. A partner does nothing — CatoDrive
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

export interface PartnerAgreementSignature {
  version: number;
  /** The exact text signed, so a later edit can never change what they agreed to. */
  bodyHash: string;
  signedName: string;
  signedAt: Date;
  ip?: string;
  userAgent?: string;
  /** The details filled into the text; the licence is kept as state and last four digits only. */
  fields?: Record<string, string>;
  /** The sealed envelope this signature belongs to. */
  envelopeId?: string;
}
export type PayoutMethod = 'check' | 'zelle';

export interface PartnerContact {
  name: string;
  phone: string;
  relation: string;
  email?: string;
}

export type Residency = 'citizen' | 'permanent_resident' | 'visa' | 'other';

/** Who to reach when the partner can't be reached; collected before signing. */
export interface PartnerProfile {
  emergencyContacts: PartnerContact[];
  /** Someone the partner allows to decide about their car if CatoDrive cannot reach them. */
  representative?: PartnerContact;
  residency?: Residency;
  /** Asked only of visa holders, so CatoDrive can plan before they may have to leave. */
  visaExpiry?: Date;
  preferredContact?: 'call' | 'text' | 'email';
  completedAt?: Date;
}

/** The signing window: the offer to sign lapses after the configured number of days. */
export interface AgreementOffer {
  sentAt: Date;
  expiresAt: Date;
  remindedAt?: Date;
  expiredNoticeAt?: Date;
  reissueRequestedAt?: Date;
  reissues?: number;
}

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
  /** The CatoDrive account this partner signs in with. */
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
    /** What the partner chose in the agreement (Exhibit B); ops can still override it in terms. */
    method?: PayoutMethod;
    zelleName?: string;
    payableTo?: string;
  };

  /** Partners approved through the portal sign the agreement there; ones added directly signed outside it. */
  agreementRequired?: boolean;
  agreement?: PartnerAgreementSignature;
  nda?: PartnerAgreementSignature;
  agreementOffer?: AgreementOffer;

  profile?: PartnerProfile;
  /** Ops confirmed the partner's identity by hand when the automatic check could not be used. */
  identityOverride?: { by: string; at: Date; reason: string };
  /** Last time the partner opened their portal; how CatoDrive notices someone has gone quiet. */
  lastSeenAt?: Date;
  /** Payouts paused while a return case is open (unreachable partner, or an estate to confirm). */
  payoutHold?: { reason: 'unresponsive' | 'deceased'; since: Date; exitId?: string };

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

const signatureSchema = new Schema(
  { version: Number, bodyHash: String, signedName: String, signedAt: Date, ip: String, userAgent: String, fields: { type: Map, of: String }, envelopeId: String },
  { _id: false },
);

const contactSchema = new Schema({ name: String, phone: String, relation: String, email: String }, { _id: false });

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
      method: { type: String, enum: ['check', 'zelle'] },
      zelleName: String,
      payableTo: String,
    },

    agreementRequired: Boolean,
    agreement: { type: signatureSchema, default: undefined },
    nda: { type: signatureSchema, default: undefined },
    agreementOffer: {
      type: new Schema({ sentAt: Date, expiresAt: Date, remindedAt: Date, expiredNoticeAt: Date, reissueRequestedAt: Date, reissues: Number }, { _id: false }),
      default: undefined,
    },

    profile: {
      type: new Schema(
        {
          emergencyContacts: { type: [contactSchema], default: [] },
          representative: { type: contactSchema, default: undefined },
          residency: { type: String, enum: ['citizen', 'permanent_resident', 'visa', 'other'] },
          visaExpiry: Date,
          preferredContact: { type: String, enum: ['call', 'text', 'email'] },
          completedAt: Date,
        },
        { _id: false },
      ),
      default: undefined,
    },
    identityOverride: { type: new Schema({ by: String, at: Date, reason: String }, { _id: false }), default: undefined },
    lastSeenAt: Date,
    payoutHold: {
      type: new Schema({ reason: { type: String, enum: ['unresponsive', 'deceased'] }, since: Date, exitId: String }, { _id: false }),
      default: undefined,
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
