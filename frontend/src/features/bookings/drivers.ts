import { api } from '@/lib/api/client';

export type DriverStatus = 'invited' | 'verifying' | 'payment_failed' | 'approved' | 'declined' | 'removed' | 'expired';

export interface TripDriver {
  _id: string;
  name: string;
  email: string;
  status: DriverStatus;
  active: boolean;
  feeCents: number;
  currency: string;
  chargedAt?: string;
  refundedAt?: string;
  declineReasons?: string[];
  attempts: number;
}

export interface TripDrivers {
  enabled: boolean;
  feeCents: number;
  currency: string;
  addBy: string;
  canAdd: boolean;
  drivers: TripDriver[];
}

export interface DriverInvite {
  status: DriverStatus;
  name: string;
  guestFirstName: string;
  car: string;
  start: string;
  end: string;
  needs: string[];
  declineReasons?: string[];
  canRetry: boolean;
  yours?: boolean;
}

export const DRIVER_STATUS: Record<DriverStatus, { label: string; tone: 'warning' | 'default' | 'muted' | 'destructive' | 'success' }> = {
  invited: { label: 'Invite sent', tone: 'default' },
  verifying: { label: 'Checking license', tone: 'warning' },
  payment_failed: { label: 'Payment needed', tone: 'destructive' },
  approved: { label: 'Approved', tone: 'success' },
  declined: { label: 'Not approved', tone: 'destructive' },
  removed: { label: 'Removed', tone: 'muted' },
  expired: { label: 'Invite expired', tone: 'muted' },
};

export const driverApi = {
  list: (bookingId: string) => api.get<TripDrivers>(`/bookings/${bookingId}/drivers`),
  invite: (bookingId: string, body: { name: string; email: string; phone?: string }) => api.post<TripDriver>(`/bookings/${bookingId}/drivers`, body),
  resend: (bookingId: string, driverId: string) => api.post<TripDriver>(`/bookings/${bookingId}/drivers/${driverId}/resend`),
  pay: (bookingId: string, driverId: string) => api.post<TripDriver>(`/bookings/${bookingId}/drivers/${driverId}/pay`),
  remove: (bookingId: string, driverId: string) => api.raw<TripDriver>(`/bookings/${bookingId}/drivers/${driverId}`, { method: 'DELETE' }).then((r) => r.data),
  invitePreview: (token: string) => api.get<DriverInvite>(`/driver-invites/${token}`, undefined, 'optional'),
  accept: (token: string) => api.post<DriverInvite>(`/driver-invites/${token}/accept`),
  check: (token: string) => api.post<DriverInvite>(`/driver-invites/${token}/check`),
};
