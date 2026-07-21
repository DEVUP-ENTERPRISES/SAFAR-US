import { api } from '@/lib/api/client';

export interface AdminMetrics {
  users: { total: number; active: number; suspended: number; newThisWeek: number };
  hosts: { total: number; pending: number; verified: number };
  vehicles: { total: number; listed: number; pendingVerification: number };
  bookings: { total: number; byStatus: { status: string; count: number }[]; gmv: number };
  claims: { open: number };
  tickets: { open: number };
  revenue: { platform: number; currency: string };
}

type Q = Record<string, string | number | boolean | undefined>;

export interface AdminNavItem {
  slug: string;
  path: string;
  apiPath: string;
  label: string;
  group: string;
  permission: string;
}

/** The flag key is the document `_id` — the backend has no separate `key` field. */
export interface FeatureFlag {
  _id: string;
  description?: string;
  enabled: boolean;
  rollout?: { percentage?: number; allowUserIds?: string[]; allowRoles?: string[] };
  updatedBy?: string;
  updatedAt?: string;
}

// ── Platform economics & commission ──────────────────────────────────
export interface PlatformConfig {
  commission: { defaultBps: number; minBps: number; maxBps: number };
  tax: { bps: number };
  payout: { holdHours: number; instantFeeBps: number; instantFeeMinCents: number };
  rewards: { pointValueCents: number; pointsPerDollar: number };
  referral: { referrerCreditCents: number; refereeCreditCents: number };
  protection: { code: string; label: string; description: string; pricePerDay: number }[];
  support: { slaHours: { urgent: number; high: number; normal: number; low: number } };
  surge: {
    enabled: boolean;
    autoEnabled: boolean;
    maxMultiplierBps: number;
    occupancyThresholds: { occupancyPct: number; multiplierBps: number }[];
  };
  updatedBy?: string;
  updatedAt?: string;
}

export type CommissionScope = 'global' | 'category' | 'hostTier' | 'host';

export interface CommissionRule {
  _id: string;
  name: string;
  scope: CommissionScope;
  scopeValue?: string;
  commissionBps: number;
  priority: number;
  active: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  createdAt: string;
}

export interface ResolvedCommission {
  bps: number;
  source: string;
  ruleId?: string;
}

export type SurgeScope = 'global' | 'city' | 'category' | 'cityCategory';
export interface SurgeRule {
  _id: string; name: string; scope: SurgeScope; city?: string; category?: string;
  multiplierBps: number; daysOfWeek: number[]; priority: number; active: boolean;
  effectiveFrom?: string; effectiveTo?: string; createdAt: string;
}
export interface Occupancy {
  city: string; occupancyPct: number | null; multiplierBps: number; source: string;
}
export interface SubscriptionPlan {
  _id: string; code: string; name: string; description: string; priceCents: number; active: boolean;
  benefits: { bookingDiscountBps: number; waiveSurge: boolean; freeProtectionCode?: string; rewardsMultiplierBps: number };
}
export interface SubscriptionStat { planCode: string; members: number; mrrCents: number }
export interface SlaStats {
  open: number; breached: number; atRisk: number; onTrack: number;
  breachedTickets: { _id: string; subject: string; priority: string; slaDueAt: string; overdueHours: number }[];
}

export interface FinanceReport {
  currency: string;
  revenueByMonth: { month: string; amount: number }[];
  gmvByMonth: { month: string; amount: number }[];
  revenueMix: { label: string; value: number }[];
  totals: {
    gmv: number; platformRevenue: number; hostEarnings: number; tax: number;
    protection: number; delivery: number; payoutsOwed: number; payoutsPaid: number;
  };
}

export interface AdminAnalytics {
  days: number;
  currency: string;
  series: { day: string; bookings: number; gmv: number }[];
  signups: { day: string; signups: number }[];
  cities: { key: string; trips: number; gmv: number }[];
  categories: { key: string; trips: number; gmv: number }[];
  byStatus: { status: string; count: number }[];
  totals: {
    bookings: number; gmv: number; signups: number; aov: number;
    completionRate: number; cancellationRate: number;
  };
}

