/**
 * Canonical admin route registry. Each admin feature is declared once as a
 * { slug, path, apiPath, label, permission } record — the single source of
 * truth for the sidebar (via GET /admin/nav), permission gating, and docs.
 *
 *  - slug:       stable identifier for the section
 *  - path:       front-end route (CATO web admin panel)
 *  - apiPath:    primary backend endpoint that powers the section
 *  - permission: RBAC permission required to see/use the section
 */
export interface AdminSection {
  slug: string;
  path: string;
  apiPath: string;
  label: string;
  group: string;
  permission: string;
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { slug: 'dashboard', path: '/admin', apiPath: '/admin/metrics', label: 'Dashboard', group: 'Overview', permission: 'admin:read' },
  { slug: 'analytics', path: '/admin', apiPath: '/admin/analytics', label: 'Analytics', group: 'Overview', permission: 'analytics:read' },

  { slug: 'users', path: '/admin/users', apiPath: '/admin/users', label: 'User Management', group: 'People', permission: 'admin:read' },
  { slug: 'kyc', path: '/admin/kyc', apiPath: '/admin/kyc', label: 'KYC Review', group: 'People', permission: 'kyc:review' },
  { slug: 'hosts', path: '/admin/hosts', apiPath: '/admin/hosts', label: 'Host Management', group: 'People', permission: 'admin:read' },

  { slug: 'vehicles', path: '/admin/vehicles', apiPath: '/admin/vehicles', label: 'Vehicle Management', group: 'Supply', permission: 'admin:read' },

  { slug: 'bookings', path: '/admin/bookings', apiPath: '/admin/bookings', label: 'Booking Management', group: 'Operations', permission: 'admin:read' },
  { slug: 'claims', path: '/admin/claims', apiPath: '/admin/claims', label: 'Claims Management', group: 'Operations', permission: 'claim:manage' },
  { slug: 'support', path: '/admin/support', apiPath: '/admin/tickets', label: 'Support', group: 'Operations', permission: 'ticket:manage' },

  { slug: 'commission', path: '/admin/commission', apiPath: '/admin/commission-rules', label: 'Commission', group: 'Revenue', permission: 'admin:read' },
  { slug: 'finance', path: '/admin/finance', apiPath: '/admin/finance', label: 'Finance', group: 'Revenue', permission: 'analytics:read' },
  { slug: 'economics', path: '/admin/economics', apiPath: '/admin/config', label: 'Platform Economics', group: 'Revenue', permission: 'admin:read' },

  { slug: 'surge', path: '/admin/surge', apiPath: '/admin/surge-rules', label: 'Surge Pricing', group: 'Revenue', permission: 'admin:read' },
  { slug: 'memberships', path: '/admin/memberships', apiPath: '/admin/subscription-plans', label: 'Memberships', group: 'Revenue', permission: 'admin:read' },

  { slug: 'feature-flags', path: '/admin/settings', apiPath: '/admin/feature-flags', label: 'Feature Flags', group: 'Platform', permission: 'admin:read' },
  { slug: 'audit', path: '/admin/audit', apiPath: '/admin/audit-logs', label: 'Audit Logs', group: 'Platform', permission: 'admin:read' },
];

/** Sections the principal may access, given its permission set. */
export function navForPermissions(permissions: string[]): AdminSection[] {
  const set = new Set(permissions);
  const allow = (p: string) => set.has('*') || set.has(p);
  return ADMIN_SECTIONS.filter((s) => allow(s.permission));
}
