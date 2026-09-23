/*
 * One-time: convert the flat delivery block to the delivery-locations list.
 *
 * Old shape carried four booleans sharing a single fee. Each enabled mode
 * becomes its own location at that same fee, so no guest's price changes and
 * no host silently starts offering something they had switched off.
 *
 * Idempotent: a vehicle that already has locations is skipped, so a re-run
 * after a partial failure is safe. Pass --dry to print the plan only.
 *
 * Usage: ts-node scripts/migrate-delivery-locations.ts [--dry]
 */
import { connectMongo, disconnectMongo } from '../src/infrastructure/database/mongoose.client';
import { VehicleModel, type DeliveryLocation } from '../src/modules/vehicles/infrastructure/vehicle.model';
import { uuid } from '../src/shared/utils/uuid';

const KIND_BY_MODE: Record<string, { kind: DeliveryLocation['kind']; name: string }> = {
  airport: { kind: 'airport', name: 'Airport delivery' },
  hotel: { kind: 'hotel', name: 'Hotel delivery' },
  business: { kind: 'business', name: 'Business delivery' },
  home: { kind: 'custom', name: 'Guest address' },
};

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry');
  await connectMongo();

  const vehicles = await VehicleModel.find({
    deletedAt: null,
    'listing.deliveryLocations': { $in: [null, []] },
  })
    .select('_id make model listing.delivery location')
    .lean();

  let converted = 0;
  let skipped = 0;

  for (const v of vehicles) {
    const d = v.listing?.delivery;
    const modes = d ? Object.keys(KIND_BY_MODE).filter((m) => (d as Record<string, unknown>)[m]) : [];
    if (!modes.length) {
      skipped += 1;
      continue;
    }

    const locations: DeliveryLocation[] = modes.map((mode) => {
      const { kind, name } = KIND_BY_MODE[mode];
      return {
        id: uuid(),
        kind,
        name,
        address: kind === 'custom' ? '' : v.location?.address || '',
        fee: d?.fee ?? 0,
        minTripDays: 0,
        accessMethod: 'in_person',
        // The old radius was km on one shared field; custom delivery is the
        // only kind that used it, and the new field is miles.
        ...(kind === 'custom'
          ? { radiusMiles: Math.max(1, Math.round((d?.radiusKm ?? 0) * 0.621371)) || 20 }
          : {}),
        enabled: true,
      };
    });

    // eslint-disable-next-line no-console
    console.log(`${v._id} ${v.make} ${v.model}: ${modes.join(', ')} -> ${locations.length} location(s) @ ${d?.fee ?? 0}`);

    if (!dry) {
      await VehicleModel.updateOne({ _id: v._id }, { $set: { 'listing.deliveryLocations': locations } });
    }
    converted += 1;
  }

  // eslint-disable-next-line no-console
  console.log(`\n${dry ? '[dry run] would convert' : 'converted'}: ${converted}, skipped (no delivery offered): ${skipped}`);
  await disconnectMongo();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
