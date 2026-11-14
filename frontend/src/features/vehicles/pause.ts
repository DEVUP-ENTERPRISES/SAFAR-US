import { api } from '@/lib/api/client';

export type PauseStatus = 'pending' | 'scheduled' | 'active' | 'ended' | 'declined' | 'cancelled';

export interface CarPause {
  _id: string;
  vehicleId: string;
  source: 'ops' | 'partner';
  status: PauseStatus;
  reason: string;
  fromDay: string;
  backOnDay?: string;
  startsAt: string;
  endsAt?: string;
  declineReason?: string;
  endNote?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface CarPauseRow extends CarPause {
  vehicleLabel: string;
  plate?: string;
  partnerName?: string;
  tripsInWindow: number;
}

/** A calendar date (YYYY-MM-DD) as "Dec 20, 2026", without shifting it across time zones. */
export const pauseDay = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export const PAUSE_STATUS: Record<PauseStatus, { label: string; tone: 'warning' | 'default' | 'muted' | 'destructive' | 'success' }> = {
  pending: { label: 'Waiting for review', tone: 'warning' },
  scheduled: { label: 'Approved', tone: 'default' },
  active: { label: 'Paused', tone: 'warning' },
  ended: { label: 'Back live', tone: 'success' },
  declined: { label: 'Declined', tone: 'destructive' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

/** "Dec 20 to Dec 27, 2026" style span: first day off and the day the car is back. */
export const pauseSpan = (p: Pick<CarPause, 'fromDay' | 'backOnDay'>) => (p.backOnDay ? `${pauseDay(p.fromDay)} to ${pauseDay(p.backOnDay)}` : `From ${pauseDay(p.fromDay)}, no end date`);

/** Today's date in the browser as YYYY-MM-DD, for date-picker minimums. */
export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Pausing a car the signed-in host account runs (the operations panel). */
export const carPauseApi = {
  latest: (vehicleId: string) => api.get<CarPause | null>(`/vehicles/${vehicleId}/pause`),
  pauseNow: (vehicleId: string, body: { reason: string; backOnDay?: string }) => api.post<CarPause>(`/vehicles/${vehicleId}/pause`, body),
  resume: (vehicleId: string) => api.post(`/vehicles/${vehicleId}/resume`),
  requests: (q: { status?: 'pending' | 'open' | 'closed'; limit?: number } = {}) => api.get<CarPauseRow[]>('/ioc/car-pauses', q),
  approve: (id: string) => api.post<CarPause>(`/ioc/car-pauses/${id}/approve`),
  decline: (id: string, reason: string) => api.post<CarPause>(`/ioc/car-pauses/${id}/decline`, { reason }),
};

/** An Asset Partner asking for their own car to be paused. */
export const partnerPauseApi = {
  latest: (vehicleId: string) => api.get<CarPause | null>(`/asset-partners/vehicles/${vehicleId}/pause`),
  request: (vehicleId: string, body: { reason: string; fromDay: string; backOnDay: string }) => api.post<CarPause>(`/asset-partners/vehicles/${vehicleId}/pause`, body),
  cancel: (pauseId: string) => api.post<CarPause>(`/asset-partners/pauses/${pauseId}/cancel`),
};
