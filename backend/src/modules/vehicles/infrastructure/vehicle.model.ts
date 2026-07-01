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
  fleetId?: string;
  make: string;
  model: string;
  year: number;
  bodyType: string;
  category: string; // economy | luxury | suv | van | sports | ev ...
  transmission: 'manual' | 'automatic';
  fuelType: 'petrol' | 'diesel' | 'hybrid' | 'ev';
  seats: number;
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
  location: {
    type: 'Point';
    coordinates: [number, number];
    address: string;
    city: string;
  };
  listing: {
    title: string;
    description: string;
    instantBook: boolean;
    minTripHours: number;
    maxTripHours: number;
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
    fleetId: { type: String },
    make: { type: String, required: true },
    model: { type: String, required: true },
    year: { type: Number, required: true },
    bodyType: { type: String, required: true },
    category: { type: String, default: 'economy' },
    transmission: { type: String, enum: ['manual', 'automatic'], required: true },
    fuelType: { type: String, enum: ['petrol', 'diesel', 'hybrid', 'ev'], required: true },
    seats: { type: Number, required: true },
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
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
      address: { type: String, default: '' },
      city: { type: String, default: '' },
    },
    listing: {
      title: { type: String, required: true },
      description: { type: String, default: '' },
      instantBook: { type: Boolean, default: false },
      minTripHours: { type: Number, default: 24 },
      maxTripHours: { type: Number, default: 24 * 30 },
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
      currency: { type: String, default: 'INR' },
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
    verificationStatus: { type: String, default: 'unverified' },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    totalTrips: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

schema.index({ location: '2dsphere' });
schema.index({ status: 1, verificationStatus: 1 });
schema.index({ hostId: 1, status: 1 });
schema.index({ fleetId: 1 });
schema.index({ 'location.city': 1, category: 1 });
schema.index({ purposes: 1 });

export const VehicleModel = model<VehicleDoc>('Vehicle', schema);
