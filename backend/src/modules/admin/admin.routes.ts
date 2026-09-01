import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { authorize } from '../../shared/middleware/authorize';
import { auditLog } from '../../shared/middleware/audit-log';
import { metricsAdminRoutes } from './api/metrics.admin.routes';
import { usersAdminRoutes } from './api/users.admin.routes';
import { hostsAdminRoutes } from './api/hosts.admin.routes';
import { vehiclesAdminRoutes } from './api/vehicles.admin.routes';
import { bookingsAdminRoutes } from './api/bookings.admin.routes';
import { claimsAdminRoutes } from './api/claims.admin.routes';
import { supportAdminRoutes } from './api/support.admin.routes';
import { kbAdminRoutes } from './api/kb.admin.routes';
import { couponsAdminRoutes } from './api/coupons.admin.routes';
import { taxAdminRoutes } from './api/tax.admin.routes';
import { violationsAdminRoutes } from './api/violations.admin.routes';
import { memberEconomyAdminRoutes } from './api/member-economy.admin.routes';
import { platformAdminRoutes } from './api/platform.admin.routes';
import { kycAdminRoutes } from './api/kyc.admin.routes';
import { navAdminRoutes } from './api/nav.admin.routes';
import { oversightAdminRoutes } from './api/oversight.admin.routes';
import { platformConfigAdminRoutes } from '../platform-config/api/platform-config.admin.routes';
import { growthAdminRoutes } from '../platform-config/api/growth.admin.routes';

/**
 * Admin BFF. A single base gate (authenticated + admin:read) protects the
 * whole surface; each mutation route additionally requires its specific
 * permission (user:manage, host:manage, vehicle:verify, booking:manage,
 * claim:manage, ticket:manage). Every module stays independent — admin only
 * calls their services, never their internals.
 */
export function buildAdminRouter(): Router {
  const admin = Router();

  admin.use(authenticate, authorize('admin:read'), auditLog('admin'));

  admin.use(navAdminRoutes);
  admin.use(metricsAdminRoutes);
  admin.use(usersAdminRoutes);
  admin.use(hostsAdminRoutes);
  admin.use(vehiclesAdminRoutes);
  admin.use(bookingsAdminRoutes);
  admin.use(claimsAdminRoutes);
  admin.use(supportAdminRoutes);
  admin.use(kbAdminRoutes);
  admin.use(couponsAdminRoutes);
  admin.use(taxAdminRoutes);
  admin.use(violationsAdminRoutes);
  admin.use(memberEconomyAdminRoutes);
  admin.use(platformAdminRoutes);
  admin.use(kycAdminRoutes);
  admin.use(platformConfigAdminRoutes);
  admin.use(growthAdminRoutes);
  admin.use(oversightAdminRoutes);

  return admin;
}
