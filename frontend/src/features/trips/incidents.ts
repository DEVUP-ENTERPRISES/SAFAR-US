import { api } from '@/lib/api/client';

export type IncidentType = 'accident' | 'breakdown' | 'medical' | 'theft' | 'unsafe';

/** What a guest can report mid-trip, in their words. */
export const INCIDENT_TYPES: { key: IncidentType; label: string; detail: string }[] = [
  { key: 'accident', label: 'Accident', detail: 'A collision, however minor' },
  { key: 'breakdown', label: 'Breakdown', detail: 'The car will not drive' },
  { key: 'medical', label: 'Medical', detail: 'Someone needs help' },
  { key: 'theft', label: 'Theft', detail: 'The car or belongings are gone' },
  { key: 'unsafe', label: 'Feeling unsafe', detail: 'Something is not right' },
];

/** Reporting pauses the trip and alerts the host and support. */
export const reportIncident = (tripId: string, type: IncidentType, note?: string) => api.post(`/trips/${tripId}/incident`, { type, note: note?.trim() || undefined });