// ── Cross-tenant management ──────────────────────────────────────────
export interface AdminFleet {
  _id: string; name: string; region: string | null;
  hostId: string; hostName: string; vehicles: number; createdAt: string;
}
export interface AdminOrg {
  _id: string; name: string; billingEmail: string; domain: string | null;
  status: 'active' | 'suspended'; members: number; trips: number;
  totalSpend: number; createdAt: string;
}
export interface AdminReview {
  _id: string; direction: string; rating: number; comment: string;
  status: 'published' | 'hidden'; authorId: string; subjectId: string; createdAt: string;
}
export interface AdminPayouts {
  rows: {
    _id: string; hostId: string; hostName: string; amount: number; currency: string;
    status: string; instant: boolean; scheduledFor: string; paidAt: string | null;
  }[];
  totals: { scheduled: number; paid: number };
}

export const adminApi = {
  nav: () => api.get<AdminNavItem[]>('/admin/nav'),
  metrics: () => api.get<AdminMetrics>('/admin/metrics'),

  users: (q: Q = {}) => api.get<any[]>('/admin/users', q),
  user: (id: string) => api.get<any>(`/admin/users/${id}`),
  setUserStatus: (id: string, status: string) => api.post(`/admin/users/${id}/status`, { status }),

  hosts: (q: Q = {}) => api.get<any[]>('/admin/hosts', q),
  setHostVerification: (id: string, status: string) =>
    api.post(`/admin/hosts/${id}/verification`, { status }),

  vehicles: (q: Q = {}) => api.get<any[]>('/admin/vehicles', q),
  vehicleAction: (id: string, action: 'approve' | 'suspend' | 'reject') =>
    api.post(`/admin/vehicles/${id}/action`, { action }),

  bookings: (q: Q = {}) => api.get<any[]>('/admin/bookings', q),
  cancelBooking: (id: string, reason: string) => api.post(`/admin/bookings/${id}/cancel`, { reason }),

  claims: (q: Q = {}) => api.get<any[]>('/admin/claims', q),
  assignClaim: (id: string) => api.post(`/admin/claims/${id}/assign`),
  resolveClaim: (id: string, decision: string, note?: string) =>
    api.post(`/admin/claims/${id}/resolve`, { decision, note }),

  tickets: (q: Q = {}) => api.get<any[]>('/admin/tickets', q),
  ticket: (id: string) => api.get<any>(`/admin/tickets/${id}`),
  replyTicket: (id: string, body: string, internal = false) =>
    api.post(`/admin/tickets/${id}/reply`, { body, internal }),
  escalateTicket: (id: string) => api.post(`/admin/tickets/${id}/escalate`),
  resolveTicket: (id: string) => api.post(`/admin/tickets/${id}/resolve`),

  analytics: (days = 30) => api.get<AdminAnalytics>('/admin/analytics', { days }),

  // NOTE: the flag's `_id` IS its key (see feature-flag.model.ts) — there is no
  // separate `key` field. Typing it stops us reading `f.key` and rendering undefined.

  // Platform economics — every rate the business runs on, tunable live.
  config: () => api.get<PlatformConfig>('/admin/config'),
  saveConfig: (patch: Partial<PlatformConfig>) =>
    api.raw<PlatformConfig>('/admin/config', { method: 'PUT', body: patch }).then((r) => r.data),

  // Commission rule engine.
  commissionRules: () => api.get<CommissionRule[]>('/admin/commission-rules'),
  createCommissionRule: (body: Partial<CommissionRule>) =>
    api.post<CommissionRule>('/admin/commission-rules', body),
  updateCommissionRule: (id: string, body: Partial<CommissionRule>) =>
    api.raw<CommissionRule>(`/admin/commission-rules/${id}`, { method: 'PUT', body }).then((r) => r.data),
  deleteCommissionRule: (id: string) =>
    api.raw(`/admin/commission-rules/${id}`, { method: 'DELETE' }).then((r) => r.data),
  previewCommission: (q: { hostId?: string; category?: string; hostTier?: string }) =>
    api.get<ResolvedCommission>('/admin/commission-rules/preview', q),


  // Surge
  surgeRules: () => api.get<SurgeRule[]>('/admin/surge-rules'),
  createSurgeRule: (b: Partial<SurgeRule>) => api.post<SurgeRule>('/admin/surge-rules', b),
  updateSurgeRule: (id: string, b: Partial<SurgeRule>) =>
    api.raw<SurgeRule>(`/admin/surge-rules/${id}`, { method: 'PUT', body: b }).then((r) => r.data),
  deleteSurgeRule: (id: string) =>
    api.raw(`/admin/surge-rules/${id}`, { method: 'DELETE' }).then((r) => r.data),
  occupancy: (city: string) => api.get<Occupancy>('/admin/surge/occupancy', { city }),

  // Memberships
  subscriptionPlans: () => api.get<SubscriptionPlan[]>('/admin/subscription-plans'),
  saveSubscriptionPlan: (code: string, b: Partial<SubscriptionPlan>) =>
    api.raw<SubscriptionPlan>(`/admin/subscription-plans/${code}`, { method: 'PUT', body: b }).then((r) => r.data),
  deleteSubscriptionPlan: (code: string) =>
    api.raw(`/admin/subscription-plans/${code}`, { method: 'DELETE' }).then((r) => r.data),
  subscriptionStats: () => api.get<SubscriptionStat[]>('/admin/subscription-stats'),

  // Support SLA
  slaStats: () => api.get<SlaStats>('/admin/tickets/sla'),

  // Claims settlement (real money)
  settleClaim: (id: string, b: { amountApproved: number; note: string; liableUserId?: string; penaltyCents?: number; warning?: boolean }) =>
    api.post(`/admin/claims/${id}/settle`, b),

  finance: (months = 6) => api.get<FinanceReport>('/admin/finance', { months }),


  // Fleets
  fleets: (search?: string) => api.get<AdminFleet[]>('/admin/fleets', search ? { search } : undefined),

  // Corporate accounts
  orgs: (status?: string) => api.get<AdminOrg[]>('/admin/corporate/orgs', status ? { status } : undefined),
  setOrgStatus: (id: string, status: 'active' | 'suspended') =>
    api.post(`/admin/corporate/orgs/${id}/status`, { status }),

  // Reviews moderation
  reviews: (q: { status?: string; minRating?: number } = {}) => api.get<AdminReview[]>('/admin/reviews', q),
  setReviewStatus: (id: string, status: 'published' | 'hidden') =>
    api.post(`/admin/reviews/${id}/status`, { status }),

  // Payouts
  payoutQueue: (status?: string) => api.get<AdminPayouts>('/admin/payouts', status ? { status } : undefined),
  runDuePayouts: () => api.post<{ hosts: number; paid: number; amount: number }>('/admin/payouts/run-due'),

  featureFlags: () => api.get<FeatureFlag[]>('/admin/feature-flags'),
  saveFlag: (key: string, body: { enabled?: boolean; description?: string; rollout?: { percentage?: number } }) =>
    api.raw<FeatureFlag>(`/admin/feature-flags/${key}`, { method: 'PUT', body }).then((r) => r.data),

  auditLogs: (q: Q = {}) => api.get<any[]>('/admin/audit-logs', q),

  kyc: (q: Q = {}) => api.get<any[]>('/admin/kyc', q),
  reviewKyc: (id: string, decision: 'approved' | 'rejected', reason?: string) =>
    api.post(`/admin/kyc/${id}/review`, { decision, reason }),
};
