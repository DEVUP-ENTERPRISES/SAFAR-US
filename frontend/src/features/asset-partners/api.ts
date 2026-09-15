import { api } from '@/lib/api/client';

export interface AssetPartnerVehicle {
  year: string;
  make: string;
  model: string;
  trim?: string;
  mileage: number;
  exteriorColor?: string;
  interiorColor?: string;
  vin: string;
  plate: string;
}

export interface CreateAssetPartnerApplicationInput {
  fullName: string;
  businessName?: string;
  partnerType: 'individual' | 'business' | 'fleet';
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  referral?: string;
  vehicle: AssetPartnerVehicle;
  ownership: 'owned' | 'financed' | 'leased';
  lienholder?: string;
  lienAccountLast4?: string;
  estimatedMarketValue?: string;
  accident: 'yes' | 'no';
  accidentDetail?: string;
  smokeFree: 'yes' | 'no';
  petFree: 'yes' | 'no';
  hasMaintenanceRecords?: 'yes' | 'no';
  photos?: { url: string; key?: string; label?: string }[];
  insurance: {
    carrier: string;
    policyNumber: string;
    coverageType: 'full' | 'liability' | 'unsure';
    policyExpiry?: string;
  };
  availability: 'fulltime' | 'parttime' | 'seasonal';
  preferredZone?: string;
  targetStartDate?: string;
  notes?: string;
  acknowledgedAccurate: boolean;
  acknowledgedInspection: boolean;
  acknowledgedTerms: boolean;
  signature: string;
  signDate: string;
}

export type ApplicationStatus = 'submitted' | 'under_review' | 'approved' | 'rejected';

export interface PartnerApplication {
  _id: string;
  reference: string;
  status: ApplicationStatus;
  fullName: string;
  businessName?: string;
  email: string;
  vehicle: AssetPartnerVehicle;
  availability: 'fulltime' | 'parttime' | 'seasonal';
  preferredZone?: string;
  targetStartDate?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewNotes?: string;
  hostVerified?: boolean;
}

export interface PartnerVehicleSummary {
  _id: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  status: string;
  photo?: string;
  trips: number;
  /** Host earnings from this vehicle, in minor units. */
  revenue: number;
}

export interface PartnerDashboard {
  applications: PartnerApplication[];
  partner: { approved: boolean; hostId?: string; hostVerified: boolean };
  /** Absent until a host account exists — nothing could have been earned yet. */
  earnings?: {
    currency: string;
    lifetimeEarnings: number;
    currentBalance: number;
    paidOut: number;
    pendingPayout: number;
    completedTrips: number;
    monthly: { month: string; amount: number }[];
  };
  vehicles: PartnerVehicleSummary[];
  nextPayout?: { amount: number; currency: string; scheduledFor: string };
}

export const assetPartnerApi = {
  apply: (input: CreateAssetPartnerApplicationInput) =>
    api.post<{ reference: string; status: string }>('/asset-partner-applications', input),
  dashboard: () => api.get<PartnerDashboard>('/asset-partners/dashboard'),
};
