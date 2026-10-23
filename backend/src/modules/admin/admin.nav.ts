import { config } from '../../config';
/**
 * Canonical admin route registry. Each admin feature is declared once as a
 * { slug, path, apiPath, label, permission } record — the single source of
 * truth for the sidebar (via GET /admin/nav), permission gating, and docs.
 *
 *  - slug:       stable identifier for the section
 *  - path:       front-end route (CatoDrive web admin panel)
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
  { slug: 'reports', path: A('reports'), apiPath: '/admin/finance', label: 'Reports', group: 'Overview', permission: 'analytics:read' },
  { slug: 'visitors', path: A('visitors'), apiPath: '/admin/analytics/live-traffic', label: 'Visitors', group: 'Overview', permission: 'analytics:read' },

  { slug: 'commission', path: A('commission'), apiPath: '/admin/commission-rules', label: 'Commission', group: 'Money in', permission: 'admin:read' },
  { slug: 'economics', path: A('economics'), apiPath: '/admin/config', label: 'Platform Economics', group: 'Money in', permission: 'admin:read' },
  { slug: 'tax', path: A('tax'), apiPath: '/admin/tax-rules', label: 'Rental Tax', group: 'Money in', permission: 'platform:manage' },
  { slug: 'coupons', path: A('coupons'), apiPath: '/admin/coupons', label: 'Promo Codes', group: 'Money in', permission: 'platform:manage' },
  { slug: 'surge', path: A('surge'), apiPath: '/admin/surge-rules', label: 'Surge Pricing', group: 'Money in', permission: 'admin:read' },
  { slug: 'memberships', path: A('memberships'), apiPath: '/admin/subscription-plans', label: 'Memberships', group: 'Money in', permission: 'admin:read' },
  { slug: 'referrals', path: A('referrals'), apiPath: '/admin/referrals/stats', label: 'Referrals', group: 'Money in', permission: 'admin:read' },

  { slug: 'payouts', path: A('payouts'), apiPath: '/admin/payouts', label: 'Host Payouts', group: 'Money out', permission: 'payout:manage' },
  { slug: 'asset-partners', path: A('asset-partners'), apiPath: '/admin/asset-partners/summary', label: 'Asset Partners', group: 'Money out', permission: 'admin:read' },
  { slug: 'asset-partner-terms', path: A('asset-partner-terms'), apiPath: '/admin/config', label: 'Partner Terms', group: 'Money out', permission: 'platform:manage' },
  { slug: 'insurers', path: A('insurers'), apiPath: '/admin/insurance-partners', label: 'Insurance Partners', group: 'Money out', permission: 'admin:read' },
  { slug: 'corporate', path: A('corporate'), apiPath: '/admin/corporate/orgs', label: 'Corporate Accounts', group: 'Money out', permission: 'corporate:manage' },

  { slug: 'users', path: A('users'), apiPath: '/admin/users', label: 'Users', group: 'People & cars', permission: 'admin:read' },
  { slug: 'kyc', path: A('kyc'), apiPath: '/admin/kyc', label: 'ID Checks', group: 'People & cars', permission: 'kyc:review' },
  { slug: 'hosts', path: A('hosts'), apiPath: '/admin/hosts', label: 'Hosts', group: 'People & cars', permission: 'admin:read' },
  { slug: 'vehicles', path: A('vehicles'), apiPath: '/admin/vehicles', label: 'Vehicles', group: 'People & cars', permission: 'admin:read' },
  { slug: 'bookings', path: A('bookings'), apiPath: '/admin/bookings', label: 'Bookings', group: 'People & cars', permission: 'admin:read' },
  { slug: 'fleets', path: A('fleets'), apiPath: '/admin/fleets', label: 'Fleets', group: 'People & cars', permission: 'fleet:manage' },
  { slug: 'tolls', path: A('tolls'), apiPath: '/admin/tolls/accounts', label: 'Tolls', group: 'People & cars', permission: 'admin:read' },

  { slug: 'support', path: A('support'), apiPath: '/admin/tickets', label: 'Support Tickets', group: 'Help & safety', permission: 'ticket:manage' },
  { slug: 'kb', path: A('kb'), apiPath: '/admin/kb/articles', label: 'Help Articles', group: 'Help & safety', permission: 'ticket:manage' },
  { slug: 'contact', path: A('contact'), apiPath: '/admin/contact-inquiries', label: 'Contact Requests', group: 'Help & safety', permission: 'admin:read' },
  { slug: 'claims', path: A('claims'), apiPath: '/admin/claims', label: 'Damage Claims', group: 'Help & safety', permission: 'claim:manage' },
  { slug: 'violations', path: A('violations'), apiPath: '/admin/violations', label: 'Traffic Tickets', group: 'Help & safety', permission: 'claim:manage' },
  { slug: 'reviews', path: A('reviews'), apiPath: '/admin/reviews', label: 'Reviews', group: 'Help & safety', permission: 'review:moderate' },
  { slug: 'failures', path: A('failures'), apiPath: '/admin/failures', label: 'Failed Actions', group: 'Help & safety', permission: 'admin:read' },

  { slug: 'feature-flags', path: A('feature-flags'), apiPath: '/admin/feature-flags', label: 'Feature Flags', group: 'Control', permission: 'admin:read' },
  { slug: 'staff', path: A('staff'), apiPath: '/admin/staff', label: 'Staff Accounts', group: 'Control', permission: '*' },
  { slug: 'audit', path: A('audit'), apiPath: '/admin/audit-logs', label: 'Audit Log', group: 'Control', permission: '*' },
  { slug: 'ai', path: A('ai'), apiPath: '/ai/usage', label: 'AI Usage', group: 'Control', permission: 'platform:manage' },
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
