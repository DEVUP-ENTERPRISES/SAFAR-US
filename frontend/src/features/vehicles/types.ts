export interface VehiclePhoto {
  url: string;
  key?: string;
  isCover?: boolean;
}

export type DeliveryLocationKind = 'airport' | 'hotel' | 'business' | 'custom';
export type DeliveryAccessMethod = 'lockbox' | 'remote_unlock' | 'in_person';

/** One place the host delivers to, priced on its own. */
export interface DeliveryLocation {
  id: string;
  kind: DeliveryLocationKind;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  fee: number;
  /** 0 = offered on any trip length. */
  minTripDays: number;
  accessMethod: DeliveryAccessMethod;
  radiusMiles?: number;
  subLocations?: { name: string; note?: string }[];
  parkingRate?: 'free' | 'hourly' | 'daily';
  enabled: boolean;
}

export interface Vehicle {
  _id: string;
  hostId: string;
  hostIsSuperhost?: boolean;
  fleetId?: string;
  make: string;
  model: string;
  year: number;
  bodyType: string;
  category: string;
  transmission: 'manual' | 'automatic';
  fuelType: 'petrol' | 'diesel' | 'hybrid' | 'ev';
  seats: number;
  /** How to find the car once you are at the pin. Access code reaches the
   *  guest only after they are on their way. */
  pickup?: { instructions?: string; spotPhotoUrl?: string; accessCode?: string };
  vin?: string;
  vinVerified: boolean;
  registrationNumber?: string;
  specs?: { doors?: number; color?: string; mileageKm?: number };
  features: string[];
  photos: VehiclePhoto[];
  addOns?: { code: string; label: string; priceType: 'per_trip' | 'per_day'; amount: number }[];
  tripRules?: string[];
  mileageLimit?: { perDayKm: number; overageFeePerKm: number };
  location: { coordinates: [number, number]; address: string; city: string };
  listing: {
    title: string;
    description: string;
    instantBook: boolean;
    minTripHours: number;
    maxTripHours: number;
    turnaroundDays?: number;
    advanceNoticeHours?: number;
    cancellationPolicy: 'flexible' | 'moderate' | 'strict';
    delivery?: {
      airport: boolean;
      home: boolean;
      hotel: boolean;
      business: boolean;
      radiusKm: number;
      fee: number;
    };
    deliveryLocations?: DeliveryLocation[];
  };
  pricing: {
    dailyPrice: number;
    currency: string;
    cleaningFee: number;
    weekendMultiplierBps?: number;
    weeklyDiscountBps?: number;
    monthlyDiscountBps?: number;
    earlyBirdBps?: number;
    lastMinuteBps?: number;
    dynamicPricing?: boolean;
    promoActive?: boolean;
    promoDiscountBps?: number;
    seasonalRules?: { label: string; start: string; end: string; multiplierBps: number }[];
  };
  status: string;
  verificationStatus: string;
  recallHold?: boolean;
  ratingAvg: number;
  ratingCount: number;
  totalTrips: number;
}

export type SortKey = 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'trending' | 'newest';

export interface SearchParams {
  lng: number;
  lat: number;
  radiusKm?: number;
  make?: string;
  bodyType?: string;
  category?: string;
  fuelType?: string;
  transmission?: string;
  seatsMin?: number;
  yearMin?: number;
  yearMax?: number;
  priceMin?: number;
  priceMax?: number;
  instantBook?: boolean;
  delivery?: boolean;
  ratingMin?: number;
  features?: string;
  start?: string;
  end?: string;
  sort?: SortKey;
  limit?: number;
}
