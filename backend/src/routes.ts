import { Router } from 'express';
import { systemRoutes } from './modules/system/system.routes';
import { authRoutes } from './modules/auth/api/auth.routes';
import { usersRoutes } from './modules/users/api/users.routes';
import { hostsRoutes } from './modules/hosts/api/hosts.routes';
import { vehiclesRoutes } from './modules/vehicles/api/vehicles.routes';
import { searchRoutes } from './modules/search/api/search.routes';
import { bookingsRoutes } from './modules/bookings/api/bookings.routes';
import { tripsRoutes } from './modules/trips/api/trips.routes';
import { walletRoutes } from './modules/wallet/api/wallet.routes';
import { subscriptionsRoutes } from './modules/subscriptions/api/subscriptions.routes';
import { paymentsRoutes } from './modules/payments/api/payments.routes';
import { payoutsRoutes } from './modules/payouts/api/payouts.routes';
import { reviewsRoutes } from './modules/reviews/api/reviews.routes';
import { notificationsRoutes } from './modules/notifications/api/notifications.routes';
import { mediaRoutes } from './modules/media/api/media.routes';
import { documentsRoutes } from './modules/documents/api/documents.routes';
import { earningsRoutes } from './modules/earnings/api/earnings.routes';
import { fleetRoutes } from './modules/fleet/api/fleet.routes';
import { maintenanceRoutes } from './modules/maintenance/api/maintenance.routes';
import { favoritesRoutes } from './modules/favorites/api/favorites.routes';
import { messagesRoutes } from './modules/messaging/api/messages.routes';
import { claimsRoutes } from './modules/claims/api/claims.routes';
import { supportRoutes } from './modules/support/api/support.routes';
import { buildAdminRouter } from './modules/admin/admin.routes';
import { featureFlagsRoutes } from './modules/feature-flags/api/feature-flags.routes';
import { kycRoutes } from './modules/kyc/api/kyc.routes';
import { mapsRoutes } from './modules/maps/api/maps.routes';
import { corporateRoutes } from './modules/corporate/api/corporate.routes';
import { rewardsRoutes } from './modules/rewards/api/rewards.routes';
import { referralRoutes } from './modules/referral/api/referral.routes';

/**
 * Mounts every module's router under the versioned API prefix.
 * Adding a module = registering its router here.
 */
export function buildApiRouter(): Router {
  const api = Router();

  api.use('/system', systemRoutes);
  api.use('/auth', authRoutes);
  api.use('/users', usersRoutes);
  api.use('/hosts', hostsRoutes);
  api.use('/vehicles', vehiclesRoutes);
  api.use('/search', searchRoutes);
  api.use('/bookings', bookingsRoutes);
  api.use('/trips', tripsRoutes);
  api.use('/wallet', walletRoutes);
  api.use('/subscriptions', subscriptionsRoutes);
  api.use('/payments', paymentsRoutes);
  api.use('/payouts', payoutsRoutes);
  api.use('/reviews', reviewsRoutes);
  api.use('/notifications', notificationsRoutes);
  api.use('/media', mediaRoutes);
  api.use('/documents', documentsRoutes);
  api.use('/earnings', earningsRoutes);
  api.use('/fleets', fleetRoutes);
  api.use('/maintenance', maintenanceRoutes);
  api.use('/favorites', favoritesRoutes);
  api.use('/messages', messagesRoutes);
  api.use('/claims', claimsRoutes);
  api.use('/support', supportRoutes);
  api.use('/kyc', kycRoutes);
  api.use('/maps', mapsRoutes);
  api.use('/feature-flags', featureFlagsRoutes);
  api.use('/corporate', corporateRoutes);
  api.use('/rewards', rewardsRoutes);
  api.use('/referral', referralRoutes);
  api.use('/admin', buildAdminRouter());

  return api;
}
