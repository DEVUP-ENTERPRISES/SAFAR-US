import { api } from '@/lib/api/client';

export interface DamageFinding {
  area: string;
  type: 'scratch' | 'dent' | 'crack' | 'chip' | 'stain' | 'missing_part' | 'tyre' | 'other';
  description: string;
  checkinPhotoIndexes: number[];
  checkoutPhotoIndexes: number[];
  confidence: number;
  note?: string;
}

export interface DamageAssessment {
  _id: string;
  tripId: string;
  bookingId: string;
  findings: DamageFinding[];
  overallNote?: string;
  photosCompared: { pre: number; post: number };
  verdict: 'no_new_damage' | 'damage_found';
  /** Something was seen, but nothing confidently — a person should look. */
  needsHuman: boolean;
  model: string;
  reviewedAt: string;
}

export interface CaseFile {
  summary: string;
  timeline: { at: string; what: string }[];
  established: string[];
  disputed: string[];
  openQuestions: { question: string; askWho: 'guest' | 'host' | 'either' }[];
  evidenceGaps: string[];
}

export interface AiUsage {
  windowDays: number;
  spentTodayCents: number;
  byFeature: {
    _id: string;
    calls: number;
    failures: number;
    costCents: number;
    avgLatencyMs: number;
  }[];
}

export const aiApi = {
  /** Whether to render AI surfaces at all — no key means hide, not error. */
  status: () => api.get<{ enabled: boolean }>('/ai/status', undefined, false),
  damageReview: (tripId: string) =>
    api.get<DamageAssessment | null>(`/ai/trips/${tripId}/damage-review`),
  runDamageReview: (tripId: string) =>
    api.post<DamageAssessment>(`/ai/trips/${tripId}/damage-review`, {}),
  caseFile: (claimId: string) =>
    api.get<{ file: CaseFile; facts: unknown }>(`/ai/claims/${claimId}/case-file`),
  usage: (days = 7) => api.get<AiUsage>('/ai/usage', { days }),
};

// ── Handover navigation ──────────────────────────────────────────────

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface HandoverStatus {
  tripId: string;
  destination: { lat: number; lng: number; label?: string };
  route?: {
    distanceMeters: number;
    durationSeconds: number;
    durationInTrafficSeconds: number;
    polyline?: string;
    steps: RouteStep[];
    provider: string;
  };
  guestEtaAt?: string;
  hostLeaveBy?: string;
  scheduledAt?: string;
  hostShouldLeaveNow: boolean;
  awaitingLocation: boolean;
}

export const handoverApi = {
  status: (tripId: string, pos?: { lat: number; lng: number }) =>
    api.get<HandoverStatus>(`/trips/${tripId}/handover`, pos ? { lat: pos.lat, lng: pos.lng } : undefined),
  /** Guest's device reporting position, so the host's countdown tracks it. */
  reportLocation: (tripId: string, pos: { lat: number; lng: number }) =>
    api.post<{ updated: boolean }>(`/trips/${tripId}/location`, pos),
};
