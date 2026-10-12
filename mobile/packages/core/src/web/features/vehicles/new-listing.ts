// Generated from frontend/src/features/vehicles/new-listing.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
import { milesToKm, perMileToPerKm } from '../../lib/utils/format';
import type { RowPreview } from '../host/api';
import type { CreateVehicleInput } from './api';
import type { DeliveryLocation } from './types';

export const LISTING_STEPS = ['Basics', 'Details', 'Photos', 'Pricing', 'Delivery', 'Standards', 'Review'];

export interface ListingDraft {
  make: string;
  model: string;
  year: number;
  category: string;
  bodyType: string;
  transmission: 'manual' | 'automatic';
  fuelType: 'petrol' | 'diesel' | 'hybrid' | 'ev';
  seats: number;
  city: string;
  address: string;
  pickupNotes: string;
  lng: number | null;
  lat: number | null;
  color: string;
  doors: number;
  features: string[];
  vin: string;
  licensePlate: string;
  licensePlateState: string;
  odometerMiles: number | '';
  standardsAgreed: boolean;
  photos: { url: string; key?: string; isCover?: boolean; fingerprint?: string }[];
  title: string;
  description: string;
  instantBook: boolean;
  cancellationPolicy: 'flexible' | 'moderate' | 'strict';
  dailyPrice: number;
  cleaningFee: number;
  weekendPct: number;
  weeklyDiscountPct: number;
  monthlyDiscountPct: number;
  earlyBirdPct: number;
  lastMinutePct: number;
  deliveryLocations: DeliveryLocation[];
  addOnCodes: string[];
  tripRules: string;
  mileagePerDay: number;
  mileageOverage: number;
}

/** Preset extras a host can offer (guest selects at checkout). */
export const ADDON_PRESETS: Record<string, { label: string; priceType: 'per_trip' | 'per_day'; amount: number; note?: string }> = {
  child_seat: { label: 'Child seat', priceType: 'per_trip', amount: 15 },
  // $8/gallon on a typical 15-gallon refill, plus a $20 service fee.
  fuel_surcharge: { label: 'Fuel surcharge', priceType: 'per_trip', amount: 140, note: '$8/gallon + $20 service fee - guest returns it unfuelled' },
};

export const INITIAL_LISTING_DRAFT: ListingDraft = {
  make: '', model: '', year: 2022, category: 'economy', bodyType: 'sedan',
  transmission: 'automatic', fuelType: 'petrol', seats: 5,
  city: '', address: '', pickupNotes: '', lng: null, lat: null, color: '', doors: 4, features: [],
  vin: '', licensePlate: '', licensePlateState: '', odometerMiles: '', standardsAgreed: false,
  photos: [], title: '', description: '', instantBook: true, cancellationPolicy: 'moderate',
  dailyPrice: 65, cleaningFee: 0, weekendPct: 20, weeklyDiscountPct: 10, monthlyDiscountPct: 20,
  earlyBirdPct: 5, lastMinutePct: 0,
  deliveryLocations: [],
  addOnCodes: [], tripRules: '', mileagePerDay: 200, mileageOverage: 0.35,
};

export const CATEGORY_OPTIONS = ['economy', 'luxury', 'suv', 'van', 'sports', 'ev'];
export const BODY_TYPE_OPTIONS = ['sedan', 'suv', 'hatchback', 'coupe', 'van', 'truck'];
export const TRANSMISSION_OPTIONS = ['automatic', 'manual'];
/** "petrol" is stored, but a US host is looking for "Gas". */
export const FUEL_OPTIONS = [
  { value: 'petrol', label: 'Gas' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'ev', label: 'Electric' },
];

export const HOST_STANDARDS = [
  { title: 'Maintenance', body: 'Keep your car well maintained so your guests stay safe on the road. You will be required to pass an inspection for every car you list.' },
  { title: 'Cleaning', body: 'Clean and refuel your car before every trip so your guests have a good experience.' },
  { title: 'Accurate details', body: 'The photos, features and condition you list must match the car a guest actually picks up.' },
  { title: 'Availability', body: 'Honor every confirmed booking. Cancelling on a guest after they’ve booked affects your standing as a host.' },
];

