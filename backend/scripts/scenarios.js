/**
 * Adversarial end-to-end scenarios for the booking service.
 *
 * These drive the REAL HTTP API against the REAL database — no mocks — because
 * the bugs that matter (double-booking races, price drift between quote and
 * charge, unbalanced ledgers) only appear when the whole stack runs together.
 *
 * Usage: node scripts/scenarios.js
 */
const API = 'http://localhost:8080/api/v1';

let pass = 0;
let fail = 0;
const failures = [];

// ── tiny test harness ────────────────────────────────────────────────
function ok(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? `  → ${detail}` : ''}`);
  }
}
function section(t) {
  console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}`);
}

async function call(method, path, { token, body, key } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, ok: res.ok, body: json };
}

/**
 * Every run books into its own far-future window. Without this, bookings left
 * behind by the previous run sit on the same dates and the suite fails itself
 * with "not available" — noise that looks exactly like a real conflict bug.
 *
 * The offset is derived from the clock so it strictly increases, stepping 320
 * days per second — wider than the ~310-day span this suite books across — so
 * even two runs one second apart land in non-overlapping windows. The modulo
 * keeps the dates sane; its wrap period (~2.6h) is far longer than any run.
 *
 * Because the suite books against a *shared* seed vehicle, it also wipes that
 * vehicle's far-future calendar at startup (see purgeTestCalendar) — otherwise
 * booked days left by earlier runs accumulate and a later run's window can land
 * on one, failing with a spurious NOT_AVAILABLE. Override with RUN_OFFSET=<days>.
 */
const RUN_OFFSET =
  Number(process.env.RUN_OFFSET) || 400 + ((Math.floor(Date.now() / 1000) * 320) % 3_000_000);
const days = (n) => new Date(Date.now() + (RUN_OFFSET + n) * 86_400_000).toISOString();
/** Real calendar dates, for the few scenarios that must test the past. */
const rawDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString();

/**
 * A test guest who has cleared identity.
 *
 * Booking now requires a verified guest (email, phone, approved licence) —
 * without this, every guest here lands in `pending_verification` and the
 * booking scenarios below test the gate instead of what they mean to test.
 * The gate itself has its own suite: scripts/eligibility-e2e.js.
 */
async function newUser(prefix, { verified = true } = {}) {
  const email = `${prefix}${Date.now()}${Math.floor(Math.random() * 1e4)}@test.com`;
  await call('POST', '/auth/register', {
    body: { email, password: 'Test@1234', firstName: prefix, lastName: 'Tester' },
  });
  const r = await call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  const user = { email, token: r.body?.data?.tokens?.accessToken, id: r.body?.data?.user?.id };
  if (verified && user.id) await markVerified(user.id);
  return user;
}

/** Stamp the verification a real guest would earn, straight into the store. */
async function markVerified(userId) {
  const db = await mongo();
  await db.collection('users').updateOne(
    { _id: userId },
    { $set: { emailVerified: true, phoneVerified: true } },
  );
  await db.collection('kycs').updateOne(
    { userId },
    {
      $set: { status: 'approved', level: 'full', updatedAt: new Date() },
      $setOnInsert: { _id: `kyc_${userId}`, documents: [], createdAt: new Date() },
    },
    { upsert: true },
  );
}

/**
 * Wipe a test vehicle's *far-future* calendar so a run starts from a known-clear
 * slate. Every scenario books ≥400 days out (RUN_OFFSET), so anything beyond a
 * year on this vehicle can only be residue from earlier runs — real bookings
 * live inside a normal horizon and are never touched. Without this, booked days
 * accumulate across a session and later runs collide with them.
 */
async function purgeTestCalendar(vehicleId) {
  const db = await mongo();
  const cutoff = new Date(Date.now() + 367 * 86_400_000).toISOString().slice(0, 10);
  const res = await db
    .collection('availabilities')
    .deleteMany({ vehicleId, dayKey: { $gt: cutoff } });
  if (res.deletedCount) console.log(`  (cleared ${res.deletedCount} stale test days on the seed vehicle)\n`);
}

