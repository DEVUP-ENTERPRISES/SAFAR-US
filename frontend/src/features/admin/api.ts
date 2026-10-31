import { api } from '@/lib/api/client';
import type { Insurer, InsurerPayout, InsurerPlan, InsurerSummary } from '@/features/insurers/api';
import type { Booking } from '@/features/bookings/types';

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

/** The flag key is the document `_id` - the backend has no separate `key` field. */
export interface FeatureFlag {
  _id: string;
  description?: string;
  enabled: boolean;
  rollout?: { percentage?: number; allowUserIds?: string[]; allowRoles?: string[] };
  updatedBy?: string;
  updatedAt?: string;
}

// ── Platform economics & commission ──────────────────────────────────
/** A mobile app's update rules: below minVersion the app blocks, below latestVersion it suggests updating. */
export interface AppRelease {
  minVersion: string;
  latestVersion: string;
  androidUrl: string;
  iosUrl: string;
}

export interface PlatformConfig {
  commission: { defaultBps: number; minBps: number; maxBps: number };
  /** Charged to the guest on top; commission comes out of host earnings. */
  serviceFee: { bps: number; maxCents: number; flatCents: number };
  programs?: { rewardsEnabled: boolean; referralEnabled: boolean; membershipEnabled?: boolean };
  appRelease?: Record<'customer' | 'partner', AppRelease>;
  tax: { bps: number };
  /**
   * The Asset Partner agreement's figures. Separate from commission on
   * purpose: a partner is paid monthly on gross − management fee − insurance
   * − detailing, which no commission rate can express.
   */
  assetPartner: {
    managementFeeBps: number;
    insuranceMonthlyCents: number;
    detailingMonthlyCents: number;
    deductibleCapCents: number;
    maintenanceApprovalCents: number;
    payoutDayOfMonth: number;
    payoutMethod: 'check' | 'zelle';
    intakeObjectionDays?: number;
    /** Who signs partner agreements for CatoDrive; printed on every sealed document. */
    countersignerName?: string;
    countersignerTitle?: string;
    countersignerOrganisation?: string;
    agreementValidDays?: number;
    agreementReminderDays?: number;
    requireIdentity?: boolean;
    reapplyAfterDays?: number;
    exitNoticeDays?: number;
    unresponsiveAfterDays?: number;
    returnPhotoMin?: number;
    exitSeparateApprover?: boolean;
  };
  payout: { holdHours: number; instantFeeBps: number; instantFeeMinCents: number };
  /** Post-trip charges: the combined ceiling per booking (bps of the booking total) and the guest's dispute window. */
  incidentals: { maxTotalBps: number; disputeWindowHours: number; maxFuelPercent: number; maxLateHours: number; lateReturnPerHourCents?: number; lateHourlyMaxHours?: number; lateHalfDayMaxHours?: number };
  tolls: {
    enabled: boolean; feeCents: number; reviewHours: number; matchBufferMinutes: number; billingWindowDays: number; autoCharge: boolean;
    passEnabled: boolean; passPriceCents: number; passDailyCapCents: number;
  };
  identityViewing?: { hostMinutesBefore: number; hostViewSeconds: number; adminViewSeconds: number };
  tripDocuments?: { enabled: boolean; viewSeconds: number; alertHost: boolean; alertCooldownMinutes: number };
  /** Handover and return timing: when live location opens, and how long past the return time before a trip counts as overdue. */
  tracking: { approachWindowMinutes: number; overdueGraceMinutes: number; returnReminderMinutes?: number[]; nextBookingAlertHours?: number };
  inspection: {
    preWindowMinutes: number;
    postWindowMinutes: number;
    minPrePhotos: number;
    minReturnPhotos: number;
    maxPhotosPerPhase: number;
    requireLocation: boolean;
    maxDistanceMeters: number;
  };
  security: { cardAttemptsPerHour: number; loginAttemptsPerAccount: number; loginLockoutMinutes: number; maxUploadMb: number; uploadUrlsPerHour: number; refreshRetryLeewaySeconds: number; smsAllowedPrefixes?: string[] };
  handover: {
    hostInspectionRequired: boolean;
    pickupCodeRequired: boolean;
    maxCodeAttempts: number;
    hostOnlyStart: boolean;
    baselineRequiredForCharges: boolean;
    returnConfirmHours: number;
  };
  extension: {
    enabled: boolean;
    maxDays: number;
    swapPolicy: 'auto' | 'off';
    swapPriceToleranceBps: number;
    swapMaxAbsorbCents: number;
    lateExtendHours?: number;
  };
  /** What a guest can do instead of a plain cancellation, and the guard rails on each option. */
  tripChanges?: {
    undoWindowMinutes: number;
    undoMinLeadHours: number;
    undoPer30Days: number;
    pickupShiftMaxHours: number;
    pickupShiftsPerTrip: number;
    freeMovesPerTrip: number;
    moveMinLeadHours: number;
    switchCarEnabled: boolean;
    creditBonusBps: number;
    creditEnabled: boolean;
    exceptionsEnabled: boolean;
    exceptionProofRequired: boolean;
    exceptionFileWindowHours: number;
    exceptionFlagAfter: number;
  };
  /** Guest-cancel refunds per listing policy: full refund at least `fullBeforeHours` before pickup, else `partialBps`. */
  cancellation?: Record<'flexible' | 'moderate' | 'strict', { fullBeforeHours: number; partialBps: number }>;
  noShow?: { graceHours: number; guestForfeitBps: number };
  rebookingProtection?: {
    enabled: boolean;
    coverageBps: number;
    maxCoverageCents: number;
    windowHours: number;
    hostPenalty: { enabled: boolean; flatCents: number; pctOfBookingBps: number; graceCancellations: number; graceWindowDays: number };
  };
  trust?: {
    perks: {
      depositDiscountPctByTier: Record<'new' | 'bronze' | 'silver' | 'gold', number>;
      instantBookMinTier: 'new' | 'bronze' | 'silver' | 'gold';
      prioritySupportMinTier: 'new' | 'bronze' | 'silver' | 'gold';
    };
  };
  /** How long each stage of a booking may wait before the system releases it. */
  booking: {
    hostApprovalHours: number;
    verificationGraceHours: number;
    verificationCutoffHours: number;
    verificationLapseFeeCents: number;
    minLeadMinutes: number;
    maxOpenPendingPerGuest: number;
    verificationReminderHours: number;
    overdueEscalationHours: number;
    documentExpiryReleaseHours: number;
    recallAutoHold?: boolean;
    dailyMileageMiles?: number;
    cancellationPolicy?: 'flexible' | 'moderate' | 'strict';
    checkoutHoldMinutes: number;
    paymentPendingMinutes: number;
    priceLockMinutes: number;
    /** Master switch for new guest bookings. */
    guestBookingsEnabled?: boolean;
    guestBookingsPausedMessage?: string;
  };
  rewards: { pointValueCents: number; pointsPerDollar: number };
  referral: { referrerCreditCents: number; refereeCreditCents: number; minTripSpendCents: number; maxRewardsPerReferrer: number };
  protection: { code: string; label: string; description: string; pricePerDay: number }[];
  support: { slaHours: { urgent: number; high: number; normal: number; low: number } };
  surge: {
    enabled: boolean;
    autoEnabled: boolean;
    maxMultiplierBps: number;
    occupancyThresholds: { occupancyPct: number; multiplierBps: number }[];
  };
  insurance?: { wheelbaseDealerId: string; requireApproved: boolean; enforceMinAge: boolean; partnerCommissionBps?: number };
  legal: {
    termsVersion: string;
    termsUrl: string;
    privacyVersion: string;
    privacyUrl: string;
    cancellationUrl?: string;
    minAgeYears: number;
  };
  contactVerification?: { requireEmail: boolean; requirePhone: boolean };
  checkout?: { otherMethodsEnabled: boolean };
  deposit?: { enabled: boolean; minCents: number; maxCents: number; multiplierBps: number; autoReleaseHours: number; requiredAtHandover: boolean; selfServeWindowHours: number };
  verification: {
    identity: VerificationPolicy;
    mvr: VerificationPolicy;
    background: VerificationPolicy;
    insurance: VerificationPolicy;
  };
  /** Monotonic version, bumped on every publish. Read-only. */
  configVersion?: number;
  updatedBy?: string;
  updatedAt?: string;
}