/** What each step requires, named per field, so a mistake is caught on the step that owns it. */
export function listingStepErrors(d: ListingDraft, step: number, minPhotos: number): Record<string, string> {
  const e: Record<string, string> = {};
  if (step === 0) {
    if (!d.make.trim()) e.make = 'Required';
    if (!d.model.trim()) e.model = 'Required';
    const year = Number(d.year);
    if (!year || year < 1900 || year > new Date().getFullYear() + 1) e.year = 'Enter a valid year';
    if (!Number(d.seats) || Number(d.seats) < 1) e.seats = 'At least 1 seat';
  }
  if (step === 1) {
    // A listing with no coordinates cannot be searched.
    if (d.lng === null || d.lat === null) e.location = 'Pick a pickup location from the suggestions';
    else if (!d.city.trim()) e.location = 'That address has no city - pick a more specific one';
  }
  if (step === 2 && d.photos.length < minPhotos) {
    e.photos = `Add ${minPhotos - d.photos.length} more photo${minPhotos - d.photos.length === 1 ? '' : 's'}`;
  }
  if (step === 3 && (!Number(d.dailyPrice) || Number(d.dailyPrice) <= 0)) e.dailyPrice = 'Set a daily price';
  if (step === 4 && Number(d.mileageOverage) < 0) e.mileageOverage = 'Cannot be negative';
  if (step === 5 && !d.standardsAgreed) e.standardsAgreed = 'You must agree to continue';
  return e;
}

/** Every unmet requirement across the wizard, for the Review step. */
export const listingBlockers = (d: ListingDraft, minPhotos: number) =>
  [0, 1, 2, 3, 4, 5].flatMap((step) => Object.entries(listingStepErrors(d, step, minPhotos)).map(([field, msg]) => ({ step, field, msg })));

/** Fill the basics from a decoded VIN, keeping anything the VIN didn't include. */
export function applyVinDecode(prev: ListingDraft, r: RowPreview): ListingDraft {
  if (!r.ok) return prev;
  return {
    ...prev,
    make: r.make ?? prev.make,
    model: r.model ?? prev.model,
    year: r.year ?? prev.year,
    bodyType: r.bodyType ?? prev.bodyType,
    fuelType: r.fuelType ?? prev.fuelType,
    transmission: r.transmission ?? prev.transmission,
    seats: r.seats ?? prev.seats,
    doors: r.doors ?? prev.doors,
  };
}

/** Add photos with the first ever added as the cover when none is set. */
export function withCover<T extends { isCover?: boolean }>(photos: T[]): T[] {
  if (photos.length && !photos.some((x) => x.isCover)) return [{ ...photos[0], isCover: true }, ...photos.slice(1)];
  return photos;
}

export const plateWithState = (d: ListingDraft) =>
  d.licensePlate.trim() ? `${d.licensePlate.trim()}${d.licensePlateState ? ` (${d.licensePlateState})` : ''}` : undefined;

/** The create-vehicle body; the host types miles and dollars, storage stays in km and cents. */
export function createListingInput(d: ListingDraft, dailyMiles: number): CreateVehicleInput {
  return {
    make: d.make, model: d.model, year: Number(d.year), bodyType: d.bodyType, category: d.category,
    transmission: d.transmission, fuelType: d.fuelType, seats: Number(d.seats),
    vin: d.vin.trim() || undefined,
    registrationNumber: plateWithState(d),
    specs: {
      color: d.color,
      doors: Number(d.doors),
      ...(d.odometerMiles !== '' ? { mileageKm: milesToKm(Number(d.odometerMiles)) } : {}),
    },
    features: d.features,
    photos: d.photos,
    location: {
      lng: d.lng!,
      lat: d.lat!,
      address: [d.address, d.pickupNotes].filter(Boolean).join(' - '),
      city: d.city,
    },
    listing: {
      title: d.title || `${d.make} ${d.model} ${d.year}`,
      description: d.description,
      instantBook: d.instantBook,
      minTripHours: 24,
      maxTripHours: 24 * 30,
      cancellationPolicy: d.cancellationPolicy,
      deliveryLocations: d.deliveryLocations,
    },
    addOns: d.addOnCodes.map((code) => ({
      code,
      label: ADDON_PRESETS[code].label,
      priceType: ADDON_PRESETS[code].priceType,
      amount: Math.round(ADDON_PRESETS[code].amount * 100),
    })),
    tripRules: d.tripRules.split('\n').map((r) => r.trim()).filter(Boolean),
    mileageLimit: {
      perDayKm: milesToKm(dailyMiles),
      overageFeePerKm: perMileToPerKm(Math.round(d.mileageOverage * 100)),
    },
    pricing: {
      dailyPrice: Math.round(d.dailyPrice * 100),
      currency: 'USD',
      cleaningFee: Math.round(d.cleaningFee * 100),
      weekendMultiplierBps: 10000 + Math.round(d.weekendPct * 100),
      weeklyDiscountBps: Math.round(d.weeklyDiscountPct * 100),
      monthlyDiscountBps: Math.round(d.monthlyDiscountPct * 100),
      earlyBirdBps: Math.round(d.earlyBirdPct * 100),
      lastMinuteBps: Math.round(d.lastMinutePct * 100),
      dynamicPricing: false,
    },
  };
}
