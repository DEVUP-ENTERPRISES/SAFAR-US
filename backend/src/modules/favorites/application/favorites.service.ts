import { FavoriteModel } from '../infrastructure/favorite.model';

/** Read helpers over the wishlist (used by price-drop / availability alerts). */
export class FavoritesService {
  /** Users who have wishlisted a given vehicle. */
  async wishlistersOf(vehicleId: string): Promise<string[]> {
    const favs = await FavoriteModel.find({ vehicleId }).select('userId').lean();
    return favs.map((f) => f.userId);
  }
}

export const favoritesService = new FavoritesService();