export type VerificationTrigger = 'on_signup' | 'on_first_booking' | 'on_every_booking' | 'manual';

export interface VerificationPolicy {
  required: boolean;
  trigger: VerificationTrigger;
  provider: string;
  maxPerPeriod: number;
  periodDays: number;
  validityDays: number;
}

export interface ConfigVersion {
  _id: string;
  version: number;
  status: 'published' | 'scheduled' | 'superseded' | 'rolled_back';
  snapshot: Record<string, unknown>;
  isPatch: boolean;
  actorId: string;
  reason?: string;
  changedKeys: string[];
  effectiveFrom: string;
  publishedAt?: string;
  restoredFromVersion?: number;
  createdAt: string;
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
  benefits: { bookingDiscountBps: number; waiveSurge: boolean; waiveServiceFee?: boolean; freeProtectionCode?: string; rewardsMultiplierBps: number };
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

export interface RevenueBySource {
  currency: string;
  sources: { label: string; trips: number; gmv: number; platformRevenue: number }[];
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

export type TrafficSource = 'direct' | 'search' | 'social' | 'referral' | 'email' | 'paid';

export interface LiveTrafficSummary {
  activeVisitors: number;
  visitsLast24h: number;
  uniqueVisitorsLast24h: number;
  recent: { path: string; source: TrafficSource; referrerDomain?: string; country?: string; city?: string; device: string; at: string }[];
  topPages: { path: string; count: number }[];
  topReferrers: { domain: string; count: number }[];
  bySource: { source: TrafficSource; count: number }[];
}

export interface GeoSummaryEntry {
  countryCode: string;
  country: string;
  city?: string;
  lat: number;
  lng: number;
  count: number;
}

export interface TollAccount {
  _id: string;
  agency: 'ntta';
  nickname: string;
  status: 'manual' | 'connected' | 'disconnected';
  hasLogin: boolean;
  loginSavedAt?: string;
  lastImportAt?: string;
  lastFetchAt?: string;
  lastError?: string;
  vehicleIds: string[];
}

export type TollStatus = 'matched' | 'no_trip' | 'unknown_car' | 'billed' | 'covered' | 'waived' | 'too_late';

export interface TollTransaction {
  _id: string;
  externalId: string;
  occurredAt: string;
  postedAt: string;
  location: string;
  tagId?: string;
  plate?: string;
  plateState?: string;
  amountCents: number;
  status: TollStatus;
  vehicleId?: string;
  bookingId?: string;
  billedAt?: string;
  note?: string;
}

export interface TollImportSummary {
  read: number;
  added: number;
  duplicates: number;
  matched: number;
  noTrip: number;
  unknownCar: number;
  skipped: number;
  errors: { line: number; reason: string }[];
}

export interface ReviewCheck {
  key: 'photos' | 'photo_match' | 'registration' | 'insurance' | 'wheelbase' | 'vin' | 'pricing' | 'location';
  label: string;
  detail: string;
  state: 'ok' | 'missing' | 'attention';
}
export interface VehicleReview {
  vehicle: {
    _id: string; make: string; model: string; year: number; vin?: string;
    registrationNumber?: string; status: string; verificationStatus: string; recallHold?: boolean;
    photos?: { url: string; isCover?: boolean }[];
    specs?: { doors?: number; color?: string; mileageKm?: number };
    pricing: { dailyPrice: number; currency: string; cleaningFee?: number };
    location?: { address?: string; city?: string; state?: string };
    listing?: { title?: string; description?: string };
    mileageLimit?: { perDayKm: number; overageFeePerKm: number };
    createdAt: string;
  };
  documents: {
    _id: string; category: string; url: string; expiresAt?: string;
    verification?: { status?: string; reason?: string };
  }[];
  host: { hostId: string; displayName: string; email?: string; userId: string } | null;
  checks: ReviewCheck[];
  vinMismatches: { field: string; vinSays: string; hostTyped: string }[];
  readyToApprove: boolean;
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

/** A jurisdiction's tax rule. Rules stack - country + state + city + airport
 *  all apply to the same booking, unlike commission rules which resolve to a
 *  single most-specific winner. */
export interface TaxRule {
  _id: string;
  label: string;
  scope: 'country' | 'state' | 'city' | 'airport';
  matchValue: string;
  kind?: 'sales_tax' | 'rental_excise' | 'airport_concession' | 'surcharge';
  rateBps?: number;
  perDayCents?: number;
  perTripCents?: number;
  active?: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  note?: string;
}

export interface TaxPreview {
  lines: { label: string; amount: { amount: number; currency: string } }[];
  total: { amount: number; currency: string };
}

/** A citation (ticket/toll) incurred during a trip, passed through at cost. */
export interface Violation {
  _id: string;
  bookingId: string;
  citationRef: string;
  kind?: string;
  description?: string;
  amountCents: number;
  occurredAt: string;
  status: string;
  evidenceUrl?: string;
  createdAt: string;
}

export const adminApi = {
  nav: () => api.get<AdminNavItem[]>('/admin/nav'),
  metrics: () => api.get<AdminMetrics>('/admin/metrics'),

  verificationStatus: (userId: string) =>
    api.get<{ type: string; required: boolean; hasValid: boolean; validUntil?: string; lastCheckedAt?: string; checksInPeriod: number; policy: { provider: string; trigger: string } }[]>(`/admin/verification/${userId}`),
  recordVerification: (userId: string, type: string, result: 'passed' | 'failed', notes?: string) =>
    api.post(`/admin/verification/${userId}/${type}`, { result, provider: 'manual', notes }),

  users: (q: Q = {}) => api.get<any[]>('/admin/users', q),
  user: (id: string) => api.get<any>(`/admin/users/${id}`),
  setUserStatus: (id: string, status: string) => api.post(`/admin/users/${id}/status`, { status }),

  hosts: (q: Q = {}) => api.get<any[]>('/admin/hosts', q),
  setHostVerification: (id: string, status: string) =>
    api.post(`/admin/hosts/${id}/verification`, { status }),

  // Asset Partner applications - the primary acquisition intake. Approving is
  // the gate: the reviewed applicant's host account is verified so
  // vehicle.service will let them list a car.
  // Insurance partners: insurers selling their own protection plans, approved here and paid from their own ledger account.
  insurers: (q: Q = {}) => api.get<Insurer[]>('/admin/insurance-partners', q),
  insurer: (id: string) =>
    api.get<{ insurer: Insurer; plans: InsurerPlan[]; summary: InsurerSummary; payouts: InsurerPayout[]; commissionBps: number }>(`/admin/insurance-partners/${id}`),
  reviewInsurer: (id: string, decision: 'approved' | 'rejected', notes?: string) => api.post(`/admin/insurance-partners/${id}/review`, { decision, notes }),
  reviewInsurerPlan: (id: string, planId: string, decision: 'approved' | 'rejected', note?: string) =>
    api.post<InsurerPlan>(`/admin/insurance-partners/${id}/plans/${planId}/review`, { decision, note }),
  setInsurerStatus: (id: string, status: 'approved' | 'suspended', reason?: string) => api.post(`/admin/insurance-partners/${id}/status`, { status, reason }),
  setInsurerCommission: (id: string, commissionBps: number | null) => api.patch(`/admin/insurance-partners/${id}/commission`, { commissionBps }),
  recordInsurerPayout: (id: string, input: { amount: number; reference: string; note?: string }) => api.post(`/admin/insurance-partners/${id}/payouts`, input),

  // Contact page leads - every inbound inquiry (asset partner, investor,
  // corporate, general) lands here so ops sees who's reaching out in one place.
  contactInquiries: (q: Q = {}) => api.get<any[]>('/admin/contact-inquiries', q),
  contactInquiryCounts: () => api.get<Record<string, number>>('/admin/contact-inquiries/counts'),
  contactInquiry: (id: string) => api.get<any>(`/admin/contact-inquiries/${id}`),
  respondContactInquiry: (id: string, notes?: string) =>
    api.post(`/admin/contact-inquiries/${id}/respond`, { notes }),

  vehicles: (q: Q = {}) => api.get<any[]>('/admin/vehicles', q),
  /** Every car, page by page; the server returns at most 50 at a time. */
  allVehicles: async (q: Q = {}) => {
    const all: any[] = [];
    for (let skip = 0; skip < 5000; skip += 50) {
      const res = await api.raw<any[]>('/admin/vehicles', { method: 'GET', query: { ...q, limit: 50, skip } });
      all.push(...res.data);
      const total = typeof res.meta?.total === 'number' ? res.meta.total : undefined;
      if (res.data.length < 50 || (total !== undefined && all.length >= total)) break;
    }
    return all;
  },
  vehicleReview: (id: string) => api.get<VehicleReview>(`/admin/vehicles/${id}/review`),
  vehiclePhotoCheck: (id: string) => api.post<VehicleReview>(`/admin/vehicles/${id}/photo-check`),
  vehicleRemindHost: (id: string, note?: string) =>
    api.post<{ sent: number; items: string[] }>(`/admin/vehicles/${id}/remind-host`, note ? { note } : {}),
  tollAccounts: () => api.get<{ accounts: TollAccount[]; loginStorage: boolean }>('/admin/tolls/accounts'),
  tollCreateAccount: (nickname: string) => api.post<TollAccount>('/admin/tolls/accounts', { agency: 'ntta', nickname }),
  tollUpdateAccount: (id: string, patch: { nickname?: string; vehicleIds?: string[] }) => api.patch<TollAccount>(`/admin/tolls/accounts/${id}`, patch),
  tollSaveLogin: (id: string, username: string, password: string) =>
    api.raw<TollAccount>(`/admin/tolls/accounts/${id}/login`, { method: 'PUT', body: { username, password } }).then((r) => r.data),
  tollRemoveLogin: (id: string) => api.delete<TollAccount>(`/admin/tolls/accounts/${id}/login`),
  tollSetTag: (vehicleId: string, tagId: string | null) =>
    api.raw<{ ok: true }>(`/admin/tolls/vehicles/${vehicleId}/tag`, { method: 'PUT', body: { tagId } }).then((r) => r.data),
  tollImport: (text: string, accountId?: string) => api.post<TollImportSummary>('/admin/tolls/import', { text, ...(accountId ? { accountId } : {}) }),
  tollTransactions: (status?: TollStatus) => api.get<TollTransaction[]>('/admin/tolls/transactions', status ? { status } : {}),
  tollAssign: (id: string, vehicleId: string) => api.post<TollTransaction>(`/admin/tolls/transactions/${id}/assign`, { vehicleId }),
  tollWaive: (id: string, note: string) => api.post<TollTransaction>(`/admin/tolls/transactions/${id}/waive`, { note }),
  tollBill: (bookingId: string) => api.post<{ billed: number; totalCents: number; collected: boolean }>(`/admin/tolls/bill/${bookingId}`),
  setExternalRating: (id: string, body: { rating: number; trips: number; source: string } | { clear: true }) =>
    api.raw(`/admin/vehicles/${id}/external-rating`, { method: 'PUT', body }).then((r) => r.data),
  vehicleAction: (id: string, action: 'approve' | 'suspend' | 'reject') =>
    api.post(`/admin/vehicles/${id}/action`, { action }),
  verifyDocument: (documentId: string) => api.post<{ verified: boolean }>(`/documents/${documentId}/verify`, {}),

  bookings: (q: Q = {}) => api.get<any[]>('/admin/bookings', q),
  cancelBooking: (id: string, reason: string) => api.post(`/admin/bookings/${id}/cancel`, { reason }),
  /** Late cancellations guests asked us to review. */
  tripExceptions: (status: 'pending' | 'decided') => api.get<Booking[]>('/admin/bookings/exceptions', { status }),
  tripExceptionProof: (id: string) => api.get<{ key: string; url: string }[]>(`/admin/bookings/${id}/exception/proof`),
  decideTripException: (id: string, input: { decision: 'approved' | 'partial' | 'rejected'; amountCents?: number; note?: string }) =>
    api.post<Booking>(`/admin/bookings/${id}/exception/decide`, input),
  bookingOverview: (id: string) => api.get<AdminBookingOverview>(`/admin/bookings/${id}/overview`),
  openGuestId: (id: string, reason: string) => api.post<{ token: string; expiresAt: string; viewSeconds: number; items: { id: string; label: string }[] }>(`/admin/bookings/${id}/guest-id/open`, { reason }),
  guestIdFile: (id: string, token: string, kind: string) => api.post<{ contentType: 'image/jpeg' | 'application/pdf'; data: string }>(`/admin/bookings/${id}/guest-id/file`, { token, kind }),
  clearIdentityCheck: (id: string, reason: string) => api.post(`/admin/bookings/${id}/identity-check/clear`, { reason }),

  claims: (q: Q = {}) => api.get<any[]>('/admin/claims', q),
  assignClaim: (id: string) => api.post(`/admin/claims/${id}/assign`),
  resolveClaim: (id: string, decision: string, note?: string, amountApproved?: number) =>
    api.post(`/admin/claims/${id}/resolve`, { decision, note, amountApproved }),
  claim: (id: string) => api.get<any>(`/admin/claims/${id}`),
  linkClaim: (id: string, code: string) => api.post<any>(`/admin/claims/${id}/link`, { code }),

  tickets: (q: Q = {}) => api.get<any[]>('/admin/tickets', q),
  ticket: (id: string) => api.get<any>(`/admin/tickets/${id}`),
  replyTicket: (id: string, body: string, internal = false) =>
    api.post(`/admin/tickets/${id}/reply`, { body, internal }),
  escalateTicket: (id: string) => api.post(`/admin/tickets/${id}/escalate`),
  resolveTicket: (id: string) => api.post(`/admin/tickets/${id}/resolve`),

  analytics: (days = 30) => api.get<AdminAnalytics>('/admin/analytics', { days }),
  liveTraffic: () => api.get<LiveTrafficSummary>('/admin/analytics/live-traffic'),
  trafficGeo: (days = 30) => api.get<GeoSummaryEntry[]>('/admin/analytics/geo', { days }),

  // NOTE: the flag's `_id` IS its key (see feature-flag.model.ts) - there is no
  // separate `key` field. Typing it stops us reading `f.key` and rendering undefined.

  // Platform economics - every rate the business runs on, tunable live.
  config: () => api.get<PlatformConfig>('/admin/config'),
  saveConfig: (patch: Partial<PlatformConfig> & { reason?: string }) =>
    api.raw<PlatformConfig>('/admin/config', { method: 'PUT', body: patch }).then((r) => r.data),

  // ── Config versioning / history / rollback / scheduling ──
  configVersions: (limit?: number) =>
    api.get<ConfigVersion[]>('/admin/config/versions', limit ? { limit } : undefined),
  configVersion: (version: number) => api.get<ConfigVersion>(`/admin/config/versions/${version}`),
  rollbackConfig: (toVersion: number, reason?: string) =>
    api.post<PlatformConfig>('/admin/config/rollback', { toVersion, reason }),
  scheduledConfig: () => api.get<ConfigVersion[]>('/admin/config/scheduled'),
  scheduleConfig: (patch: Partial<PlatformConfig>, effectiveFrom: string, reason?: string) =>
    api.post<ConfigVersion>('/admin/config/schedule', { patch, effectiveFrom, reason }),
  cancelScheduledConfig: (id: string) =>
    api.raw(`/admin/config/scheduled/${id}`, { method: 'DELETE' }).then((r) => r.data),

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
  revenueBySource: () => api.get<RevenueBySource>('/admin/finance/by-source'),


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
  failures: (q: { area?: string; days?: number } = {}) =>
    api.get<{ items: any[]; summary: { code: string; area: string; count: number; lastAt: string; status: number; message: string }[] }>('/admin/failures', q),

  staff: () => api.get<any[]>('/admin/staff'),
  createStaff: (body: { name: string; role: string; email?: string }) =>
    api.post<{ id: string; username: string; password: string; role: string }>('/admin/staff', body),
  setStaffRole: (id: string, role: string) => api.post(`/admin/staff/${id}/role`, { role }),
  resetStaffPassword: (id: string) => api.post<{ username: string; password: string }>(`/admin/staff/${id}/reset-password`, {}),
  setStaffActive: (id: string, active: boolean) => api.post(`/admin/staff/${id}/active`, { active }),

  kyc: (q: Q = {}) => api.get<any[]>('/admin/kyc', q),
  reviewKyc: (id: string, decision: 'approved' | 'rejected', reason?: string) =>
    api.post(`/admin/kyc/${id}/review`, { decision, reason }),

  // ── Knowledge base ──
  kbArticles: (q: { status?: string; q?: string } = {}) => api.get<KbArticle[]>('/admin/kb/articles', q),
  kbStats: () => api.get<KbStats>('/admin/kb/stats'),
  createKbArticle: (b: Partial<KbArticle>) => api.post<KbArticle>('/admin/kb/articles', b),
  updateKbArticle: (id: string, b: Partial<KbArticle>) => api.patch<KbArticle>(`/admin/kb/articles/${id}`, b),
  publishKbArticle: (id: string) => api.post<KbArticle>(`/admin/kb/articles/${id}/publish`),
  unpublishKbArticle: (id: string) => api.post<KbArticle>(`/admin/kb/articles/${id}/unpublish`),
  deleteKbArticle: (id: string) => api.delete(`/admin/kb/articles/${id}`),

  // ── Promo codes ──
  coupons: (q: { status?: string; q?: string } = {}) => api.get<Coupon[]>('/admin/coupons', q),
  couponStats: (id: string) => api.get<CouponStats>(`/admin/coupons/${id}/stats`),
  createCoupon: (b: Partial<Coupon>) => api.post<Coupon>('/admin/coupons', b),
  setCouponStatus: (id: string, status: 'active' | 'disabled') =>
    api.post<Coupon>(`/admin/coupons/${id}/status`, { status }),
  deleteCoupon: (id: string) => api.delete(`/admin/coupons/${id}`),

  // ── Referrals ──
  referralStats: (days = 30) => api.get<ReferralStats>('/admin/referrals/stats', { days }),

  // Tax rules - jurisdiction stack. platform:manage gated.
  taxRules: (params: { scope?: string; active?: boolean } = {}) =>
    api.get<TaxRule[]>('/admin/tax-rules', params as Record<string, string | boolean | undefined>),
  createTaxRule: (body: Partial<TaxRule>) => api.post<TaxRule>('/admin/tax-rules', body),
  updateTaxRule: (id: string, body: Partial<TaxRule>) =>
    api.patch<TaxRule>(`/admin/tax-rules/${id}`, body),
  deleteTaxRule: (id: string) => api.delete<{ deleted: boolean }>(`/admin/tax-rules/${id}`),
  /** What a place would be taxed, without making a booking. */
  previewTax: (q: { amount?: number; state?: string; city?: string; airport?: string; days?: number }) =>
    api.get<TaxPreview>('/admin/tax-rules/preview', q as Record<string, string | number | undefined>),

  // Citations
  violations: (params: { status?: string; limit?: number } = {}) =>
    api.get<Violation[]>('/admin/violations', params as Record<string, string | number | undefined>),
  chargeViolation: (id: string) => api.post<Violation>(`/admin/violations/${id}/charge`, {}),
  waiveViolation: (id: string, resolution: string) =>
    api.post<Violation>(`/admin/violations/${id}/waive`, { resolution }),

};

export interface KbArticle {
  _id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  tags: string[];
  status: 'draft' | 'published';
  views: number;
  helpful: number;
  notHelpful: number;
  publishedAt?: string;
  updatedAt: string;
}

export interface KbStats {
  published: number;
  draft: number;
  totalViews: number;
  needsAttention: { slug: string; title: string; helpful: number; notHelpful: number; views: number }[];
}

export interface Coupon {
  _id: string;
  code: string;
  campaign?: string;
  type: 'percent' | 'fixed';
  valueBps: number;
  amount: number;
  minSpend: number;
  maxDiscount: number;
  budget: number;
  spent: number;
  maxRedemptions: number;
  redeemedCount: number;
  perUserLimit: number;
  firstTimeOnly: boolean;
  status: 'active' | 'disabled';
  validTo: string;
}

export interface CouponStats {
  coupon: Coupon;
  redemptions: number;
  uniqueUsers: number;
  discountGiven: number;
  budgetUsedPct: number | null;
  redemptionsRemaining: number;
  recent: { userId: string; bookingId: string; discountAmount: number; createdAt: string }[];
}

export interface ReferralStats {
  windowDays: number;
  total: number;
  converted: number;
  pending: number;
  conversionRatePct: number;
  inWindow: number;
  topReferrers: { userId: string; conversions: number }[];
}

/** One booking for staff: trip, car, host and who booked it (identity summary only, photos open separately). */
type AdminMoney = { amount: number; currency: string };

export interface AdminBookingOverview {
  booking: {
    id: string; code: string; status: string; period: { start: string; end: string }; total?: { amount: number; currency: string };
    createdAt?: string; pickupVerifiedAt?: string;
    identityCheck: { result: 'match' | 'mismatch'; at: string; by: string; note?: string; clearedAt?: string } | null;
    instantBook: boolean;
    cancellationPolicy?: string;
    extensions: number;
    delivery: { mode: string; address: string; flightNumber?: string } | null;
    additionalDrivers: string[];
  };
  price: {
    days: number; base: AdminMoney; discount?: AdminMoney; cleaningFee?: AdminMoney; delivery?: AdminMoney; addOnsTotal?: AdminMoney;
    protection?: AdminMoney; protectionPlan?: string; serviceFee?: AdminMoney; tax?: AdminMoney; taxTotal?: AdminMoney;
    total: AdminMoney; hostEarnings: AdminMoney; commission: AdminMoney;
  } | null;
  payments: { id: string; type: string; amount: number; currency: string; captured: number; refunded: number; wallet: number; status: string; releasedReason?: string; createdAt: string }[];
  cancellation: { role?: string; at: string; reason?: string; refund: AdminMoney; charged?: AdminMoney } | null;
  history: { from: string | null; to: string; at: string; reason?: string }[];
  trip: { status: string; startedAt?: string; returnedAt?: string } | null;
  vehicle: { id: string; name: string; plate?: string } | null;
  host: { id: string; name: string; email?: string; phone?: string };
  guest: {
    id: string; name: string; email?: string; phone?: string; memberSince?: string; tripsCompleted: number;
    identity: {
      status: string; verifiedName?: string; dob?: string; age?: number; licenceExpiry?: string; verifiedAt?: string;
      source?: 'stripe' | 'upload'; photos: { id: string; label: string }[]; photosReadable: boolean;
    };
  };
}
