/**
 * Purge test / demo data before a real launch.
 *
 * Years of e2e runs leave behind users, bookings, ledger entries and
 * notifications that make every admin screen look busy with fiction. This
 * clears the transactional history while KEEPING the things that are
 * configuration rather than data.
 *
 * Deliberately NOT destructive by default: run with --dry (the default) to see
 * exactly what would go, and --confirm to actually delete.
 *
 *   node scripts/purge-test-data.js              # report only
 *   node scripts/purge-test-data.js --confirm    # wipe all transactional data
 *   node scripts/purge-test-data.js --confirm --keep-catalog
 *   node scripts/purge-test-data.js --confirm --test-only
 *
 * `--test-only` removes ONLY accounts the e2e suites created (@test.com) and
 * everything belonging to them. Run it after a test run: the suites register a
 * user before they can fail, so even an aborted run leaves an account behind,
 * and those accumulate into a fake-looking admin panel.
 *
 * `--keep-catalog` preserves hosts and vehicles, so you keep a browsable
 * catalogue to develop against while still wiping bookings, money and users.
 */
const path = require('path');
const fs = require('fs');

const CONFIRM = process.argv.includes('--confirm');
const KEEP_CATALOG = process.argv.includes('--keep-catalog');
const TEST_ONLY = process.argv.includes('--test-only');

/** How the e2e suites name the accounts they create. */
const TEST_EMAIL = /@test\.com$/i;
const mongoUri = () => fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^MONGO_URI=(.+)$/m)[1].trim();

/**
 * Configuration the platform needs to run. Wiping these would break the app,
 * not clean it — they are settings a human curated, not data a test produced.
 */
const KEEP_ALWAYS = [
  'platformconfigs',
  'commissionrules',
  'surgerules',
  'subscriptionplans',
  'featureflags',
];

/** Transactional history — the fiction that clutters the admin panel. */
const PURGE = [
  'bookings',
  'availabilities',
  'trips',
  'payments',
  'payouts',
  'ledgerentries',
  'notifications',
  'messages',
  'reviews',
  'claims',
  'tickets',
  'rewardentries',
  'referralconversions',
  'referralcodes',
  'riskevents',
  'devices',
  'kycs',
  'documents',
  'favorites',
  'savedsearches',
  'auditlogs',
  'legalholds',
  'maintenances',
  'paymentmethods',
  'usersubscriptions',
  'couponredemptions',
  'coupons',
  'corporateorgs',
  'corporatemembers',
  'corporatecostcenters',
  'corporatepolicies',
  'corporaterequests',
  'fleets',
];

/** The catalogue — real supply once you have it, seed data until then. */
const CATALOG = ['vehicles', 'hosts'];

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection.db;

  const adminEmail = (fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^ADMIN_EMAIL=(.+)$/m) || [])[1]?.trim();

  console.log(
    `\n${CONFIRM ? 'PURGING' : 'DRY RUN — nothing will be deleted'}${TEST_ONLY ? ' (test accounts only)' : ''}\n`,
  );

  if (TEST_ONLY) {
    const testUsers = await db
      .collection('users')
      .find({ email: TEST_EMAIL }, { projection: { _id: 1 } })
      .toArray();
    const ids = testUsers.map((u) => u._id);
    console.log(`  ${String(ids.length).padStart(6)}  users (@test.com)`);

    if (ids.length === 0) {
      console.log('\n  Nothing to clean.\n');
      await mongoose.disconnect();
      return;
    }

    // Everything those accounts own, by whichever field references them.
    const owned = [
      ['bookings', 'guestId'], ['kycs', 'userId'], ['notifications', 'userId'],
      ['riskevents', 'userId'], ['devices', 'userId'], ['rewardentries', 'userId'],
      ['favorites', 'userId'], ['savedsearches', 'userId'], ['tickets', 'userId'],
      ['paymentmethods', 'userId'], ['usersubscriptions', 'userId'],
      ['referralcodes', 'userId'], ['messages', 'senderId'],
    ];

    let n = ids.length;
    for (const [col, field] of owned) {
      if (!(await db.listCollections({ name: col }).hasNext())) continue;
      const count = await db.collection(col).countDocuments({ [field]: { $in: ids } });
      if (count === 0) continue;
      n += count;
      console.log(`  ${String(count).padStart(6)}  ${col}`);
      if (CONFIRM) await db.collection(col).deleteMany({ [field]: { $in: ids } });
    }
    if (CONFIRM) await db.collection('users').deleteMany({ _id: { $in: ids } });

    console.log(`\n  ${CONFIRM ? 'Deleted' : 'Would delete'}: ${n} documents`);
    console.log(CONFIRM ? '\n  Done.\n' : '\n  Re-run with --confirm to delete.\n');
    await mongoose.disconnect();
    return;
  }

  const targets = [...PURGE, ...(KEEP_CATALOG ? [] : CATALOG)];
  let total = 0;

  for (const name of targets) {
    const exists = await db.listCollections({ name }).hasNext();
    if (!exists) continue;
    const n = await db.collection(name).countDocuments();
    if (n === 0) continue;
    total += n;
    console.log(`  ${String(n).padStart(6)}  ${name}`);
    if (CONFIRM) await db.collection(name).deleteMany({});
  }

  // Users are purged EXCEPT the admin — deleting it locks you out of the panel
  // you are trying to clean.
  const userFilter = adminEmail ? { email: { $ne: adminEmail } } : {};
  const users = await db.collection('users').countDocuments(userFilter);
  if (users > 0) {
    total += users;
    console.log(`  ${String(users).padStart(6)}  users  (keeping ${adminEmail ?? 'no admin found — set ADMIN_EMAIL'})`);
    if (CONFIRM) await db.collection('users').deleteMany(userFilter);
  }

  console.log(`\n  ${CONFIRM ? 'Deleted' : 'Would delete'}: ${total} documents`);
  console.log(`  Kept (configuration): ${KEEP_ALWAYS.join(', ')}`);
  if (KEEP_CATALOG) console.log(`  Kept (catalogue): ${CATALOG.join(', ')}`);
  if (!CONFIRM) console.log('\n  Re-run with --confirm to delete.\n');
  else console.log('\n  Done. Restart the API so cached config is rebuilt.\n');

  await mongoose.disconnect();
})();
