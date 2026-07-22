/**
 * Price lock and turnaround buffers.
 *
 * The quote was recomputed at booking time, so a surge rule activating in the
 * seconds between "see price" and "confirm" silently charged the guest more
 * than the screen showed. That window is small, which is exactly why it never
 * shows up in manual testing and is corrosive in production.
 *
 * Run: node scripts/pricing-e2e.js
 */
const path = require('path');
const fs = require('fs');

const API = process.env.API || 'http://127.0.0.1:8080/api/v1';
const ADMIN = { email: 'admin@cato.com', password: 'Cato@Admin2026' };

let pass = 0;
let fail = 0;
const ok = (n, c, d = '') => {
  if (c) {
    pass += 1;
    console.log(`  [PASS] ${n}`);
  } else {
    fail += 1;
    console.log(`  [FAIL] ${n}${d ? `  -> ${d}` : ''}`);
  }
};
const section = (t) => console.log(`\n-- ${t} ${'-'.repeat(Math.max(0, 52 - t.length))}`);

async function call(method, p, { token, body, key } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(`${API}${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, ok: res.ok, body: json };
}

const mongoUri = () =>
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^MONGO_URI=(.+)$/m)[1].trim();

const RUN = 1400 + ((Math.floor(Date.now() / 1000) * 40) % 900_000);
/**
 * Anchored once, not re-read per call. A price lock is signed over the exact
 * timestamps it was quoted for, so a client that regenerates "now + 2 days"
 * between quoting and booking produces different instants and its own lock
 * stops matching — which is correct behaviour, and was a bug in this suite.
 */
const NOW = Date.now();
const day = (n) => new Date(NOW + (RUN + n) * 864e5).toISOString();

async function verifiedGuest(db, prefix) {
  const email = `${prefix}${Date.now()}${Math.floor(Math.random() * 1e4)}@test.com`;
  await call('POST', '/auth/register', {
    body: { email, password: 'Test@1234', firstName: prefix, lastName: 'T' },
  });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  const id = (await login()).body.data.user.id;
  await db.collection('users').updateOne(
    { _id: id },
    { $set: { emailVerified: true, phoneVerified: true } },
  );
  await db.collection('kycs').updateOne(
    { userId: id },
    {
      $set: { status: 'approved', level: 'full', updatedAt: new Date() },
      $setOnInsert: { _id: `kyc_${id}`, documents: [], createdAt: new Date() },
    },
    { upsert: true },
  );
  return { id, email, token: (await login()).body.data.tokens.accessToken };
}

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;

  console.log('\nPricing: price lock and turnaround\n');

  const guest = await verifiedGuest(db, 'price');
  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body.data.tokens.accessToken;
  const cars = (
    await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=5&instantBook=true')
  ).body.data;
  const car = cars[0];

  section('A quote hands back a signed lock');
  const q = await call('POST', '/bookings/quote', {
    token: guest.token,
    body: { vehicleId: car._id, start: day(2), end: day(4) },
  });
  ok('quote succeeds', q.ok, `${q.status}`);
  const lock = q.body?.data?.priceLock;
  ok('it carries a price lock', !!lock, JSON.stringify(Object.keys(q.body?.data ?? {})));
  ok('the lock is signed', typeof lock?.signature === 'string' && lock.signature.length === 64);
  ok('the lock expires', typeof lock?.expiresAt === 'number' && lock.expiresAt > Date.now());
  ok('the locked total matches the quote', lock.total === q.body.data.total.amount);

  section('The locked price is honoured');
  const booked = await call('POST', '/bookings', {
    token: guest.token,
    key: `pl${Date.now()}`,
    body: { vehicleId: car._id, start: day(2), end: day(4), priceLock: lock },
  });
  ok('booking with a valid lock succeeds', booked.status === 201, `${booked.status}`);
  ok('and charges exactly the quoted total',
    booked.body?.data?.priceBreakdown?.total?.amount === lock.total,
    `${booked.body?.data?.priceBreakdown?.total?.amount} vs ${lock.total}`);

  section('A tampered lock is refused');
  const q2 = await call('POST', '/bookings/quote', {
    token: guest.token,
    body: { vehicleId: car._id, start: day(10), end: day(12) },
  });
  const lock2 = q2.body.data.priceLock;

  const cheaper = await call('POST', '/bookings', {
    token: guest.token,
    key: `t1${Date.now()}`,
    body: {
      vehicleId: car._id,
      start: day(10),
      end: day(12),
      priceLock: { ...lock2, total: 1 }, // "I'd like to pay one cent, please"
    },
  });
  ok('a lock with an edited total is refused', cheaper.status === 403, `${cheaper.status}`);

  const forged = await call('POST', '/bookings', {
    token: guest.token,
    key: `t2${Date.now()}`,
    body: {
      vehicleId: car._id,
      start: day(10),
      end: day(12),
      priceLock: { ...lock2, signature: 'f'.repeat(64) },
    },
  });
  ok('a forged signature is refused', forged.status === 403, `${forged.status}`);

  const reused = await call('POST', '/bookings', {
    token: guest.token,
    key: `t3${Date.now()}`,
    // Same signed lock, different dates — a cheap week reused on a peak one.
    body: { vehicleId: car._id, start: day(200), end: day(202), priceLock: lock2 },
  });
  ok('a lock replayed on other dates is refused',
    reused.status === 409 && reused.body?.error?.code === 'PRICE_LOCK_STALE',
    `${reused.status} ${JSON.stringify(reused.body?.error ?? '')}`);

  section('A price rise between quote and confirm is caught');
  const q3 = await call('POST', '/bookings/quote', {
    token: guest.token,
    body: { vehicleId: car._id, start: day(20), end: day(22) },
  });
  const lock3 = q3.body.data.priceLock;

  // The host raises their rate in the seconds after the guest saw the price.
  const original = (await db.collection('vehicles').findOne({ _id: car._id })).pricing.dailyPrice;
  await db.collection('vehicles').updateOne(
    { _id: car._id },
    { $set: { 'pricing.dailyPrice': original * 2 } },
  );

  const raised = await call('POST', '/bookings', {
    token: guest.token,
    key: `pr${Date.now()}`,
    body: { vehicleId: car._id, start: day(20), end: day(22), priceLock: lock3 },
  });
  ok('the booking is stopped rather than silently overcharged',
    raised.status === 409 && raised.body?.error?.code === 'PRICE_CHANGED',
    `${raised.status} ${JSON.stringify(raised.body?.error ?? '')}`);

  // A price DROP must not block the guest — they simply pay less. Quote at the
  // higher price first, so the lock is genuinely dearer than the final charge.
  const q4 = await call('POST', '/bookings/quote', {
    token: guest.token,
    body: { vehicleId: car._id, start: day(30), end: day(32) },
  });
  const lock4 = q4.body.data.priceLock;

  await db.collection('vehicles').updateOne(
    { _id: car._id },
    { $set: { 'pricing.dailyPrice': Math.round(original / 2) } },
  );
  const dropped = await call('POST', '/bookings', {
    token: guest.token,
    key: `pd${Date.now()}`,
    body: { vehicleId: car._id, start: day(30), end: day(32), priceLock: lock4 },
  });
  ok('a price drop still books', dropped.status === 201, `${dropped.status}`);
  ok('and the guest pays the cheaper amount, not the locked one',
    dropped.body.data.priceBreakdown.total.amount < lock4.total,
    `${dropped.body?.data?.priceBreakdown?.total?.amount} vs ${lock4.total}`);

  await db.collection('vehicles').updateOne(
    { _id: car._id },
    { $set: { 'pricing.dailyPrice': original } },
  );

  section('Booking without a lock still works');
  const noLock = await call('POST', '/bookings', {
    token: guest.token,
    key: `nl${Date.now()}`,
    body: { vehicleId: car._id, start: day(40), end: day(42) },
  });
  ok('an older client with no lock is not broken', noLock.status === 201, `${noLock.status}`);

  section('Turnaround buffer');
  await db.collection('vehicles').updateOne(
    { _id: car._id },
    { $set: { 'listing.turnaroundDays': 2 } },
  );

  const first = await call('POST', '/bookings', {
    token: guest.token,
    key: `tb1${Date.now()}`,
    body: { vehicleId: car._id, start: day(60), end: day(62) },
  });
  ok('the first trip books', first.status === 201, `${first.status}`);

  const tooSoon = await call('POST', '/bookings', {
    token: guest.token,
    key: `tb2${Date.now()}`,
    body: { vehicleId: car._id, start: day(63), end: day(64) },
  });
  ok('a trip inside the turnaround window is refused',
    tooSoon.status === 409, `${tooSoon.status}`);

  const afterBuffer = await call('POST', '/bookings', {
    token: guest.token,
    key: `tb3${Date.now()}`,
    body: { vehicleId: car._id, start: day(66), end: day(67) },
  });
  ok('a trip after the turnaround window books',
    afterBuffer.status === 201, `${afterBuffer.status} ${JSON.stringify(afterBuffer.body?.error ?? '')}`);

  await db.collection('vehicles').updateOne(
    { _id: car._id },
    { $set: { 'listing.turnaroundDays': 0 } },
  );

  const backToBack = await call('POST', '/bookings', {
    token: guest.token,
    key: `tb4${Date.now()}`,
    body: { vehicleId: car._id, start: day(80), end: day(81) },
  });
  const nextDay = await call('POST', '/bookings', {
    token: guest.token,
    key: `tb5${Date.now()}`,
    body: { vehicleId: car._id, start: day(82), end: day(83) },
  });
  ok('with no turnaround, consecutive trips are allowed',
    backToBack.status === 201 && nextDay.status === 201,
    `${backToBack.status} / ${nextDay.status}`);

  await mongoose.disconnect();
  console.log(`\n  PASS ${pass}   FAIL ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
