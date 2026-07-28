export interface VehiclePhoto {
  url: string;
  key?: string;
  isCover?: boolean;
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
