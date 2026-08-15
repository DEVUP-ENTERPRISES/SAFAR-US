/**
 * Two-way reviews are written blind.
 *
 * Publishing a review the moment it is written lets the second writer read the
 * first and answer it — which is how a guest who disputed a charge ends up with
 * a retaliatory rating. It is the loudest unaddressed complaint in this market.
 *
 * Asserts: a lone review is not visible to anyone but its author; the
 * counterpart sees that it EXISTS but not what it says; both go live the moment
 * the second is written; ratings only count once published; and a review the
 * other side never answers is released when the window closes, so silence
 * cannot bury criticism.
 *
 * Seeds its own data and removes it afterwards.
 *
 * Run: node scripts/blind-reviews-e2e.js
 */
const path = require('path');
const fs = require('fs');
const API = process.env.API || 'http://127.0.0.1:8080/api/v1';
const ADMIN = { email: 'admin@cato.com', password: 'Cato@Admin2026' };

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `  -> ${d}` : ''}`); } };
const section = (t) => console.log(`\n-- ${t} ${'-'.repeat(Math.max(0, 46 - t.length))}`);

async function call(method, p, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, ok: res.ok, body: json };
}
const mongoUri = () => fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^MONGO_URI=(.+)$/m)[1].trim();
const SEED = `blindrev-${Date.now()}`;

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nBlind two-way reviews\n');

  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body?.data?.tokens?.accessToken;
  const cfgBefore = (await call('GET', '/admin/config', { token: adminToken })).body?.data;

  // Two real accounts: a guest and a host.
  const mk = async (prefix) => {
    const email = `${prefix}${Date.now()}@test.com`;
    await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: prefix, lastName: 'R' } });
    const login = await call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
    return { email, id: login.body.data.user.id, token: login.body.data.tokens.accessToken };
  };
  const guest = await mk('brguest');
  const hostUser = await mk('brhost');

  const hostId = `${SEED}-host`;
  const vehicleId = `${SEED}-veh`;
  const bookingId = `${SEED}-bkg`;

  try {
    // Seed a completed trip directly: the review rules are what is under test,
    // not the booking flow (covered elsewhere).
    await db.collection('hosts').insertOne({
      _id: hostId, userId: hostUser.id, displayName: 'Blind Test Host',
      ratingAvg: 0, ratingCount: 0, totalTrips: 0, verificationStatus: 'verified',
      createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    });
    await db.collection('vehicles').insertOne({
      _id: vehicleId, hostId, make: 'Test', model: 'Car', year: 2023, bodyType: 'sedan', category: 'economy',
      transmission: 'automatic', fuelType: 'petrol', seats: 5, features: [], photos: [], vinVerified: false,
      location: { type: 'Point', coordinates: [-96.797, 32.7767], address: 'X', city: 'Dallas' },
      listing: { title: 'T', description: '', instantBook: true, minTripHours: 24, maxTripHours: 720, cancellationPolicy: 'flexible' },
      pricing: { dailyPrice: 5000, currency: 'USD', cleaningFee: 0 },
      status: 'listed', verificationStatus: 'verified', ratingAvg: 0, ratingCount: 0, totalTrips: 0,
      deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });
    const money = (a) => ({ amount: a, currency: 'USD' });
    await db.collection('bookings').insertOne({
      _id: bookingId, code: `BR${Date.now().toString().slice(-6)}`, guestId: guest.id, hostId, vehicleId,
      period: { start: new Date(Date.now() - 5 * 864e5), end: new Date(Date.now() - 2 * 864e5) },
      priceBreakdown: {
        currency: 'USD', days: 3, base: money(15000), total: money(15000), hostEarnings: money(12000),
        commission: money(3000), tax: money(0), discount: money(0), protection: money(0),
        cleaningFee: money(0), addOnsTotal: money(0), delivery: money(0),
      },
      status: 'completed', statusHistory: [], instantBook: true,
      createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    });

    section('A lone review stays invisible');
    const r1 = await call('POST', '/reviews', { token: guest.token, body: { bookingId, rating: 2, comment: 'Car was not clean.' } });
    ok('guest can review a completed trip', r1.status === 201, `${r1.status} ${JSON.stringify(r1.body?.error ?? '')}`);
    ok('it is held pending, not published', r1.body?.data?.status === 'pending', String(r1.body?.data?.status));

    const publicList = await call('GET', `/reviews?subjectId=${hostId}`);
    ok('it is not visible publicly', publicList.ok && publicList.body.data.length === 0, `${publicList.body?.data?.length}`);

    const hostAgg = await db.collection('hosts').findOne({ _id: hostId }, { projection: { ratingAvg: 1, ratingCount: 1 } });
    ok('it does not move the host rating yet', hostAgg.ratingCount === 0, JSON.stringify(hostAgg));

    section('The other side sees that it exists, not what it says');
    const hostView = await call('GET', `/reviews/booking/${bookingId}`, { token: hostUser.token });
    const seen = (hostView.body?.data ?? [])[0];
    ok('the host knows a review was written', !!seen && seen.pending === true, JSON.stringify(seen));
    ok('the rating is withheld', seen?.rating === undefined, `rating=${seen?.rating}`);
    ok('the words are withheld', seen?.comment === undefined, `comment=${seen?.comment}`);

    const authorView = await call('GET', `/reviews/booking/${bookingId}`, { token: guest.token });
    const own = (authorView.body?.data ?? [])[0];
    ok('the author still sees their own in full', own?.comment === 'Car was not clean.', JSON.stringify(own?.comment));

    section('Both publish the moment the second is written');
    const r2 = await call('POST', '/reviews', { token: hostUser.token, body: { bookingId, rating: 5, comment: 'Great guest.' } });
    ok('host can review the same trip', r2.status === 201, `${r2.status} ${JSON.stringify(r2.body?.error ?? '')}`);

    const both = await db.collection('reviews').find({ bookingId }).toArray();
    ok('both are now published', both.length === 2 && both.every((r) => r.status === 'published'), JSON.stringify(both.map((r) => r.status)));
    ok('publish time is recorded', both.every((r) => !!r.publishedAt));

    const nowPublic = await call('GET', `/reviews?subjectId=${hostId}`);
    ok('the host review is publicly visible now', nowPublic.body.data.length === 1, `${nowPublic.body?.data?.length}`);

    const hostAgg2 = await db.collection('hosts').findOne({ _id: hostId }, { projection: { ratingAvg: 1, ratingCount: 1 } });
    ok('ratings only count once published', hostAgg2.ratingCount === 1 && hostAgg2.ratingAvg === 2, JSON.stringify(hostAgg2));

    section('Silence cannot bury criticism');
    // A second trip the host never reviews, aged past the window.
    const b2 = `${SEED}-bkg2`;
    await db.collection('bookings').insertOne({
      ...(await db.collection('bookings').findOne({ _id: bookingId })),
      _id: b2, code: `BR2${Date.now().toString().slice(-6)}`,
    });
    const r3 = await call('POST', '/reviews', { token: guest.token, body: { bookingId: b2, rating: 1, comment: 'Never again.' } });
    ok('a second review is pending', r3.body?.data?.status === 'pending');

    // Age it beyond the blind window.
    await call('PUT', '/admin/config', { token: adminToken, body: { reviews: { blindWindowDays: 1 } } });
    await db.collection('reviews').updateOne({ _id: r3.body.data._id }, { $set: { createdAt: new Date(Date.now() - 3 * 864e5) } });

    const swept = await call('POST', '/admin/reviews/release-expired', { token: adminToken });
    if (!swept.ok) console.log(`    (no admin sweep route — status ${swept.status})`);
    const after = await db.collection('reviews').findOne({ _id: r3.body.data._id });
    ok('an unanswered review is released when the window closes', after?.status === 'published', String(after?.status));
  } finally {
    if (cfgBefore?.reviews) {
      await call('PUT', '/admin/config', { token: adminToken, body: { reviews: cfgBefore.reviews } });
    }
    await db.collection('reviews').deleteMany({ bookingId: { $regex: `^${SEED}` } });
    await db.collection('bookings').deleteMany({ _id: { $regex: `^${SEED}` } });
    await db.collection('vehicles').deleteMany({ _id: { $regex: `^${SEED}` } });
    await db.collection('hosts').deleteMany({ _id: { $regex: `^${SEED}` } });
    for (const u of [guest.id, hostUser.id]) {
      await db.collection('users').deleteOne({ _id: u });
      await db.collection('kycs').deleteMany({ userId: u });
    }
  }

  console.log('\n' + '='.repeat(48));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(48) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
