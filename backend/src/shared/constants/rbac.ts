/**
 * Default roles and their permission bundles. In production these live as
 * seed data in the DB (editable without deploy); this file is the bootstrap
 * source of truth and the type-safe reference used across the code.
 */
export const ROLES = {
  GUEST: 'guest',
  HOST: 'host',
  SUPPORT: 'support',
  FINANCE: 'finance',
  OPS: 'ops',
  SUPER_ADMIN: 'super_admin',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const PERMISSIONS = {
  BOOKING_CREATE: 'booking:create',
  BOOKING_CANCEL_OWN: 'booking:cancel:own',
  BOOKING_READ_ANY: 'booking:read:any',
  VEHICLE_CREATE: 'vehicle:create',
  VEHICLE_UPDATE_OWN: 'vehicle:update:own',
  VEHICLE_VERIFY: 'vehicle:verify',
  PAYMENT_REFUND: 'payment:refund',
  USER_READ_ANY: 'user:read:any',
  ALL: '*',
} as const;

export const ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  [ROLES.GUEST]: [PERMISSIONS.BOOKING_CREATE, PERMISSIONS.BOOKING_CANCEL_OWN],
  [ROLES.HOST]: [
    PERMISSIONS.BOOKING_CREATE,
    PERMISSIONS.BOOKING_CANCEL_OWN,
    PERMISSIONS.VEHICLE_CREATE,
    PERMISSIONS.VEHICLE_UPDATE_OWN,
  ],
  [ROLES.SUPPORT]: [PERMISSIONS.BOOKING_READ_ANY, PERMISSIONS.USER_READ_ANY],
  [ROLES.FINANCE]: [PERMISSIONS.PAYMENT_REFUND, PERMISSIONS.BOOKING_READ_ANY],
  [ROLES.OPS]: [PERMISSIONS.VEHICLE_VERIFY, PERMISSIONS.BOOKING_READ_ANY],
  [ROLES.SUPER_ADMIN]: [PERMISSIONS.ALL],
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
