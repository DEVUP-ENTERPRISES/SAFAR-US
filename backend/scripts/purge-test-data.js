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
 *   node scripts/purge-test-data.js            # report only
 *   node scripts/purge-test-data.js --confirm  # actually delete
 *   node scripts/purge-test-data.js --confirm --keep-catalog
 *
 * `--keep-catalog` preserves hosts and vehicles, so you keep a browsable
 * catalogue to develop against while still wiping bookings, money and users.
 */
const path = require('path');
const fs = require('fs');

const CONFIRM = process.argv.includes('--confirm');
const KEEP_CATALOG = process.argv.includes('--keep-catalog');
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

  console.log(`\n${CONFIRM ? 'PURGING' : 'DRY RUN — nothing will be deleted'}\n`);

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
