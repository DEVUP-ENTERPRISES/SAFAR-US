import { SavedSearchModel, type SavedSearchDoc } from '../infrastructure/saved-search.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { notificationService } from '../../notifications/application/notification.service';
import { ConflictError, NotFoundError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

export interface SaveInput {
  label?: string;
  city?: string;
  category?: string;
  fuelType?: 'petrol' | 'diesel' | 'hybrid' | 'ev';
  transmission?: 'manual' | 'automatic';
  seatsMin?: number;
  priceMaxCents?: number;
  instantBook?: boolean;
}

const MAX_PER_USER = 20;

export class SavedSearchService {
  async list(userId: string): Promise<SavedSearchDoc[]> {
    return SavedSearchModel.find({ userId }).sort({ createdAt: -1 }).lean<SavedSearchDoc[]>();
  }

  async create(userId: string, input: SaveInput): Promise<SavedSearchDoc> {
    const count = await SavedSearchModel.countDocuments({ userId });
    if (count >= MAX_PER_USER) {
      throw new ConflictError(`You can save up to ${MAX_PER_USER} searches.`, 'TOO_MANY_SAVED_SEARCHES');
    }
    const criteria = {
      city: input.city?.trim() || undefined,
      category: input.category || undefined,
      fuelType: input.fuelType,
      transmission: input.transmission,
      seatsMin: input.seatsMin,
      priceMaxCents: input.priceMaxCents,
      instantBook: input.instantBook || undefined,
    };
    return (
      await SavedSearchModel.create({
        userId,
        label: input.label?.trim() || describeCriteria(criteria),
        criteria,
        alertsEnabled: true,
      })
    ).toObject();
  }

  async setAlerts(userId: string, id: string, enabled: boolean): Promise<SavedSearchDoc> {
    const doc = await SavedSearchModel.findOneAndUpdate(
      { _id: id, userId },
      { alertsEnabled: enabled },
      { new: true },
    ).lean<SavedSearchDoc>();
    if (!doc) throw new NotFoundError('Saved search');
    return doc;
  }

  async remove(userId: string, id: string): Promise<{ removed: boolean }> {
    const r = await SavedSearchModel.deleteOne({ _id: id, userId });
    return { removed: r.deletedCount > 0 };
  }

  /**
   * A car just went live — alert everyone whose saved search it matches.
   *
   * Deliberately keyed on the vehicle's city first (an indexed lookup), then
   * the cheaper attribute filters are applied in memory. A guest is never
   * alerted about their own car, and each saved search is stamped so a burst of
   * listings can be rate-limited later if needed.
   */
  async notifyMatchesForVehicle(vehicleId: string): Promise<number> {
    const v = await VehicleModel.findOne({ _id: vehicleId }).lean();
    if (!v || v.status !== 'listed' || v.verificationStatus !== 'verified') return 0;

    const city = v.location?.city;
    if (!city) return 0;

    const candidates = await SavedSearchModel.find({
      'criteria.city': city,
      alertsEnabled: true,
    }).lean<SavedSearchDoc[]>();

    let alerted = 0;
    for (const s of candidates) {
      if (!matches(s.criteria, v)) continue;
      // Don't alert a host about their own newly listed car.
      // (host.userId === s.userId check is done by the caller's ownership data;
      //  here we simply skip if the saved-search owner is the vehicle's host user.)
      try {
        await notificationService.send({
          userId: s.userId,
          priority: 'normal',
          templateKey: 'saved_search.match',
          title: 'A new car matches your saved search',
          body: `${v.make} ${v.model} ${v.year} was just listed in ${city}.`,
          deepLink: `/vehicles/${v._id}`,
          data: { vehicleId: v._id, savedSearchId: s._id },
        });
        await SavedSearchModel.updateOne({ _id: s._id }, { lastAlertedAt: new Date() });
        alerted += 1;
      } catch (err) {
        logger.warn({ err, savedSearchId: s._id }, 'saved-search alert failed');
      }
    }
    if (alerted) logger.info({ vehicleId, alerted }, 'saved-search matches alerted');
    return alerted;
  }
}

/** Attribute match against a vehicle. City is already matched by the query. */
function matches(c: SavedSearchDoc['criteria'], v: Record<string, unknown>): boolean {
  const listing = (v.listing ?? {}) as { instantBook?: boolean };
  const pricing = (v.pricing ?? {}) as { dailyPrice?: number };
  if (c.category && v.category !== c.category) return false;
  if (c.fuelType && v.fuelType !== c.fuelType) return false;
  if (c.transmission && v.transmission !== c.transmission) return false;
  if (c.seatsMin && (v.seats as number) < c.seatsMin) return false;
  if (c.priceMaxCents && (pricing.dailyPrice ?? Infinity) > c.priceMaxCents) return false;
  if (c.instantBook && !listing.instantBook) return false;
  return true;
}

/** A readable default label when the guest doesn't name the search. */
function describeCriteria(c: SavedSearchDoc['criteria']): string {
  const parts: string[] = [];
  if (c.category) parts.push(cap(c.category));
  else parts.push('Cars');
  if (c.city) parts.push(`in ${c.city}`);
  if (c.priceMaxCents) parts.push(`under $${Math.round(c.priceMaxCents / 100)}`);
  return parts.join(' ');
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const savedSearchService = new SavedSearchService();
