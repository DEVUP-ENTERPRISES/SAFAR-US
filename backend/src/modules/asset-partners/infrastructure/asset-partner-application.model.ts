import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * A submitted Asset Partner Vehicle Intake — the lead for CatoDrive's primary
 * acquisition path (someone lists a car they already own; CatoDrive runs it).
 *
 * This is a LEAD/application, not an account: the applicant may not have a
 * CatoDrive login yet (the intake form never asks for a password). It captures
 * everything the six-step form collects — partner info, the vehicle, title/
 * ownership, condition, insurance, and availability — plus the required
 * acknowledgements and a typed signature, so there is a durable record of
 * exactly what was represented at application time.
 *
 * Approval is the gate the business asked for: only once an admin reviews and
 * approves an application does the person behind it become eligible to
 * onboard a vehicle (see review() in the service, which verifies their host
 * account). Final vehicle listing itself stays a human "onboarding &
 * agreement" step, matching the four-step process on the marketing page —
 * this record is not auto-converted into a live listing.
 */
export type ApplicationStatus = 'submitted' | 'under_review' | 'changes_requested' | 'approved' | 'rejected';
/** A new partner joining, or an existing partner offering another car. */
export type ApplicationKind = 'partner' | 'vehicle';
export type PartnerType = 'individual' | 'business' | 'fleet';
export type OwnershipStatus = 'owned' | 'financed' | 'leased';
export type CoverageType = 'full' | 'liability' | 'unsure';
/** parttime is kept only so older applications still read. */
export type Availability = 'fulltime' | 'parttime' | 'seasonal';
export const REJECTION_REASONS = [
  'vehicle_age',
  'mileage',
  'title',
  'accident_history',
  'condition',
  'insurance',
  'documents',
  'identity',
  'service_area',
  'demand',
  'other',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export interface ChangeRequest {
  items: { key: string; label?: string; note?: string }[];
  note?: string;
  requestedAt: Date;
  requestedBy?: string;
  before: Record<string, unknown>;
}

export interface AssetPartnerApplicationDoc {
  _id: string;
  /** Server-generated, e.g. "CD-AP-482913" — shown to the applicant and used
   *  for support lookups. Never client-supplied. */
  reference: string;
  status: ApplicationStatus;
  kind: ApplicationKind;
  /** Set on a vehicle application: the partner offering the car. */
  partnerId?: string;
  /** The draft listing created for this car once it was approved. */
  vehicleId?: string;

  // Step 1 — Partner information
  fullName: string;
  businessName?: string;
  partnerType: PartnerType;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  referral?: string;

  // Step 2 — Vehicle details
  vehicle: {
    year: string;
    make: string;
    model: string;
    trim?: string;
    mileage: number;
    exteriorColor?: string;
    interiorColor?: string;
    vin: string;
    plate: string;
  };

  // Step 3 — Ownership & title
  ownership: OwnershipStatus;
  lienholder?: string;
  lienAccountLast4?: string;
  estimatedMarketValue?: string;
  titleStatus?: 'clean' | 'salvage' | 'rebuilt' | 'flood' | 'lemon';

  // Step 4 — Condition
  hadAccident: boolean;
  accidentDetail?: string;
  /** No longer asked: CatoDrive cars are always no-smoking and no-pets. Older applications have them. */
  smokeFree?: boolean;
  petFree?: boolean;
  hasMaintenanceRecords?: boolean;
  /** Optional — the form itself allows emailing photos later. */
  photos: { url: string; key?: string; label?: string; sha256?: string }[];

  // Step 5 — Insurance
  insurance?: {
    carrier?: string;
    policyNumber?: string;
    coverageType?: CoverageType;
    policyExpiry?: Date;
  };

  // Step 6 — Preferences & agreement
  availability: Availability;
  /** Seasonal only: how many months the car is committed for. */
  seasonMonths?: number;
  preferredZone?: string;
  targetStartDate?: Date;
  notes?: string;
  acknowledgedAccurate: boolean;
  acknowledgedInspection: boolean;
  acknowledgedTerms: boolean;
  signature: string;
  signedAt: Date;

  // Submission context
  submittedByUserId?: string;
  ip?: string;
  userAgent?: string;

  // Review
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  /** Why it was declined, what would change the answer, and when they may apply again. */
  rejection?: { reasons: RejectionReason[]; improvements?: string; reapplyAfter?: Date };
  /** The open request for changes: exactly what to redo, and how each item looked when it was asked. */
  changeRequest?: ChangeRequest;
  /** The latest resubmission, so ops sees what changed against what was there before. */
  resubmission?: { at: Date; changed: string[]; before: Record<string, unknown> };
  /** Set on approval when a matching account existed and was auto-verified as
   *  a host. False/absent means ops still needs to follow up once the
   *  applicant creates an account. */
  hostVerified?: boolean;
  /** The typed address as found on the map; matched false when the lookup found nothing. */
  geo?: { lat?: number; lng?: number; formatted?: string; matched: boolean; checkedAt: Date };
  /** Where the applicant's device was when they applied, only when they agreed to share it. */
  submittedFrom?: { lat: number; lng: number; accuracyM?: number; at: Date };

  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<AssetPartnerApplicationDoc>(
  {
    _id: { type: String, default: () => uuid() },
    reference: { type: String, required: true, unique: true },
    status: { type: String, default: 'submitted', enum: ['submitted', 'under_review', 'changes_requested', 'approved', 'rejected'] },
    kind: { type: String, default: 'partner', enum: ['partner', 'vehicle'] },
    partnerId: String,
    vehicleId: String,

    fullName: { type: String, required: true },
    businessName: String,
    partnerType: { type: String, required: true, enum: ['individual', 'business', 'fleet'] },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String, required: true },
    referral: String,

    vehicle: {
      year: { type: String, required: true },
      make: { type: String, required: true },
      model: { type: String, required: true },
      trim: String,
      mileage: { type: Number, required: true },
      exteriorColor: String,
      interiorColor: String,
      vin: { type: String, required: true, uppercase: true, trim: true },
      plate: { type: String, required: true },
    },

    ownership: { type: String, required: true, enum: ['owned', 'financed', 'leased'] },
    lienholder: String,
    lienAccountLast4: String,
    estimatedMarketValue: String,
    titleStatus: { type: String, enum: ['clean', 'salvage', 'rebuilt', 'flood', 'lemon'] },

    hadAccident: { type: Boolean, required: true },
    accidentDetail: String,
    smokeFree: Boolean,
    petFree: Boolean,
    hasMaintenanceRecords: Boolean,
    photos: {
      type: [{ _id: false, url: String, key: String, label: String, sha256: String }],
      default: [],
    },

    insurance: {
      carrier: String,
      policyNumber: String,
      coverageType: { type: String, enum: ['full', 'liability', 'unsure'] },
      policyExpiry: Date,
    },

    availability: { type: String, required: true, enum: ['fulltime', 'parttime', 'seasonal'] },
    seasonMonths: Number,
    preferredZone: String,
    targetStartDate: Date,
    notes: String,
    acknowledgedAccurate: { type: Boolean, required: true },
    acknowledgedInspection: { type: Boolean, required: true },
    acknowledgedTerms: { type: Boolean, required: true },
    signature: { type: String, required: true },
    signedAt: { type: Date, required: true },

    submittedByUserId: String,
    ip: String,
    userAgent: String,

    reviewedBy: String,
    reviewedAt: Date,
    reviewNotes: String,
    rejection: {
      type: new Schema({ reasons: { type: [String], enum: REJECTION_REASONS, default: [] }, improvements: String, reapplyAfter: Date }, { _id: false }),
      default: undefined,
    },
    hostVerified: Boolean,
    geo: { type: new Schema({ lat: Number, lng: Number, formatted: String, matched: Boolean, checkedAt: Date }, { _id: false }), default: undefined },
    submittedFrom: { type: new Schema({ lat: Number, lng: Number, accuracyM: Number, at: Date }, { _id: false }), default: undefined },
    changeRequest: {
      type: new Schema(
        {
          items: { type: [{ _id: false, key: { type: String, required: true }, label: String, note: String }], default: [] },
          note: String,
          requestedAt: { type: Date, required: true },
          requestedBy: String,
          before: { type: Schema.Types.Mixed, default: {} },
        },
        { _id: false },
      ),
      default: undefined,
    },
    resubmission: {
      type: new Schema({ at: Date, changed: [String], before: { type: Schema.Types.Mixed, default: {} } }, { _id: false }),
      default: undefined,
    },
  },
  { timestamps: true, _id: false },
);

schema.index({ status: 1, createdAt: -1 });
schema.index({ email: 1 });
schema.index({ submittedByUserId: 1, createdAt: -1 });
schema.index({ 'vehicle.vin': 1 });

export const AssetPartnerApplicationModel = model<AssetPartnerApplicationDoc>(
  'AssetPartnerApplication',
  schema,
);
