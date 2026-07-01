import { api } from '@/lib/api/client';

export interface HostProfile {
  _id: string;
  userId: string;
  displayName: string;
  bio?: string;
  hostType: 'individual' | 'business';
  isFleetOwner: boolean;
  businessProfile?: Record<string, string | undefined>;
  taxInfo?: Record<string, unknown>;
  bankingDetails?: Record<string, unknown>;
  verificationStatus: string;
  ratingAvg: number;
  totalTrips: number;
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

export interface MaintenanceRecord {
  _id: string;
  vehicleId: string;
  type: string;
  scheduledFor: string;
  status: string;
  notes?: string;
}

export const hostApi = {
  me: () => api.get<HostProfile>('/hosts/me'),
  onboard: (displayName: string, bio?: string) => api.post<HostProfile>('/hosts/onboard', { displayName, bio }),
  updateProfile: (patch: Partial<HostProfile>) => api.patch<HostProfile>('/hosts/me', patch),

  earnings: () => api.get<EarningsDashboard>('/earnings/dashboard'),

  uploadUrls: (category: string, count = 1) =>
    api.post<UploadTarget[]>('/media/upload-urls', { category, count, contentType: 'image/jpeg' }),

  fleets: () => api.get<Fleet[]>('/fleets'),
  createFleet: (name: string, region?: string) => api.post<Fleet>('/fleets', { name, region }),
  fleetDashboard: (id: string) => api.get<FleetDashboard>(`/fleets/${id}/dashboard`),
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
};
