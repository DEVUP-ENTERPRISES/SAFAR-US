/**
 * Default roles and their permission bundles. In production these live as
 * seed data in the DB (editable without deploy); this file is the bootstrap
 * source of truth and the type-safe reference used across the code.
 */
export const ROLES = {
  GUEST: 'guest',
  HOST: 'host',
  SUPPORT: 'support',
  MODERATOR: 'moderator',
  FINANCE: 'finance',
  OPS: 'ops',
  SUPER_ADMIN: 'super_admin',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const PERMISSIONS = {
  BOOKING_CREATE: 'booking:create',
  BOOKING_CANCEL_OWN: 'booking:cancel:own',
  BOOKING_READ_ANY: 'booking:read:any',
  BOOKING_MANAGE: 'booking:manage',
  VEHICLE_CREATE: 'vehicle:create',
  VEHICLE_UPDATE_OWN: 'vehicle:update:own',
  VEHICLE_VERIFY: 'vehicle:verify',
  HOST_MANAGE: 'host:manage',
  USER_READ_ANY: 'user:read:any',
  USER_MANAGE: 'user:manage',
  KYC_REVIEW: 'kyc:review',
  PAYMENT_REFUND: 'payment:refund',
  CLAIM_MANAGE: 'claim:manage',
  TICKET_MANAGE: 'ticket:manage',
  ADMIN_READ: 'admin:read',
  ANALYTICS_READ: 'analytics:read',
  /**
   * Mutating platform-wide configuration (feature flags, kill switches).
   * Deliberately NOT bundled into admin:read — every staff role holds that, so
   * guarding a write with it would let a support agent flip flags for everyone.
   */
  PLATFORM_MANAGE: 'platform:manage',
  /** Oversight of host fleets (multi-vehicle operators). */
  FLEET_MANAGE: 'fleet:manage',
  /** Oversight of corporate organisations and their billing. */
  CORPORATE_MANAGE: 'corporate:manage',
  /** Release / inspect host payouts. */
  PAYOUT_MANAGE: 'payout:manage',
  /** Moderate guest & host reviews. */
  REVIEW_MODERATE: 'review:moderate',
  ALL: '*',
} as const;

const P = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  [ROLES.GUEST]: [P.BOOKING_CREATE, P.BOOKING_CANCEL_OWN],
  [ROLES.HOST]: [P.BOOKING_CREATE, P.BOOKING_CANCEL_OWN, P.VEHICLE_CREATE, P.VEHICLE_UPDATE_OWN],
  [ROLES.SUPPORT]: [P.ADMIN_READ, P.TICKET_MANAGE, P.BOOKING_READ_ANY, P.USER_READ_ANY, P.CLAIM_MANAGE],
  [ROLES.MODERATOR]: [P.ADMIN_READ, P.USER_MANAGE, P.USER_READ_ANY, P.BOOKING_READ_ANY, P.REVIEW_MODERATE],
  [ROLES.FINANCE]: [
    P.ADMIN_READ,
    P.ANALYTICS_READ,
    P.PAYMENT_REFUND,
    P.BOOKING_MANAGE,
    P.BOOKING_READ_ANY,
    P.PAYOUT_MANAGE,
    P.CORPORATE_MANAGE,
  ],
  [ROLES.OPS]: [
    P.ADMIN_READ,
    P.ANALYTICS_READ,
    P.VEHICLE_VERIFY,
    P.HOST_MANAGE,
    P.USER_MANAGE,
    P.USER_READ_ANY,
    P.KYC_REVIEW,
    P.CLAIM_MANAGE,
    P.BOOKING_READ_ANY,
    P.FLEET_MANAGE,
  ],
  [ROLES.SUPER_ADMIN]: [P.ALL],
};

/** Resolve the union of permissions for a set of roles. */
export function permissionsForRoles(roles: string[]): string[] {
  const set = new Set<string>();
  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role as RoleName];
    perms?.forEach((p) => set.add(p));
  }
  return [...set];
}
