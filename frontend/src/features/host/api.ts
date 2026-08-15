import { api } from '@/lib/api/client';

export interface HostProfile {
  _id: string;
  userId: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  avatarKey?: string;
  languages?: string[];
  city?: string;
  work?: string;
  hostType: 'individual' | 'business';
  isFleetOwner: boolean;
  businessProfile?: Record<string, string | undefined>;
  taxInfo?: Record<string, unknown>;
  bankingDetails?: Record<string, unknown>;
  verificationStatus: string;
  isSuperhost?: boolean;
  ratingAvg: number;
  totalTrips: number;
}

/** The public view of a host — every figure computed from real activity. */
export interface HostPublicProfile {
  _id: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  city: string | null;
  work: string | null;
  languages: string[];
  joinedAt: string;
  isSuperhost: boolean;
  ratingAvg: number | null;
  ratingCount: number;
  totalTrips: number;
  listedVehicles: number;
  responseRatePct: number | null;
  responseTimeMinutes: number | null;
  /** Share of finished trips this host cancelled. Null until enough history. */
  cancellationRatePct: number | null;
  verifications: { email: boolean; phone: boolean; identity: boolean };
}

export interface EarningsDashboard {
  currency: string;
  lifetimeEarnings: number;
  currentBalance: number;
  paidOut: number;
  pendingPayout: number;
  completedTrips: number;
  monthly: { month: string; amount: number }[];
}

export interface Payout {
  _id: string;
  amount: number;
  currency: string;
  status: 'scheduled' | 'paid' | 'failed';
  instant?: boolean;
  scheduledFor: string;
  paidAt?: string;
  createdAt: string;
}

export interface InstantPayoutResult {
  paidCount: number;
  gross: number;
  fee: number;
  net: number;
}

/** Must match the backend's storage.gateway UploadCategory exactly. */
export type UploadCategory =
  | 'vehicle_photo'
  | 'trip_photo'
  | 'avatar'
  | 'registration'
  | 'insurance'
  | 'kyc'
  | 'claim';

export interface UploadTarget {
  key: string;
  uploadUrl: string;
  publicUrl: string;
}

export interface Fleet {
  _id: string;
  name: string;
  region?: string;
  group?: string;
}

export interface FleetDashboard {
  fleetId: string;
  name: string;
  totalVehicles: number;
  listedVehicles: number;
  totalTrips: number;
  avgRating: number;
  occupancyPct: number;
  revenue: number;
}

export interface VehiclePnl {
  vehicleId: string;
  label: string;
  trips: number;
  grossRevenue: number;
  commission: number;
  hostEarnings: number;
  maintenanceCost: number;
  netProfit: number;
}

export interface FleetProfitability {
  fleetId: string;
  name: string;
  currency: string;
  totals: {
    grossRevenue: number;
    commission: number;
    hostEarnings: number;
    maintenanceCost: number;
    netProfit: number;
    marginBps: number;
  };
  vehicles: VehiclePnl[];
}

export interface MaintenanceRecord {
  _id: string;
  vehicleId: string;
  type: string;
  scheduledFor: string;
  status: string;
  notes?: string;
}

export interface HostPerformance {
  currency: string;
  earningsByMonth: { month: string; amount: number }[];
  perVehicle: { vehicleId: string; label: string; trips: number; revenue: number }[];
  occupancyPct: number;
  acceptanceRate: number;
  completedTrips: number;
  cancelledByHost: number;
}

export const hostApi = {
  me: () => api.get<HostProfile>('/hosts/me'),
  onboard: (displayName: string, bio?: string) => api.post<HostProfile>('/hosts/onboard', { displayName, bio }),
  updateProfile: (patch: Partial<HostProfile>) => api.patch<HostProfile>('/hosts/me', patch),
  /** Public profile of any host — no auth, shoppers browse before signing up. */
  publicProfile: (hostId: string) =>
    api.get<HostPublicProfile>(`/hosts/${hostId}/public`, undefined, false),

  performance: () => api.get<HostPerformance>('/earnings/performance'),
  earnings: () => api.get<EarningsDashboard>('/earnings/dashboard'),

  payouts: () => api.get<Payout[]>('/payouts/me'),
  /** Whether this host can actually get paid, and what is blocking it. */
  payoutReadiness: () => api.get<PayoutReadiness>('/payouts/readiness'),
  instantPayout: () => api.post<InstantPayoutResult>('/payouts/instant'),

  uploadUrls: (category: UploadCategory, count = 1, contentType = 'image/jpeg') =>
    api.post<UploadTarget[]>('/media/upload-urls', { category, count, contentType }),

  fleets: () => api.get<Fleet[]>('/fleets'),
  createFleet: (name: string, region?: string) => api.post<Fleet>('/fleets', { name, region }),
  fleetDashboard: (id: string) => api.get<FleetDashboard>(`/fleets/${id}/dashboard`),
  fleetProfitability: (id: string) => api.get<FleetProfitability>(`/fleets/${id}/profitability`),
  assignToFleet: (fleetId: string, vehicleId: string) =>
    api.post<{ assigned: boolean }>(`/fleets/${fleetId}/vehicles`, { vehicleId }),

  maintenance: (vehicleId?: string) =>
    api.get<MaintenanceRecord[]>('/maintenance', vehicleId ? { vehicleId } : undefined),
  scheduleMaintenance: (input: {
    vehicleId: string;
    type: string;
    scheduledFor: string;
    notes?: string;
  }) => api.post<MaintenanceRecord>('/maintenance', input),
  /** Everything waiting on the host, ordered by what ignoring it costs. */
  inboxActions: () => api.get<HostInbox>('/hosts/inbox/actions'),
};

export interface HostActionItem {
  kind: 'approval' | 'message' | 'document' | 'return_due';
  id: string;
  title: string;
  detail: string;
  dueAt: string | null;
  /** Money lost if this lapses, in minor units. Null when it isn't money. */
  atRisk: number | null;
  href: string;
}

export interface HostInbox {
  items: HostActionItem[];
  atRiskTotal: number;
}

export interface PayoutBlocker {
  key: 'bank_details' | 'identity' | 'insurance';
  label: string;
  detail: string;
  href: string;
  severity: 'blocking' | 'warning';
}

export interface PayoutReadiness {
  ready: boolean;
  blockers: PayoutBlocker[];
  balance: { pending: number; scheduled: number; paidLifetime: number; currency: string };
  nextPayoutAt: string | null;
  destination: {
    configured: boolean;
    verified: boolean;
    viaStripe: boolean;
    accountHolder?: string;
    bankName?: string;
    last4?: string;
  };
}
