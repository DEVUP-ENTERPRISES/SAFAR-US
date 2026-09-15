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
  /** Gross booking revenue this car produced this month, in minor units. */
  gross: number;
  /** Partner net for this car this month — gross less fee, insurance, detailing. */
  net: number;
}

export type PartnerStatus = 'onboarding' | 'active' | 'suspended' | 'exited';

/** The terms actually in force for this partner. */
export interface ResolvedPartnerTerms {
  managementFeeBps: number;
  insuranceMonthlyCents: number;
  detailingMonthlyCents: number;
  deductibleCapCents: number;
  maintenanceApprovalCents: number;
  payoutDayOfMonth: number;
  payoutMethod: 'check' | 'zelle';
  /** True when something was negotiated away from the platform default. */
  negotiated: boolean;
}

export interface StatementLine {
  vehicleId: string;
  label: string;
  trips: number;
  gross: number;
  managementFee: number;
  insurance: number;
  detailing: number;
  net: number;
}

/**
 * One month on partner terms. NOT host earnings — the management fee is only
 * one of three deductions, and the other two are recurring monthly costs per
 * vehicle.
 */
export interface PartnerStatement {
  /** 'YYYY-MM' — the month trips completed in. */
  period: string;
  currency: string;
  terms: ResolvedPartnerTerms;
  lines: StatementLine[];
  totals: {
    trips: number;
    gross: number;
    managementFee: number;
    insurance: number;
    detailing: number;
    net: number;
  };
  payoutDate: string;
  payoutMethod: string;
  /** False while the month is still running — figures can still move. */
  final: boolean;
}

export interface PartnerDashboard {
  applications: PartnerApplication[];
  /** Programme membership. Absent until an application is approved. */
  partner?: {
    _id: string;
    status: PartnerStatus;
    partnerType: 'individual' | 'business' | 'fleet';
    displayName: string;
    approvedAt?: string;
    activatedAt?: string;
  };
  /** This month so far, on partner terms. Absent until in the programme. */
  currentStatement?: PartnerStatement;
  /** Recent months, newest first. */
  history?: PartnerStatement[];
  vehicles: PartnerVehicleSummary[];
}

export const assetPartnerApi = {
  apply: (input: CreateAssetPartnerApplicationInput) =>
    api.post<{ reference: string; status: string }>('/asset-partner-applications', input),
  dashboard: () => api.get<PartnerDashboard>('/asset-partners/dashboard'),
};
