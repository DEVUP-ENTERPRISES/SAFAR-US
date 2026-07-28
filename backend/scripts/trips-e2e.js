/**
 * Trip lifecycle — check-in, condition photos, checkout, mileage settlement.
 *
 * The trip is where the booking becomes a real handover of a real car, so the
 * things that protect both sides have to actually work: the condition record
 * (photos) must be present before a trip can close, only the two parties can
 * touch it, the odometer captured at handover and return must drive a real
 * money movement when the guest goes over the included mileage, and the ledger
 * must stay balanced through all of it.
 *
 * This suite books against the shared seed vehicle. It stamps a mileage limit
 * on it for the duration (unlimited-mileage cars can't test overage) and
 * restores it afterwards, and it clears the days it booked so later runs — and
 * the scenario suite — start from a clean calendar.
 *
 * Run: node scripts/trips-e2e.js
 */
const path = require('path');
const fs = require('fs');

const API = process.env.API || 'http://127.0.0.1:8080/api/v1';

let pass = 0;
let fail = 0;
const ok = (n, c, d = '') => {
  if (c) {
    pass += 1;
    console.log(`  ✓ ${n}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${n}${d ? `  -> ${d}` : ''}`);
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

// Far-future window so we never collide with real or seeded bookings.
const RUN = Number(process.env.RUN_OFFSET) || 900 + ((Math.floor(Date.now() / 1000) * 70) % 1_500_000);
const day = (n) => new Date(Date.now() + (RUN + n) * 864e5).toISOString();

async function newVerifiedUser(db, prefix) {
  const email = `${prefix}${Date.now()}${Math.floor(Math.random() * 1e4)}@test.com`;
  await call('POST', '/auth/register', {
    body: { email, password: 'Test@1234', firstName: prefix, lastName: 'Tester' },
  });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  const userId = (await login()).body.data.user.id;
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
  return { userId, token: (await login()).body.data.tokens.accessToken };
}

const photos = (n) =>
  Array.from({ length: n }, (_, i) => ({ url: `https://cdn.example.com/test/${Date.now()}_${i}.jpg` }));

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;

  console.log('\nTrip lifecycle\n');

  const guest = await newVerifiedUser(db, 'trip_guest');
  const stranger = await newVerifiedUser(db, 'trip_other');

  const cars = (
    await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=5&instantBook=true')
  ).body.data;
  if (!cars?.length) {
    console.log('no instant-book vehicle available — seed data first');
    process.exit(1);
  }
  const car = cars[0];

  // Give the car a mileage limit for the duration, remembering the original so
  // the seed data is left exactly as we found it.
  const original = await db.collection('vehicles').findOne({ _id: car._id }, { projection: { mileageLimit: 1 } });
  const PER_DAY_KM = 200;
  const FEE_PER_KM = 40; // cents
  await db.collection('vehicles').updateOne(
    { _id: car._id },
    { $set: { mileageLimit: { perDayKm: PER_DAY_KM, overageFeePerKm: FEE_PER_KM } } },
  );

  let bookingId;
  try {
    // A 2-day booking -> 400 km included.
    const booking = await call('POST', '/bookings', {
      token: guest.token,
      key: `trip${Date.now()}`,
      body: { vehicleId: car._id, start: day(2), end: day(4) },
    });
    bookingId = booking.body?.data?._id;
    ok('booking created and paid', booking.body?.data?.status === 'paid', String(booking.body?.data?.status));
    // Included mileage is measured against the exact days the guest was billed.
    const billedDays = booking.body?.data?.priceBreakdown?.days;
    ok('booking records the billed day count', billedDays > 0, String(billedDays));
    const INCLUDED_KM = PER_DAY_KM * billedDays;

    // ── Start / handover ────────────────────────────────────────────────
    section('Handover');
    const start = await call('POST', '/trips/start', {
      token: guest.token,
      body: { bookingId, odometerStart: 50000, fuelStart: 95 },
    });
    ok('T01 trip started', start.ok, `${start.status} ${JSON.stringify(start.body?.error ?? '')}`);
    const tripId = start.body?.data?._id;
    ok('T02 handover odometer recorded', start.body?.data?.handover?.odometerStart === 50000);
    ok('T03 handover fuel recorded', start.body?.data?.handover?.fuelStart === 95);

    const restart = await call('POST', '/trips/start', { token: guest.token, body: { bookingId } });
    ok('T04 a trip cannot be started twice', restart.status === 409, String(restart.status));

    // ── Condition photos & access control ───────────────────────────────
    section('Condition photos');
    const strangerPhoto = await call('POST', `/trips/${tripId}/photos`, {
      token: stranger.token,
      body: { phase: 'pre', photos: photos(1) },
    });
    ok('T05 a non-participant cannot add photos', strangerPhoto.status === 403, String(strangerPhoto.status));

    const pre = await call('POST', `/trips/${tripId}/photos`, {
      token: guest.token,
      body: { phase: 'pre', photos: photos(3) },
    });
    ok('T06 guest adds pickup (pre) photos', pre.ok && pre.body.data.photos.filter((p) => p.phase === 'pre').length === 3);

    // ── Checkout is gated on the return record ──────────────────────────
    section('Checkout');
    const early = await call('POST', `/trips/${tripId}/complete`, {
      token: guest.token,
      body: { odometerEnd: 50100 },
    });
    ok('T07 cannot complete before return photos', early.status === 409 && early.body?.error?.code === 'RETURN_PHOTOS_REQUIRED', JSON.stringify(early.body?.error));

    const post = await call('POST', `/trips/${tripId}/photos`, {
      token: guest.token,
      body: { phase: 'post', photos: photos(2) },
    });
    ok('T08 guest adds return (post) photos', post.ok && post.body.data.photos.filter((p) => p.phase === 'post').length === 2);

    const strangerComplete = await call('POST', `/trips/${tripId}/complete`, {
      token: stranger.token,
      body: { odometerEnd: 50100 },
    });
    ok('T09 a non-participant cannot complete the trip', strangerComplete.status === 403, String(strangerComplete.status));

    // Drove 60 km past the included 400 (odometer 50000 -> 50460).
    const OVER_KM = 60;
    const odometerEnd = 50000 + INCLUDED_KM + OVER_KM;
    const done = await call('POST', `/trips/${tripId}/complete`, {
      token: guest.token,
      body: { odometerEnd, fuelEnd: 80 },
    });
    ok('T10 trip completed', done.ok && done.body.data.status === 'completed', `${done.status} ${JSON.stringify(done.body?.error ?? '')}`);
    ok('T11 distance driven computed from odometer', done.body?.data?.distanceKm === INCLUDED_KM + OVER_KM, String(done.body?.data?.distanceKm));
    ok('T12 return fuel recorded', done.body?.data?.return?.fuelEnd === 80);

    // ── Mileage settlement ──────────────────────────────────────────────
    section('Mileage settlement');
    const mo = done.body?.data?.mileageOverage;
    ok('T13 overage km is the distance past included only', mo?.km === OVER_KM, JSON.stringify(mo));
    ok('T14 overage charged at the host rate', mo?.amountCents === OVER_KM * FEE_PER_KM, JSON.stringify(mo));

    const moTxn = await db
      .collection('ledgerentries')
      .find({ refType: 'mileage_overage', refId: bookingId })
      .toArray();
    const moCredit = moTxn.filter((e) => e.direction === 'credit').reduce((s, e) => s + e.amount, 0);
    const moDebit = moTxn.filter((e) => e.direction === 'debit').reduce((s, e) => s + e.amount, 0);
    ok('T15 overage posted to the ledger, balanced', moCredit === OVER_KM * FEE_PER_KM && moDebit === moCredit, `${moCredit}/${moDebit}`);

    // ── Post-conditions ─────────────────────────────────────────────────
    section('Post-conditions');
    const bk = await call('GET', `/bookings/${bookingId}`, { token: guest.token });
    ok('T16 booking is marked completed', bk.body?.data?.status === 'completed', String(bk.body?.data?.status));

    const again = await call('POST', `/trips/${tripId}/complete`, {
      token: guest.token,
      body: { odometerEnd: 99999 },
    });
    ok('T17 a completed trip cannot be completed again', again.status === 409, String(again.status));

    // ── Ledger integrity ────────────────────────────────────────────────
    section('Ledger integrity');
    const rows = await db
      .collection('ledgerentries')
      .aggregate([{ $group: { _id: '$direction', t: { $sum: '$amount' } } }])
      .toArray();
    const credit = (rows.find((x) => x._id === 'credit') || { t: 0 }).t;
    const debit = (rows.find((x) => x._id === 'debit') || { t: 0 }).t;
    ok('T18 ledger globally balanced', credit === debit, `${credit} vs ${debit}`);
  } finally {
    // Leave the seed data exactly as we found it.
    if (original && original.mileageLimit !== undefined) {
      await db.collection('vehicles').updateOne({ _id: car._id }, { $set: { mileageLimit: original.mileageLimit } });
    } else {
      await db.collection('vehicles').updateOne({ _id: car._id }, { $unset: { mileageLimit: '' } });
    }
    if (bookingId) {
      await db.collection('availabilities').deleteMany({ bookingId });
    }
  }

  console.log('\n' + '='.repeat(56));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(56) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
