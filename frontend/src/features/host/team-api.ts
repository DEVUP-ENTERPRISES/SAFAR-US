import { api } from '@/lib/api/client';

export type CaptainAbility =
  | 'trip:view'
  | 'trip:handover'
  | 'trip:message'
  | 'calendar:manage'
  | 'incident:report';

/** Plain-language labels — a host should never read a permission string. */
export const ABILITY_LABELS: Record<CaptainAbility, { label: string; detail: string }> = {
  'trip:view': { label: 'See trips', detail: 'Who has which car, and when it is due back' },
  'trip:handover': { label: 'Do handovers', detail: 'Check-in and checkout, odometer, fuel, photos' },
  'trip:message': { label: 'Message guests', detail: 'Reply in the chat for their cars' },
  'calendar:manage': { label: 'Block dates', detail: 'Take a car off the calendar for servicing' },
  'incident:report': { label: 'Report damage', detail: 'Raise damage and citations — cannot charge for them' },
};

export interface Captain {
  _id: string;
  hostId: string;
  userId?: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  abilities: CaptainAbility[];
  /** Empty means the entire fleet, including cars added later. */
  vehicleIds: string[];
  status: 'invited' | 'active' | 'suspended';
  invitedAt: string;
  acceptedAt?: string;
  lastActiveAt?: string;
}

export interface AssignableVehicle {
  _id: string;
  make: string;
  model: string;
  year: number;
  status: string;
  photos?: { url: string; isCover?: boolean }[];
}

export interface CaptainInput {
  name: string;
  email: string;
  phone?: string;
  title?: string;
  abilities?: CaptainAbility[];
  vehicleIds?: string[];
}

/** What the invitee sees before committing, keyed by the token alone. */
export interface InvitePreview {
  name: string;
  email: string;
  title?: string;
  fleetName: string;
  abilities: CaptainAbility[];
  vehicleCount: number;
  /** False when they already have a CatoDrive account to sign in with. */
  needsPassword: boolean;
}

export interface CaptainQueue {
  staff: Captain;
  fleetName: string;
  trips: {
    _id: string;
    bookingId: string;
    vehicleId: string;
    status: string;
    handover?: { at?: string };
    vehicle: { _id: string; make: string; model: string; year: number; licensePlate?: string } | null;
  }[];
}

export const teamApi = {
  list: () => api.get<Captain[]>('/hosts/staff'),
  assignableVehicles: () => api.get<AssignableVehicle[]>('/hosts/staff/assignable-vehicles'),
  invite: (body: CaptainInput) => api.post<Captain>('/hosts/staff', body),
  update: (id: string, body: Partial<CaptainInput>) => api.patch<Captain>(`/hosts/staff/${id}`, body),
  setStatus: (id: string, status: 'active' | 'suspended') =>
    api.post<Captain>(`/hosts/staff/${id}/status`, { status }),
  remove: (id: string) => api.delete<{ removed: boolean }>(`/hosts/staff/${id}`),
  resendInvite: (id: string) => api.post<Captain>(`/hosts/staff/${id}/resend-invite`, {}),
};

/** The Captain's own side: claiming an invite, and the jobs that follow. */
export const captainApi = {
  invitePreview: (token: string) => api.get<InvitePreview>(`/hosts/staff/invite/${token}`),
  accept: (token: string, password?: string) =>
    api.post<{ user: { id: string; email?: string; roles: string[] }; tokens: { accessToken: string; refreshToken: string } }>(
      '/hosts/staff/accept',
      { token, password },
    ),
  queue: () => api.get<CaptainQueue | null>('/hosts/staff/me/queue'),
};
