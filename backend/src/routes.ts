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
import { payoutsRoutes } from './modules/payouts/api/payouts.routes';
import { reviewsRoutes } from './modules/reviews/api/reviews.routes';
import { notificationsRoutes } from './modules/notifications/api/notifications.routes';
import { mediaRoutes } from './modules/media/api/media.routes';
import { documentsRoutes } from './modules/documents/api/documents.routes';
import { earningsRoutes } from './modules/earnings/api/earnings.routes';
import { fleetRoutes } from './modules/fleet/api/fleet.routes';
import { maintenanceRoutes } from './modules/maintenance/api/maintenance.routes';
import { favoritesRoutes } from './modules/favorites/api/favorites.routes';

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
  api.use('/payouts', payoutsRoutes);
  api.use('/reviews', reviewsRoutes);
  api.use('/notifications', notificationsRoutes);
  api.use('/media', mediaRoutes);
  api.use('/documents', documentsRoutes);
  api.use('/earnings', earningsRoutes);
  api.use('/fleets', fleetRoutes);
  api.use('/maintenance', maintenanceRoutes);
  api.use('/favorites', favoritesRoutes);

  return api;
}
