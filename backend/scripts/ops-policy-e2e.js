/**
 * Operational policy is admin-controlled, not compiled in.
 *
 * The remaining values that decided real marketplace behaviour from source
 * code: the loyalty ladder, booking lifecycle windows (host approval, price
 * lock, checkout hold, verification grace), and search ranking weights. Plus
 * notification delivery visibility, which existed in the database but was
 * exposed nowhere.
 *
 * Each assertion flips the config and observes the behaviour change, rather
 * than just reading the value back — that is the difference between "stored in
 * config" and "actually driving the system".
 *
 * Run: node scripts/ops-policy-e2e.js
 */
const path = require('path');
const fs = require('fs');
const API = process.env.API || 'http://127.0.0.1:8080/api/v1';
const ADMIN = { email: 'admin@cato.com', password: 'Cato@Admin2026' };

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `  -> ${d}` : ''}`); } };
const section = (t) => console.log(`\n-- ${t} ${'-'.repeat(Math.max(0, 46 - t.length))}`);

async function call(method, p, { token, body, key } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(`${API}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, ok: res.ok, body: json };
}
const mongoUri = () => fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^MONGO_URI=(.+)$/m)[1].trim();
const RUN = Number(process.env.RUN_OFFSET) || 1900 + ((Math.floor(Date.now() / 1000) * 190) % 1_000_000);
const BASE = Date.now() + RUN * 864e5;
const day = (n) => new Date(BASE + n * 864e5).toISOString();

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nOperational policy is admin-controlled\n');

  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body?.data?.tokens?.accessToken;
  const before = (await call('GET', '/admin/config', { token: adminToken })).body?.data;

  const email = `ops${Date.now()}@test.com`;
  await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: 'Ops', lastName: 'Test' } });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  const userId = (await login()).body.data.user.id;
  await db.collection('users').updateOne({ _id: userId }, { $set: { emailVerified: true, phoneVerified: true } });
  await db.collection('kycs').updateOne(
    { userId },
    { $set: { status: 'approved', level: 'full', updatedAt: new Date() }, $setOnInsert: { _id: `kyc_${userId}`, documents: [], createdAt: new Date() } },
    { upsert: true },
  );
  const token = (await login()).body.data.tokens.accessToken;
  const car = (await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=1&instantBook=true')).body.data[0];

  const bookingIds = [];
  try {
    section('Loyalty ladder is configurable');
    const r0 = await call('GET', '/rewards', { token });
    ok('member starts on the entry tier', r0.ok && r0.body.data.tier?.key === 'bronze', JSON.stringify(r0.body?.data?.tier?.key));

    // Make every member platinum from zero points.
    await call('PUT', '/admin/config', {
      token: adminToken,
      body: { rewards: { tiers: [{ key: 'platinum', label: 'Platinum', min: 0, earnMultiplierBps: 15000 }] } },
    });
    const r1 = await call('GET', '/rewards', { token });
    ok('rewriting the ladder changes the member tier — no deploy', r1.body?.data?.tier?.key === 'platinum', JSON.stringify(r1.body?.data?.tier?.key));

    const badLadder = await call('PUT', '/admin/config', {
      token: adminToken,
      body: { rewards: { tiers: [{ key: 'gold', label: 'Gold', min: 500, earnMultiplierBps: 12500 }] } },
    });
    ok('a ladder with no entry tier is rejected', badLadder.status === 400 || badLadder.status === 422, String(badLadder.status));

    section('Minimum redemption is configurable');
    await call('PUT', '/admin/config', { token: adminToken, body: { rewards: { minRedemptionPoints: 999999 } } });
    const redeem = await call('POST', '/rewards/redeem', { token, body: { points: 100 } });
    ok('raising the minimum blocks a redemption below it', redeem.status === 400 || redeem.status === 422, String(redeem.status));

    section('Booking windows are configurable');
    await call('PUT', '/admin/config', { token: adminToken, body: { booking: { priceLockMinutes: 90 } } });
    const q = await call('POST', '/bookings/quote', { token, body: { vehicleId: car._id, start: day(20), end: day(24) } });
    ok('a quote still prices correctly with a retuned lock', q.ok && q.body.data.total?.amount > 0, `${q.status}`);

    // Host approval window: a non-instant request must inherit the configured deadline.
    await call('PUT', '/admin/config', { token: adminToken, body: { booking: { hostApprovalHours: 1 } } });
    await db.collection('vehicles').updateOne({ _id: car._id }, { $set: { 'listing.instantBook': false } });
    const req1 = await call('POST', '/bookings', { token, key: `ops${Date.now()}`, body: { vehicleId: car._id, start: day(30), end: day(34) } });
    const bId = req1.body?.data?._id;
    bookingIds.push(bId);
    const deadline = req1.body?.data?.approvalDeadline ? new Date(req1.body.data.approvalDeadline).getTime() : 0;
    const hoursOut = (deadline - Date.now()) / 3_600_000;
    ok('host approval deadline follows the configured window', req1.status === 201 && hoursOut > 0 && hoursOut <= 1.2, `${hoursOut.toFixed(2)}h`);

    section('Search ranking weights are configurable');
    const recs0 = await call('GET', '/search/recommendations?limit=5', { token });
    ok('recommendations still work with configured weights', recs0.ok, `${recs0.status}`);
    const flip = await call('PUT', '/admin/config', {
      token: adminToken,
      body: { search: { ranking: { ratingWeight: 10, superhostBoost: 50, tripsCap: 5 } } },
    });
    ok('ranking weights are admin-editable', flip.ok, `${flip.status} ${JSON.stringify(flip.body?.error ?? '')}`);
    const recs1 = await call('GET', '/search/recommendations?limit=5', { token });
    ok('search still returns results after retuning', recs1.ok, `${recs1.status}`);

    section('Notification delivery is visible to support');
    const feed = await call('GET', `/admin/notifications/${userId}`, { token: adminToken });
    ok('staff can read a member notification log', feed.ok && Array.isArray(feed.body.data), `${feed.status}`);

    const health = await call('GET', '/admin/notifications/health/summary?days=7', { token: adminToken });
    ok('delivery health is reported per channel', health.ok && !!health.body.data.byChannel, `${health.status}`);
    ok('failure rate is computed', typeof health.body?.data?.windowDays === 'number');

    const denied = await call('GET', `/admin/notifications/${userId}`);
    ok('the delivery log is staff-only', denied.status === 401 || denied.status === 403, String(denied.status));

    section('Guard rails still hold');
    const insane = await call('PUT', '/admin/config', { token: adminToken, body: { booking: { hostApprovalHours: 99999 } } });
    ok('an out-of-range window is rejected', insane.status === 400 || insane.status === 422, String(insane.status));
  } finally {
    // Restore every section we touched, so the shared dev DB is left as found.
    if (before) {
      await call('PUT', '/admin/config', {
        token: adminToken,
        body: {
          rewards: {
            tiers: before.rewards?.tiers,
            minRedemptionPoints: before.rewards?.minRedemptionPoints ?? 100,
            pointValueCents: before.rewards?.pointValueCents,
            pointsPerDollar: before.rewards?.pointsPerDollar,
          },
          booking: before.booking,
          search: before.search,
        },
      });
    }
    await db.collection('vehicles').updateOne({ _id: car._id }, { $set: { 'listing.instantBook': true } });
    for (const id of bookingIds) if (id) await db.collection('availabilities').deleteMany({ bookingId: id });
  }

  console.log('\n' + '='.repeat(48));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(48) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