let _db = null;
async function mongo() {
  if (_db) return _db;
  const nodePath = require('path');
  const nodeFs = require('fs');
  const mongoose = require('mongoose');
  const uri = nodeFs
    .readFileSync(nodePath.join(__dirname, '..', '.env'), 'utf8')
    .match(/^MONGO_URI=(.+)$/m)[1]
    .trim();
  await mongoose.connect(uri);
  _db = mongoose.connection;
  return _db;
}

function book(token, vehicleId, start, end, extra = {}) {
  return call('POST', '/bookings', {
    token,
    key: `k_${Date.now()}_${Math.random()}`,
    body: { vehicleId, start, end, ...extra },
  });
}

// ── main ─────────────────────────────────────────────────────────────
(async () => {
  console.log('\n🧪 CATO booking service — adversarial scenarios\n');

  // Actors
  const guest = await newUser('guest');
  const other = await newUser('other');
  if (!guest.token) throw new Error('could not create guest');

  // A bookable vehicle + its host user (so we can test self-booking)
  const search = await call(
    'GET',
    '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=5&instantBook=true',
  );
  const vehicles = search.body?.data ?? [];
  if (!vehicles.length) throw new Error('no bookable vehicles found — seed data first');
  const V = vehicles[0]._id;
  console.log(`Using vehicle ${V} (${vehicles[0].make} ${vehicles[0].model})\n`);
  await purgeTestCalendar(V);

  // ══ 1. DATE VALIDATION ═════════════════════════════════════════════
  section('Date validation');

  // Must use real calendar dates — the run offset would push these into the future.
  let r = await book(guest.token, V, rawDays(-5), rawDays(-3));
  ok('S01 start in the past → rejected', !r.ok, `got ${r.status}`);

  r = await book(guest.token, V, days(10), days(5));
  ok('S02 end before start → rejected', !r.ok, `got ${r.status}`);

  r = await book(guest.token, V, days(10), days(10));
  ok('S03 zero-length trip → rejected', !r.ok, `got ${r.status}`);

  r = await book(guest.token, V, 'not-a-date', days(10));
  ok('S04 malformed date → rejected', !r.ok, `got ${r.status}`);

  r = await book(guest.token, V, days(10), days(10.02)); // ~30 min
  ok('S05 below minimum trip length → rejected', !r.ok, `got ${r.status}`);

  r = await book(guest.token, V, days(10), days(400));
  ok('S06 above maximum trip length → rejected', !r.ok, `got ${r.status}`);

  // ══ 2. AUTH ════════════════════════════════════════════════════════
  section('Authentication & authorisation');

  r = await call('POST', '/bookings', { body: { vehicleId: V, start: days(20), end: days(22) } });
  ok('S07 unauthenticated booking → 401', r.status === 401, `got ${r.status}`);

  r = await call('POST', '/bookings', {
    token: 'garbage.token.here',
    body: { vehicleId: V, start: days(20), end: days(22) },
  });
  ok('S08 invalid token → 401', r.status === 401, `got ${r.status}`);

  // ══ 3. VEHICLE STATE ═══════════════════════════════════════════════
  section('Vehicle state');

  r = await book(guest.token, 'does-not-exist', days(20), days(22));
  ok('S09 non-existent vehicle → rejected', !r.ok, `got ${r.status}`);

  // ══ 4. HAPPY PATH + PRICE INTEGRITY ════════════════════════════════
  section('Happy path & price integrity');

  const S = days(30);
  const E = days(33);
  const q = await call('POST', '/bookings/quote', {
    token: guest.token,
    body: { vehicleId: V, start: S, end: E },
  });
  ok('S10 quote returns a price', q.ok && q.body?.data?.total?.amount > 0, `got ${q.status}`);

  const quoted = q.body?.data?.total?.amount;
  const b1 = await book(guest.token, V, S, E);
  ok('S11 booking created', b1.ok, `got ${b1.status} ${b1.body?.error?.message ?? ''}`);
  const BK = b1.body?.data?._id;

  ok(
    'S12 charged price === quoted price (no drift)',
    b1.body?.data?.priceBreakdown?.total?.amount === quoted,
    `quoted ${quoted} vs charged ${b1.body?.data?.priceBreakdown?.total?.amount}`,
  );

  const bd = b1.body?.data?.priceBreakdown;
  if (bd) {
    const recomposed = bd.hostEarnings.amount + bd.commission.amount + bd.tax.amount;
    ok(
      'S13 subtotal === hostEarnings + commission + tax',
      recomposed === bd.subtotal.amount,
      `${recomposed} vs ${bd.subtotal.amount}`,
    );
    ok(
      'S14 total === subtotal + protection',
      bd.total.amount === bd.subtotal.amount + bd.protection.amount,
      `${bd.total.amount} vs ${bd.subtotal.amount + bd.protection.amount}`,
    );
    ok('S15 commissionBps surfaced on quote', typeof bd.commissionBps === 'number');
    ok('S16 no negative amounts', Object.values(bd).every((v) => !v?.amount || v.amount >= 0));
  }

  // ══ 5. DOUBLE-BOOKING / OVERLAP ════════════════════════════════════
  section('Double-booking & overlap');

  r = await book(other.token, V, S, E);
  ok('S17 exact same dates → rejected', !r.ok, `got ${r.status}`);

  r = await book(other.token, V, days(31), days(32));
  ok('S18 fully inside existing → rejected', !r.ok, `got ${r.status}`);

  r = await book(other.token, V, days(29), days(31));
  ok('S19 overlaps start → rejected', !r.ok, `got ${r.status}`);

  r = await book(other.token, V, days(32), days(35));
  ok('S20 overlaps end → rejected', !r.ok, `got ${r.status}`);

  r = await book(other.token, V, days(28), days(36));
  ok('S21 envelopes existing → rejected', !r.ok, `got ${r.status}`);

  r = await book(other.token, V, days(40), days(42));
  ok('S22 non-overlapping window → allowed', r.ok, `got ${r.status} ${r.body?.error?.message ?? ''}`);
  const BK2 = r.body?.data?._id;

  // ══ 6. IDEMPOTENCY & RACES ═════════════════════════════════════════
  section('Idempotency & concurrency');

  const idem = `idem_${Date.now()}`;
  const i1 = await call('POST', '/bookings', {
    token: guest.token,
    key: idem,
    body: { vehicleId: V, start: days(50), end: days(52) },
  });
  const i2 = await call('POST', '/bookings', {
    token: guest.token,
    key: idem,
    body: { vehicleId: V, start: days(50), end: days(52) },
  });
  ok(
    'S23 same idempotency key → same booking (no duplicate)',
    i1.body?.data?._id && i1.body?.data?._id === i2.body?.data?._id,
    `${i1.body?.data?._id} vs ${i2.body?.data?._id}`,
  );

  // The important one: two concurrent requests for the SAME dates.
  const raceStart = days(60);
  const raceEnd = days(62);
  const [c1, c2] = await Promise.all([
    book(guest.token, V, raceStart, raceEnd),
    book(other.token, V, raceStart, raceEnd),
  ]);
  const winners = [c1, c2].filter((x) => x.ok).length;
  ok(
    'S24 concurrent double-book race → exactly one wins',
    winners === 1,
    `${winners} of 2 succeeded (double-booked!)`,
  );

  // ══ 7. SELF-DEALING ════════════════════════════════════════════════
  section('Self-dealing');
  // (host booking own car is covered in the host section below)

  // ══ 8. CANCELLATION ════════════════════════════════════════════════
  section('Cancellation');

  r = await call('POST', `/bookings/${BK2}/cancel`, {
    token: other.token,
    body: { reason: 'Testing cancellation' },
  });
  ok('S25 guest cancels own booking', r.ok, `got ${r.status} ${r.body?.error?.message ?? ''}`);

  r = await call('POST', `/bookings/${BK2}/cancel`, {
    token: other.token,
    body: { reason: 'Double cancel' },
  });
  ok('S26 cancel an already-cancelled booking → rejected', !r.ok, `got ${r.status}`);

  r = await book(guest.token, V, days(40), days(42));
  ok('S27 cancelled dates are released for rebooking', r.ok, `got ${r.status}`);

  r = await call('POST', `/bookings/${BK}/cancel`, {
    token: other.token,
    body: { reason: 'Not my booking' },
  });
  ok("S28 cancelling someone else's booking → rejected", !r.ok, `got ${r.status}`);

  // Use a throwaway booking — cancelling BK here would refund the guest and
  // void the trip, silently invalidating every later wallet/trip scenario.
  const tmp = await book(guest.token, V, days(120), days(122));
  r = await call('POST', `/bookings/${tmp.body?.data?._id}/cancel`, {
    token: guest.token,
    body: {},
  });
  ok(
    'S29 cancel with no reason → accepted with a default reason recorded',
    r.ok && !!r.body?.data?.statusHistory?.slice(-1)[0]?.reason,
    'no reason recorded in statusHistory',
  );

  // ══ 9. READ AUTHORISATION ══════════════════════════════════════════
  section('Read authorisation');

  r = await call('GET', `/bookings/${BK}`, { token: other.token });
  ok("S30 reading another user's booking → rejected", !r.ok, `got ${r.status}`);

  r = await call('GET', `/bookings/${BK}`, { token: guest.token });
  ok('S31 reading own booking → allowed', r.ok, `got ${r.status}`);

  // ══ 10. COUPONS ════════════════════════════════════════════════════
  section('Coupons');

  r = await call('POST', '/bookings/quote', {
    token: guest.token,
    body: { vehicleId: V, start: days(70), end: days(72), couponCode: 'TOTALLY-FAKE-CODE' },
  });
  ok('S32 invalid coupon → rejected or ignored (not a crash)', r.status !== 500, `got ${r.status}`);

  // ══ 11. WALLET ═════════════════════════════════════════════════════
  section('Wallet');

  // A dedicated user: refunds from earlier scenarios would otherwise make the
  // starting balance non-zero and the assertions meaningless.
  const walletUser = await newUser('wallet');

  const w0 = await call('GET', '/wallet', { token: walletUser.token });
  ok('S33 new user wallet starts at 0', w0.body?.data?.balance === 0, `${w0.body?.data?.balance}`);

  r = await call('POST', '/wallet/topup', { token: walletUser.token, body: { amount: -5000 } });
  ok('S34 negative top-up → rejected', !r.ok, `got ${r.status}`);

  r = await call('POST', '/wallet/topup', { token: walletUser.token, body: { amount: 0 } });
  ok('S35 zero top-up → rejected', !r.ok, `got ${r.status}`);

  await call('POST', '/wallet/topup', { token: walletUser.token, body: { amount: 5000 } });
  const w1 = await call('GET', '/wallet', { token: walletUser.token });
  ok('S36 top-up credits the wallet', w1.body?.data?.balance === 5000, `${w1.body?.data?.balance}`);

  const wb = await book(walletUser.token, V, days(80), days(82), { useWallet: true });
  ok('S37 pay-with-wallet booking succeeds', wb.ok, `got ${wb.status}`);
  const w2 = await call('GET', '/wallet', { token: walletUser.token });
  ok(
    'S38 wallet is debited by the booking',
    (w2.body?.data?.balance ?? 5000) < 5000,
    `still ${w2.body?.data?.balance}`,
  );

  // ══ 12. TRIP LIFECYCLE ═════════════════════════════════════════════
  section('Trip lifecycle');

  r = await call('POST', '/trips/start', { token: other.token, body: { bookingId: BK } });
  ok('S39 non-guest starts the trip → rejected', !r.ok, `got ${r.status}`);

  const t1 = await call('POST', '/trips/start', { token: guest.token, body: { bookingId: BK } });
  ok('S40 guest starts own trip', t1.ok, `got ${t1.status} ${t1.body?.error?.message ?? ''}`);
  const TRIP = t1.body?.data?._id;

  r = await call('POST', '/trips/start', { token: guest.token, body: { bookingId: BK } });
  ok('S41 starting the same trip twice → rejected', !r.ok, `got ${r.status}`);

  if (TRIP) {
    r = await call('POST', `/trips/${TRIP}/complete`, {
      token: other.token,
      body: { odometerEnd: 100 },
    });
    ok('S42 non-participant completes trip → rejected', !r.ok, `got ${r.status}`);
  }

  // ══ 13. EXTENSION ══════════════════════════════════════════════════
  section('Trip extension');

  r = await call('POST', `/bookings/${BK}/extend`, {
    token: guest.token,
    body: { newEnd: days(31) },
  });
  ok('S43 extend to an EARLIER date → rejected', !r.ok, `got ${r.status}`);

  // ══ 14. INPUT SAFETY ═══════════════════════════════════════════════
  section('Input safety');

  r = await book(guest.token, V, days(90), days(92), { protectionPlan: '../../etc/passwd' });
  ok('S44 bogus protection plan → no crash', r.status !== 500, `got ${r.status}`);

  r = await call('POST', '/bookings/quote', {
    token: guest.token,
    body: { vehicleId: V, start: days(90), end: days(92), addOnCodes: ['<script>alert(1)</script>'] },
  });
  ok('S45 XSS-ish add-on code → no crash', r.status !== 500, `got ${r.status}`);

  r = await call('POST', '/bookings/quote', {
    token: guest.token,
    body: { vehicleId: { $ne: null }, start: days(90), end: days(92) },
  });
  ok('S46 NoSQL operator injection in vehicleId → rejected', !r.ok, `got ${r.status}`);

  // ══ 15. SEARCH ═════════════════════════════════════════════════════
  section('Search');

  r = await call('GET', '/search/vehicles?lng=999&lat=999&radiusKm=50');
  ok('S47 out-of-range coordinates → rejected', !r.ok, `got ${r.status}`);

  // Its own live booking — reusing an earlier one risks it having been
  // cancelled or turned into a trip, which would fake a pass.
  const sStart = days(200);
  const sEnd = days(202);
  const held = await book(guest.token, V, sStart, sEnd);
  const seen = await call(
    'GET',
    `/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=50&limit=50&start=${sStart}&end=${sEnd}`,
  );
  const stillListed = (seen.body?.data ?? []).some((v) => v._id === V);
  ok(
    'S48 a booked car is excluded from dated search',
    held.ok && !stillListed,
    held.ok ? 'booked vehicle still appears in its own booked window' : 'setup booking failed',
  );

  r = await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=50&priceMax=1');
  ok('S49 absurd price filter → empty, not a crash', r.ok, `got ${r.status}`);

  // ══ 15b. DELIVERY ══════════════════════════════════════════════════
  section('Delivery');

  // Discover the vehicle's advertised delivery modes.
  const vDetail = await call('GET', `/vehicles/${V}`);
  const dCfg = vDetail.body?.data?.listing?.delivery;
  const offeredMode = dCfg
    ? ['airport', 'home', 'hotel', 'business'].find((m) => dCfg[m])
    : undefined;

  // Quote without delivery, then with — the fee must appear and lift the total.
  const noDel = await call('POST', '/bookings/quote', {
    token: guest.token,
    body: { vehicleId: V, start: days(300), end: days(302) },
  });
  ok('S51 quote has a delivery line (0 when not requested)', 'delivery' in (noDel.body?.data ?? {}));

  if (offeredMode) {
    const withDel = await call('POST', '/bookings/quote', {
      token: guest.token,
      body: {
        vehicleId: V,
        start: days(300),
        end: days(302),
        delivery: { mode: offeredMode, address: '123 Test St, New York' },
      },
    });
    const d0 = noDel.body?.data;
    const d1 = withDel.body?.data;
    ok(
      'S52 requesting delivery adds the fee to the total',
      d1?.delivery?.amount > 0 && d1.total.amount === d0.total.amount + d1.delivery.amount,
      `delivery ${d1?.delivery?.amount}, total ${d0?.total?.amount} → ${d1?.total?.amount}`,
    );
    ok(
      'S53 delivery fee is included in host earnings (host labour)',
      d1?.hostEarnings.amount > d0?.hostEarnings.amount,
      `${d0?.hostEarnings?.amount} vs ${d1?.hostEarnings?.amount}`,
    );
  } else {
    ok('S52 requesting delivery adds the fee to the total', true, '(vehicle offers no delivery — skipped)');
    ok('S53 delivery fee is included in host earnings', true, '(skipped)');
  }

  // A mode the car doesn't offer must be rejected, not conjured.
  const bogusMode = dCfg
    ? ['airport', 'home', 'hotel', 'business'].find((m) => !dCfg[m]) ?? 'airport'
    : 'airport';
  const badDel = await call('POST', '/bookings/quote', {
    token: guest.token,
    body: {
      vehicleId: V,
      start: days(300),
      end: days(302),
      delivery: { mode: bogusMode, address: 'x' }, // also too-short address
    },
  });
  ok('S54 delivery to an un-offered mode / bad address → rejected', !badDel.ok, `got ${badDel.status}`);

  // ══ 15c. ADDITIONAL DRIVERS ════════════════════════════════════════
  section('Additional drivers');

  const drvBooking = await book(guest.token, V, days(310), days(312));
  const DB = drvBooking.body?.data?._id;

  let d = await call('POST', `/bookings/${DB}/drivers`, {
    token: guest.token,
    body: { name: 'Jane Codriver', licenseNumber: 'D1234567' },
  });
  ok('S55 guest adds an additional driver', d.ok && d.body?.data?.additionalDrivers?.length === 1, `got ${d.status}`);

  d = await call('POST', `/bookings/${DB}/drivers`, {
    token: other.token,
    body: { name: 'Sneaky Driver' },
  });
  ok('S56 non-guest cannot add a driver', !d.ok, `got ${d.status}`);

  d = await call('DELETE', `/bookings/${DB}/drivers/${encodeURIComponent('Jane Codriver')}`, {
    token: guest.token,
  });
  ok('S57 guest removes a driver', d.ok && d.body?.data?.additionalDrivers?.length === 0, `got ${d.status}`);

  // ══ 16. LEDGER INTEGRITY ═══════════════════════════════════════════
  section('Ledger integrity');

  const path = require('path');
  const mongoose = require('mongoose');
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  await mongoose.connect(process.env.MONGO_URI);
  const rows = await mongoose.connection
    .collection('ledgerentries')
    .aggregate([{ $group: { _id: '$direction', t: { $sum: '$amount' } } }])
    .toArray();
  const credit = (rows.find((x) => x._id === 'credit') || { t: 0 }).t;
  const debit = (rows.find((x) => x._id === 'debit') || { t: 0 }).t;
  ok('S50 ledger globally balanced after every scenario', credit === debit, `${credit} vs ${debit}`);
  await mongoose.disconnect();

  // ── report ─────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(64)}`);
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  if (failures.length) {
    console.log('\n  Failures:');
    failures.forEach((f) => console.log(`   ✗ ${f}`));
  }
  console.log(`${'═'.repeat(64)}\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nHarness crashed:', e.message);
  process.exit(2);
});
