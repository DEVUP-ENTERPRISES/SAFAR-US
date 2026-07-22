/**
 * Security deposit.
 *
 * Before this existed, `holdId` on a booking was an availability hold — a
 * calendar reservation — and there was no funds instrument at all. A host who
 * got a car back with a kerbed alloy had nothing to settle against.
 *
 * Asserts the properties that matter: the hold is an authorisation and never a
 * charge, it is placed at handover rather than at booking (a card auth only
 * lives about a week), it cannot be over-captured, only staff can reach into
 * it, and the ledger only ever sees money that genuinely moved.
 *
 * Run: node scripts/deposit-e2e.js
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

function mongoUri() {
  return fs
    .readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
    .match(/^MONGO_URI=(.+)$/m)[1]
    .trim();
}

const RUN = 700 + ((Math.floor(Date.now() / 1000) * 40) % 900_000);
const day = (n) => new Date(Date.now() + (RUN + n) * 864e5).toISOString();

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;

  console.log('\nSecurity deposit\n');

  // A verified guest, so the identity gate is not what we are testing here.
  const email = `dep${Date.now()}@test.com`;
  await call('POST', '/auth/register', {
    body: { email, password: 'Test@1234', firstName: 'Dep', lastName: 'Tester' },
  });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  let auth = (await login()).body.data;
  const userId = auth.user.id;
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
  auth = (await login()).body.data;
  const token = auth.tokens.accessToken;

  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body.data.tokens.accessToken;

  const cars = (
    await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=5&instantBook=true')
  ).body.data;
  if (!cars?.length) {
    console.log('no instant-book vehicle available');
    process.exit(1);
  }
  const car = cars[0];

  const booking = await call('POST', '/bookings', {
    token,
    key: `dep${Date.now()}`,
    body: { vehicleId: car._id, start: day(2), end: day(4) },
  });
  const bookingId = booking.body?.data?._id;
  ok('booking created and paid', booking.body?.data?.status === 'paid', String(booking.body?.data?.status));

  section('No deposit is held before handover');
  const pre = (await call('GET', `/payments/deposits/${bookingId}`, { token })).body?.data;
  ok('nothing held at booking time', pre?.held === false, JSON.stringify(pre));

  section('Handover places the authorisation');
  const trip = await call('POST', '/trips/start', {
    token,
    body: { bookingId, odometerStart: 10000, fuelStart: 100 },
  });
  ok('trip started', trip.ok, `${trip.status} ${JSON.stringify(trip.body?.error ?? '')}`);
  const tripId = trip.body?.data?._id;

  const held = (await call('GET', `/payments/deposits/${bookingId}`, { token })).body?.data;
  ok('deposit is now held', held?.held === true, JSON.stringify(held));

  const dep = await db.collection('payments').findOne({ bookingId, type: 'deposit' });
  ok('it is an authorisation, NOT a charge',
    dep.status === 'authorized' && dep.capturedAmount === 0,
    JSON.stringify({ status: dep.status, captured: dep.capturedAmount }));

  const cfg = await db.collection('platformconfigs').findOne({ _id: 'platform' });
  const min = cfg?.deposit?.minCents ?? 25000;
  const max = cfg?.deposit?.maxCents ?? 100000;
  ok('the amount sits inside the configured band',
    dep.amount >= min && dep.amount <= max,
    `${dep.amount} not in [${min}, ${max}]`);

  section('An authorisation is invisible to the ledger');
  const depLedger = await db.collection('ledgerentries').countDocuments({ refId: bookingId, refType: 'deposit' });
  ok('no ledger entries for an untaken hold', depLedger === 0, String(depLedger));

  section('Only staff can reach into it');
  const guestGrab = await call('POST', `/payments/deposits/${bookingId}/capture`, {
    token,
    body: { amount: 5000, reason: 'I would like some money please' },
  });
  ok('a guest cannot capture their own deposit', guestGrab.status === 403, `${guestGrab.status}`);

  section('Capture is clamped and booked');
  await call('POST', `/trips/${tripId}/complete`, {
    token,
    body: { odometerEnd: 10100, fuelEnd: 100 },
  });

  const over = await call('POST', `/payments/deposits/${bookingId}/capture`, {
    token: adminToken,
    body: { amount: dep.amount + 50000, reason: 'Damage assessed well above the held amount' },
  });
  ok('cannot capture more than was authorised',
    over.ok && over.body.data.captured.amount === dep.amount,
    JSON.stringify(over.body?.data ?? over.body?.error));

  const afterCapture = await db.collection('payments').findOne({ _id: dep._id });
  ok('the deposit is marked settled', afterCapture.status === 'succeeded', afterCapture.status);
  ok('the reason is stored for the dispute record',
    !!afterCapture.releasedReason && !!afterCapture.releasedAt);

  const legs = await db.collection('ledgerentries').find({ refId: bookingId, refType: 'deposit' }).toArray();
  ok('captured money IS in the ledger', legs.length === 2, String(legs.length));
  const debit = legs.filter((l) => l.direction === 'debit').reduce((s, l) => s + l.amount, 0);
  const credit = legs.filter((l) => l.direction === 'credit').reduce((s, l) => s + l.amount, 0);
  ok('and that transaction balances', debit === credit && debit === dep.amount, `${debit} vs ${credit}`);

  section('Settling twice is refused');
  const again = await call('POST', `/payments/deposits/${bookingId}/capture`, {
    token: adminToken,
    body: { amount: 1000, reason: 'Trying to double dip on a settled deposit' },
  });
  ok('a settled deposit cannot be captured again', !again.ok, `${again.status}`);

  section('The clean path: released untouched');
  const b2 = await call('POST', '/bookings', {
    token,
    key: `dep2${Date.now()}`,
    body: { vehicleId: car._id, start: day(20), end: day(22) },
  });
  const id2 = b2.body.data._id;
  const t2 = await call('POST', '/trips/start', {
    token,
    body: { bookingId: id2, odometerStart: 20000, fuelStart: 100 },
  });
  await call('POST', `/trips/${t2.body.data._id}/complete`, {
    token,
    body: { odometerEnd: 20050, fuelEnd: 100 },
  });

  const rel = await call('POST', `/payments/deposits/${id2}/release`, {
    token: adminToken,
    body: { reason: 'Inspection passed, no damage' },
  });
  ok('a clean trip releases the hold', rel.ok && rel.body.data.released === true, JSON.stringify(rel.body));

  const dep2 = await db.collection('payments').findOne({ bookingId: id2, type: 'deposit' });
  ok('released, never captured',
    dep2.status === 'cancelled' && dep2.capturedAmount === 0,
    JSON.stringify({ status: dep2.status, captured: dep2.capturedAmount }));

  const legs2 = await db.collection('ledgerentries').countDocuments({ refId: id2, refType: 'deposit' });
  ok('a released hold never touches the ledger', legs2 === 0, String(legs2));

  const relAgain = await call('POST', `/payments/deposits/${id2}/release`, {
    token: adminToken,
    body: { reason: 'Releasing an already released deposit' },
  });
  ok('releasing twice is a no-op, not an error',
    relAgain.ok && relAgain.body.data.released === false, JSON.stringify(relAgain.body?.data));

  await mongoose.disconnect();
  console.log(`\n  PASS ${pass}   FAIL ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
