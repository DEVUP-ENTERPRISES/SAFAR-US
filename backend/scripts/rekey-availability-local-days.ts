/*
 * One-time: move upcoming trips' calendar rows from UTC dates to the car's local dates.
 *
 * Trips used to occupy UTC calendar days, so an evening pickup in Texas sat on
 * the next day. New trips now use the car's local days; this re-keys the rows
 * of trips that have not ended yet so old and new rows agree.
 *
 * Host blocks are left alone (they were always the dates the host picked).
 * A trip whose new days would collide with another row is skipped and listed,
 * never forced. Idempotent: an already-correct trip is skipped. Pass --dry to
 * print the plan only.
 *
 * Usage: ts-node scripts/rekey-availability-local-days.ts [--dry]
 */
import { connectMongo, disconnectMongo } from '../src/infrastructure/database/mongoose.client';
import { AvailabilityModel, type AvailabilityDoc } from '../src/modules/availability/infrastructure/availability.model';
import { BookingModel } from '../src/modules/bookings/infrastructure/booking.model';
import { availabilityService } from '../src/modules/availability/application/availability.service';

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry');
  await connectMongo();

  const bookings = await BookingModel.find(
    { 'period.end': { $gte: new Date() } },
    { vehicleId: 1, holdId: 1, period: 1, status: 1 },
  ).lean();

  let moved = 0;
  let unchanged = 0;
  const skipped: string[] = [];

  for (const b of bookings) {
    const owner = { $or: [{ bookingId: b._id }, ...(b.holdId ? [{ holdId: b.holdId }] : [])] };
    const rows = await AvailabilityModel.find({ ...owner, state: { $in: ['booked', 'held'] } }).lean<AvailabilityDoc[]>();
    if (rows.length === 0) continue;

    const want = await availabilityService.tripDayKeys(b.vehicleId, b.period.start, b.period.end);
    const have = new Set(rows.map((r) => r.dayKey));
    const add = want.filter((k) => !have.has(k));
    const drop = rows.filter((r) => !want.includes(r.dayKey));
    if (add.length === 0 && drop.length === 0) {
      unchanged++;
      continue;
    }

    const clash = await AvailabilityModel.find({ vehicleId: b.vehicleId, dayKey: { $in: add } }, { dayKey: 1, state: 1 }).lean();
    if (clash.length > 0) {
      skipped.push(`${b._id} (${b.status}): ${clash.map((c) => `${c.dayKey} ${c.state}`).join(', ')}`);
      continue;
    }

    // eslint-disable-next-line no-console
    console.log(`${dry ? '[dry] ' : ''}${b._id} (${b.status}): +[${add.join(', ')}] -[${drop.map((r) => r.dayKey).join(', ')}]`);
    if (dry) {
      moved++;
      continue;
    }

    const template = rows[0];
    const fresh = add.map((dayKey) => ({
      vehicleId: b.vehicleId,
      dayKey,
      state: template.state,
      ...(template.bookingId ? { bookingId: template.bookingId } : {}),
      ...(template.holdId ? { holdId: template.holdId } : {}),
      ...(template.holdExpiresAt ? { holdExpiresAt: template.holdExpiresAt } : {}),
    }));
    try {
      if (fresh.length) await AvailabilityModel.insertMany(fresh, { ordered: true });
    } catch (err) {
      await AvailabilityModel.deleteMany({ vehicleId: b.vehicleId, dayKey: { $in: add }, ...owner });
      skipped.push(`${b._id} (${b.status}): insert failed, ${(err as Error).message}`);
      continue;
    }
    await AvailabilityModel.deleteMany({ _id: { $in: drop.map((r) => r._id) } });
    moved++;
  }

  // eslint-disable-next-line no-console
  console.log(`${dry ? 'would move' : 'moved'}: ${moved}, already correct: ${unchanged}, skipped: ${skipped.length}`);
  // eslint-disable-next-line no-console
  for (const s of skipped) console.log('  skipped', s);
  await disconnectMongo();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
