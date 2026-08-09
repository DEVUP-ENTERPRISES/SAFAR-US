import { config } from '../../config';
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

/**
 * Builds a console path from the configured secret slug, so every admin route
 * is `/{ADMIN_SLUG}/...`. Changing the slug moves the whole console at once —
 * there is no second list to keep in step.
 */
const A = (sub?: string) => (sub ? `${config.adminPanel.basePath}/${sub}` : config.adminPanel.basePath);

export const ADMIN_SECTIONS: AdminSection[] = [
  { slug: 'dashboard', path: A(), apiPath: '/admin/metrics', label: 'Dashboard', group: 'Overview', permission: 'admin:read' },
  { slug: 'analytics', path: A('analytics'), apiPath: '/admin/analytics', label: 'Analytics', group: 'Overview', permission: 'analytics:read' },

  { slug: 'users', path: A('users'), apiPath: '/admin/users', label: 'User Management', group: 'People', permission: 'admin:read' },
  { slug: 'kyc', path: A('kyc'), apiPath: '/admin/kyc', label: 'KYC Review', group: 'People', permission: 'kyc:review' },
  { slug: 'hosts', path: A('hosts'), apiPath: '/admin/hosts', label: 'Host Management', group: 'People', permission: 'admin:read' },

  { slug: 'vehicles', path: A('vehicles'), apiPath: '/admin/vehicles', label: 'Vehicle Management', group: 'Supply', permission: 'admin:read' },
  { slug: 'fleets', path: A('fleets'), apiPath: '/admin/fleets', label: 'Fleet Management', group: 'Supply', permission: 'fleet:manage' },

  // Keep every group's entries contiguous: the sidebar builds groups in
  // first-appearance order, so a split group renders as two sections.
  { slug: 'bookings', path: A('bookings'), apiPath: '/admin/bookings', label: 'Booking Management', group: 'Operations', permission: 'admin:read' },
  { slug: 'claims', path: A('claims'), apiPath: '/admin/claims', label: 'Claims Management', group: 'Operations', permission: 'claim:manage' },
  { slug: 'support', path: A('support'), apiPath: '/admin/tickets', label: 'Support', group: 'Operations', permission: 'ticket:manage' },
  { slug: 'kb', path: A('kb'), apiPath: '/admin/kb/articles', label: 'Knowledge Base', group: 'Operations', permission: 'ticket:manage' },
  { slug: 'reviews', path: A('reviews'), apiPath: '/admin/reviews', label: 'Reviews', group: 'Operations', permission: 'review:moderate' },

  { slug: 'referrals', path: A('referrals'), apiPath: '/admin/referrals/stats', label: 'Referrals', group: 'Business', permission: 'admin:read' },
  { slug: 'corporate', path: A('corporate'), apiPath: '/admin/corporate/orgs', label: 'Corporate Accounts', group: 'Business', permission: 'corporate:manage' },
  { slug: 'payouts', path: A('payouts'), apiPath: '/admin/payouts', label: 'Payouts', group: 'Business', permission: 'payout:manage' },

  { slug: 'commission', path: A('commission'), apiPath: '/admin/commission-rules', label: 'Commission', group: 'Revenue', permission: 'admin:read' },
  { slug: 'finance', path: A('finance'), apiPath: '/admin/finance', label: 'Finance', group: 'Revenue', permission: 'analytics:read' },
  { slug: 'economics', path: A('economics'), apiPath: '/admin/config', label: 'Platform Economics', group: 'Revenue', permission: 'admin:read' },

  { slug: 'coupons', path: A('coupons'), apiPath: '/admin/coupons', label: 'Promo Codes', group: 'Revenue', permission: 'platform:manage' },
  { slug: 'surge', path: A('surge'), apiPath: '/admin/surge-rules', label: 'Surge Pricing', group: 'Revenue', permission: 'admin:read' },
  { slug: 'memberships', path: A('memberships'), apiPath: '/admin/subscription-plans', label: 'Memberships', group: 'Revenue', permission: 'admin:read' },

  { slug: 'feature-flags', path: A('settings'), apiPath: '/admin/feature-flags', label: 'Feature Flags', group: 'Platform', permission: 'admin:read' },
  { slug: 'audit', path: A('audit'), apiPath: '/admin/audit-logs', label: 'Audit Logs', group: 'Platform', permission: 'admin:read' },
];

// Fail fast at boot if a group's entries got split by a later insertion — the
// sidebar would silently render that group twice.
{
  const seen = new Set<string>();
  let prev = '';
  for (const s of ADMIN_SECTIONS) {
    if (s.group !== prev) {
      if (seen.has(s.group)) {
        throw new Error(
          `admin.nav: "${s.group}" entries are not contiguous — the sidebar would show it twice.`,
        );
      }
      seen.add(s.group);
      prev = s.group;
    }
  }
}

/** Sections the principal may access, given its permission set. */
export function navForPermissions(permissions: string[]): AdminSection[] {
  const set = new Set(permissions);
  const allow = (p: string) => set.has('*') || set.has(p);
  return ADMIN_SECTIONS.filter((s) => allow(s.permission));
}
