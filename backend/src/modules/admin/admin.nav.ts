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
  { slug: 'analytics', path: A('analytics'), apiPath: '/admin/analytics', label: 'Analytics', group: 'Overview', permission: 'analytics:read' },

  /*
   * Asset Partners gets its own group, not a few entries scattered through
   * People and Revenue.
   *
   * The programme is a different business from hosting and is paid by
   * different arithmetic: a host earns per booking (subtotal − commission −
   * tax) while a partner is paid monthly (gross − management fee − insurance
   * − detailing). Sharing a "Commission" screen between them is how an
   * operator edits a host rate and silently believes they changed partner
   * economics too. Listed first because it is the primary acquisition path.
   */
  { slug: 'asset-partners', path: A('asset-partners'), apiPath: '/admin/asset-partner-applications', label: 'Applications', group: 'Asset Partners', permission: 'admin:read' },
  // The programme itself, separate from the intake queue: members, their
  // lifecycle and their negotiated terms.
  { slug: 'partners', path: A('partners'), apiPath: '/admin/asset-partners', label: 'Partners', group: 'Asset Partners', permission: 'admin:read' },
  // The programme's own economics. Backed by the same platform-config
  // document as Platform Economics, but a deliberately separate screen: these
  // are the partner-agreement figures, and none of them is a commission rule.
  { slug: 'asset-partner-terms', path: A('asset-partner-terms'), apiPath: '/admin/config', label: 'Programme Terms', group: 'Asset Partners', permission: 'platform:manage' },

  { slug: 'contact', path: A('contact'), apiPath: '/admin/contact-inquiries', label: 'Contact Inquiries', group: 'People', permission: 'admin:read' },
  { slug: 'users', path: A('users'), apiPath: '/admin/users', label: 'User Management', group: 'People', permission: 'admin:read' },
  { slug: 'kyc', path: A('kyc'), apiPath: '/admin/kyc', label: 'KYC Review', group: 'People', permission: 'kyc:review' },
  { slug: 'hosts', path: A('hosts'), apiPath: '/admin/hosts', label: 'Host Management', group: 'People', permission: 'admin:read' },

  // CatoDrive's own fleet, run through the existing Host tooling.
  { slug: 'house-fleet', path: A('house-fleet'), apiPath: '/admin/house-fleet/session', label: 'House Fleet', group: 'Supply', permission: 'platform:manage' },
  { slug: 'vehicles', path: A('vehicles'), apiPath: '/admin/vehicles', label: 'Vehicle Management', group: 'Supply', permission: 'admin:read' },
  { slug: 'fleets', path: A('fleets'), apiPath: '/admin/fleets', label: 'Fleet Management', group: 'Supply', permission: 'fleet:manage' },

  // Keep every group's entries contiguous: the sidebar builds groups in
  // first-appearance order, so a split group renders as two sections.
  { slug: 'bookings', path: A('bookings'), apiPath: '/admin/bookings', label: 'Booking Management', group: 'Operations', permission: 'admin:read' },
  { slug: 'claims', path: A('claims'), apiPath: '/admin/claims', label: 'Claims Management', group: 'Operations', permission: 'claim:manage' },
  { slug: 'support', path: A('support'), apiPath: '/admin/tickets', label: 'Support', group: 'Operations', permission: 'ticket:manage' },
  { slug: 'kb', path: A('kb'), apiPath: '/admin/kb/articles', label: 'Knowledge Base', group: 'Operations', permission: 'ticket:manage' },
  { slug: 'violations', path: A('violations'), apiPath: '/admin/violations', label: 'Citations', group: 'Operations', permission: 'claim:manage' },
  { slug: 'reviews', path: A('reviews'), apiPath: '/admin/reviews', label: 'Reviews', group: 'Operations', permission: 'review:moderate' },

  { slug: 'referrals', path: A('referrals'), apiPath: '/admin/referrals/stats', label: 'Referrals', group: 'Business', permission: 'admin:read' },
  { slug: 'corporate', path: A('corporate'), apiPath: '/admin/corporate/orgs', label: 'Corporate Accounts', group: 'Business', permission: 'corporate:manage' },
  { slug: 'payouts', path: A('payouts'), apiPath: '/admin/payouts', label: 'Payouts', group: 'Business', permission: 'payout:manage' },

  { slug: 'commission', path: A('commission'), apiPath: '/admin/commission-rules', label: 'Commission', group: 'Revenue', permission: 'admin:read' },
  { slug: 'finance', path: A('finance'), apiPath: '/admin/finance', label: 'Finance', group: 'Revenue', permission: 'analytics:read' },
  { slug: 'revenue-source', path: A('revenue-source'), apiPath: '/admin/finance/by-source', label: 'Revenue by Source', group: 'Revenue', permission: 'analytics:read' },
  { slug: 'economics', path: A('economics'), apiPath: '/admin/config', label: 'Platform Economics', group: 'Revenue', permission: 'admin:read' },
  { slug: 'tax', path: A('tax'), apiPath: '/admin/tax-rules', label: 'Tax Rules', group: 'Revenue', permission: 'platform:manage' },

  { slug: 'coupons', path: A('coupons'), apiPath: '/admin/coupons', label: 'Promo Codes', group: 'Revenue', permission: 'platform:manage' },
  { slug: 'surge', path: A('surge'), apiPath: '/admin/surge-rules', label: 'Surge Pricing', group: 'Revenue', permission: 'admin:read' },
  { slug: 'memberships', path: A('memberships'), apiPath: '/admin/subscription-plans', label: 'Memberships', group: 'Revenue', permission: 'admin:read' },

  { slug: 'ai', path: A('ai'), apiPath: '/ai/usage', label: 'AI Usage', group: 'Platform', permission: 'platform:manage' },
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
