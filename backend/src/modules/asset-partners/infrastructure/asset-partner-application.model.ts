import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * A submitted Asset Partner Vehicle Intake — the lead for CATO's primary
 * acquisition path (someone lists a car they already own; CATO runs it).
 *
 * This is a LEAD/application, not an account: the applicant may not have a
 * CATO login yet (the intake form never asks for a password). It captures
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
export type ApplicationStatus = 'submitted' | 'under_review' | 'approved' | 'rejected';
export type PartnerType = 'individual' | 'business' | 'fleet';
export type OwnershipStatus = 'owned' | 'financed' | 'leased';
export type CoverageType = 'full' | 'liability' | 'unsure';
export type Availability = 'fulltime' | 'parttime' | 'seasonal';

export interface AssetPartnerApplicationDoc {
  _id: string;
  /** Server-generated, e.g. "CD-AP-482913" — shown to the applicant and used
   *  for support lookups. Never client-supplied. */
  reference: string;
  status: ApplicationStatus;

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

  // Step 4 — Condition
  hadAccident: boolean;
  accidentDetail?: string;
  smokeFree: boolean;
  petFree: boolean;
  hasMaintenanceRecords?: boolean;
  /** Optional — the form itself allows emailing photos later. */
  photos: { url: string; key?: string; label?: string }[];

  // Step 5 — Insurance
  insurance: {
    carrier: string;
    policyNumber: string;
    coverageType: CoverageType;
    policyExpiry?: Date;
  };

  // Step 6 — Preferences & agreement
  availability: Availability;
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
  /** Set on approval when a matching account existed and was auto-verified as
   *  a host. False/absent means ops still needs to follow up once the
   *  applicant creates an account. */
  hostVerified?: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<AssetPartnerApplicationDoc>(
  {
    _id: { type: String, default: () => uuid() },
    reference: { type: String, required: true, unique: true },
    status: { type: String, default: 'submitted', enum: ['submitted', 'under_review', 'approved', 'rejected'] },

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

    hadAccident: { type: Boolean, required: true },
    accidentDetail: String,
    smokeFree: { type: Boolean, required: true },
    petFree: { type: Boolean, required: true },
    hasMaintenanceRecords: Boolean,
    photos: {
      type: [{ _id: false, url: String, key: String, label: String }],
      default: [],
    },

    insurance: {
      carrier: { type: String, required: true },
      policyNumber: { type: String, required: true },
      coverageType: { type: String, required: true, enum: ['full', 'liability', 'unsure'] },
      policyExpiry: Date,
    },

    availability: { type: String, required: true, enum: ['fulltime', 'parttime', 'seasonal'] },
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
    hostVerified: Boolean,
  },
  { timestamps: true, _id: false },
);

schema.index({ status: 1, createdAt: -1 });
schema.index({ email: 1 });
schema.index({ 'vehicle.vin': 1 });

export const AssetPartnerApplicationModel = model<AssetPartnerApplicationDoc>(
  'AssetPartnerApplication',
  schema,
);
