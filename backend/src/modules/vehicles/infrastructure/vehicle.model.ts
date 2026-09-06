import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export type VehicleStatus = 'draft' | 'pending_verification' | 'listed' | 'paused' | 'delisted';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface VehiclePhoto {
  url: string;
  key?: string; // S3 key
  isCover?: boolean;
}

export interface SeasonalRule {
  label: string;
  start: string; // 'YYYY-MM-DD'
  end: string;
  multiplierBps: number; // 12000 = 1.2x
}

export interface VehicleDoc {
  _id: string;
  hostId: string;
  hostIsSuperhost: boolean;
  fleetId?: string;
  make: string;
  model: string;
  year: number;
  bodyType: string;
  category: string; // economy | luxury | suv | van | sports | ev ...
  transmission: 'manual' | 'automatic';
  fuelType: 'petrol' | 'diesel' | 'hybrid' | 'ev';
  seats: number;
  /**
   * How to actually find the car once you are at the pin.
   *
   * A map pin is street-level; the car is on P3 in bay 44. Every host explains
   * this by message, to every guest, every time. Stored once instead.
   */
  pickup?: {
    /** "Level 3, bay 44, blue section" */
    instructions?: string;
    /** A photo of the parking spot — worth more than the sentence. */
    spotPhotoUrl?: string;
    /** Gate/lockbox code, revealed only near the handover window. */
    accessCode?: string;
  };
  vin?: string;
  vinVerified: boolean;
  registrationNumber?: string;
  specs: {
    doors?: number;
    color?: string;
    mileageKm?: number;
    largeBags?: number;
    smallBags?: number;
  };
  features: string[];
  photos: VehiclePhoto[];
  addOns: { code: string; label: string; priceType: 'per_trip' | 'per_day'; amount: number }[];
  tripRules: string[];
  mileageLimit: { perDayKm: number; overageFeePerKm: number }; // perDayKm 0 = unlimited
  location: {
    type: 'Point';
    coordinates: [number, number];
    address: string;
    city: string;
    /**
     * Two-letter state code. Rental tax is levied per state, so a car without
     * one cannot be taxed correctly — it is derived at listing time from the
     * geocoded address rather than typed by the host.
     */
    state?: string;
  };
  listing: {
    title: string;
    description: string;
    instantBook: boolean;
    minTripHours: number;
    /**
     * Days kept free after a trip ends, for cleaning, refuelling or servicing.
     * 0 means back-to-back trips are welcome.
     */
    turnaroundDays?: number;
    maxTripHours: number;
    /**
     * Minimum lead time before a trip may start — a guest cannot book a car for
     * sooner than this many hours from now. 0 means it can be booked to start
     * immediately. Mirrors Turo's "advance notice".
     */
    advanceNoticeHours?: number;
    cancellationPolicy: 'flexible' | 'moderate' | 'strict';
    delivery: {
      airport: boolean;
      home: boolean;
      hotel: boolean;
      business: boolean;
      radiusKm: number;
      fee: number; // flat delivery fee (minor units)
    };
  };
  pricing: {
    dailyPrice: number;
    currency: string;
    cleaningFee: number;
    weekendMultiplierBps: number;
    weeklyDiscountBps: number;
    monthlyDiscountBps: number;
    earlyBirdBps: number; // discount for booking far in advance
    lastMinuteBps: number; // discount for near-term bookings
    dynamicPricing: boolean;
    seasonalRules: SeasonalRule[];
    promoActive: boolean;
    promoDiscountBps: number;
  };
  purposes: string[];
  status: VehicleStatus;
  /** Paused automatically because a mandatory doc (insurance/registration)
   *  lapsed. Distinguishes a compliance hold from a host-initiated pause so the
   *  car is auto-relisted on renewal, not left down. */
  complianceHold?: boolean;
  verificationStatus: VerificationStatus;
  ratingAvg: number;
  ratingCount: number;
  totalTrips: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const schema = new Schema<VehicleDoc>(
  {
    _id: { type: String, default: () => uuid() },
    hostId: { type: String, required: true },
    hostIsSuperhost: { type: Boolean, default: false },
    fleetId: { type: String },
    make: { type: String, required: true },
    model: { type: String, required: true },
    year: { type: Number, required: true },
    bodyType: { type: String, required: true },
    category: { type: String, default: 'economy' },
    transmission: { type: String, enum: ['manual', 'automatic'], required: true },
    fuelType: { type: String, enum: ['petrol', 'diesel', 'hybrid', 'ev'], required: true },
    seats: { type: Number, required: true },
    pickup: {
      instructions: { type: String, maxlength: 600 },
      spotPhotoUrl: { type: String },
      accessCode: { type: String, maxlength: 40 },
    },
    vin: { type: String },
    vinVerified: { type: Boolean, default: false },
    registrationNumber: { type: String },
    specs: {
      doors: Number,
      color: String,
      mileageKm: Number,
      largeBags: Number,
      smallBags: Number,
    },
    features: { type: [String], default: [] },
    photos: {
      type: [{ url: String, key: String, isCover: Boolean }],
      default: [],
    },
    addOns: {
      type: [{ code: String, label: String, priceType: { type: String, enum: ['per_trip', 'per_day'] }, amount: Number }],
      default: [],
    },
    tripRules: { type: [String], default: [] },
    mileageLimit: {
      perDayKm: { type: Number, default: 0 },
      overageFeePerKm: { type: Number, default: 0 },
    },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
      address: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, uppercase: true, trim: true },
    },
    listing: {
      title: { type: String, required: true },
      description: { type: String, default: '' },
      instantBook: { type: Boolean, default: false },
      minTripHours: { type: Number, default: 24 },
      turnaroundDays: { type: Number, default: 0, min: 0, max: 7 },
      maxTripHours: { type: Number, default: 24 * 30 },
      advanceNoticeHours: { type: Number, default: 0, min: 0, max: 720 },
      cancellationPolicy: {
        type: String,
        enum: ['flexible', 'moderate', 'strict'],
        default: 'moderate',
      },
      delivery: {
        airport: { type: Boolean, default: false },
        home: { type: Boolean, default: false },
        hotel: { type: Boolean, default: false },
        business: { type: Boolean, default: false },
        radiusKm: { type: Number, default: 0 },
        fee: { type: Number, default: 0 },
      },
    },
    pricing: {
      dailyPrice: { type: Number, required: true },
      currency: { type: String, default: 'USD' },
      cleaningFee: { type: Number, default: 0 },
      weekendMultiplierBps: { type: Number, default: 10000 },
      weeklyDiscountBps: { type: Number, default: 0 },
      monthlyDiscountBps: { type: Number, default: 0 },
      earlyBirdBps: { type: Number, default: 0 },
      lastMinuteBps: { type: Number, default: 0 },
      dynamicPricing: { type: Boolean, default: false },
      seasonalRules: {
        type: [{ label: String, start: String, end: String, multiplierBps: Number }],
        default: [],
      },
      promoActive: { type: Boolean, default: false },
      promoDiscountBps: { type: Number, default: 0 },
    },
    purposes: { type: [String], default: ['rent'] },
    status: { type: String, default: 'draft' },
    complianceHold: { type: Boolean, default: false },
    verificationStatus: { type: String, default: 'unverified' },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    totalTrips: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

// Plain geo index — used by unfiltered proximity queries (recommendations,
// similar cars).
schema.index({ location: '2dsphere' });

/*
 * The search index. Search is by far the hottest query and always filters
 * status:'listed' before the $near proximity sort. A compound 2dsphere index
 * with the equality-matched status first lets the planner narrow to listed cars
 * and THEN walk the geometry, instead of walking every car in the radius and
 * discarding the unlisted ones. That difference is invisible at a few hundred
 * cars and decisive at 100K+ in a dense metro.
 */
schema.index({ status: 1, location: '2dsphere' });
schema.index({ status: 1, verificationStatus: 1 });
schema.index({ hostId: 1, status: 1 });
schema.index({ fleetId: 1 });
schema.index({ 'location.city': 1, category: 1 });
schema.index({ purposes: 1 });

export const VehicleModel = model<VehicleDoc>('Vehicle', schema);
