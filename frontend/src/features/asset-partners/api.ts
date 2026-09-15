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

export const assetPartnerApi = {
  apply: (input: CreateAssetPartnerApplicationInput) =>
    api.post<{ reference: string; status: string }>('/asset-partner-applications', input),
};
