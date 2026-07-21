/**
 * Reports pre-USA-launch leftovers still in the database: listings priced in a
 * non-USD currency, and photos pointing at the picsum placeholder service
 * rather than our own storage.
 *
 * Read-only by default. Pass --fix to delete the affected DRAFT listings (only
 * drafts — anything live or booked is reported and left alone).
 *
 * Run: node scripts/legacy-audit.js [--fix]
 */
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

function mongoUri() {
  const envPath = path.join(__dirname, '..', '.env');
  const m = fs.readFileSync(envPath, 'utf8').match(/^MONGO_URI=(.+)$/m);
  if (!m) throw new Error('MONGO_URI not found in backend/.env');
  return m[1].trim();
}

const FIX = process.argv.includes('--fix');

(async () => {
  await mongoose.connect(mongoUri());
  const vehicles = mongoose.connection.collection('vehicles');
  const bookings = mongoose.connection.collection('bookings');

  const suspect = await vehicles
    .find({
      $or: [
        { 'pricing.currency': { $ne: 'USD' } },
        { 'photos.url': { $regex: 'picsum\\.photos' } },
      ],
    })
    .toArray();

  if (suspect.length === 0) {
    console.log('\nNo legacy listings found. Nothing to do.\n');
    await mongoose.disconnect();
    return;
  }

  console.log(`\n${suspect.length} legacy listing(s) found:\n`);
  const deletable = [];
  for (const v of suspect) {
    const trips = await bookings.countDocuments({ vehicleId: v._id });
    const reasons = [];
    if (v.pricing?.currency !== 'USD') reasons.push(`currency=${v.pricing?.currency}`);
    if ((v.photos ?? []).some((p) => /picsum\.photos/.test(p.url ?? ''))) reasons.push('placeholder photos');

    const safe = v.status === 'draft' && trips === 0;
    if (safe) deletable.push(v._id);

    console.log(
      `  ${v._id}\n` +
        `    ${v.make} ${v.model} ${v.year} - ${v.location?.city ?? '?'} - status=${v.status}\n` +
        `    ${reasons.join(', ')}; bookings=${trips}\n` +
        `    ${safe ? 'SAFE TO DELETE (draft, never booked)' : 'KEEP - live or has bookings; fix by hand'}`,
    );
  }

  if (!FIX) {
    console.log(
      `\n${deletable.length} of ${suspect.length} can be deleted safely.` +
        '\nRe-run with --fix to delete those. Nothing was changed.\n',
    );
    await mongoose.disconnect();
    return;
  }

  if (deletable.length === 0) {
    console.log('\nNothing safe to delete. No changes made.\n');
    await mongoose.disconnect();
    return;
  }

  const res = await vehicles.deleteMany({ _id: { $in: deletable } });
  console.log(`\nDeleted ${res.deletedCount} draft listing(s).\n`);
  await mongoose.disconnect();
})();
