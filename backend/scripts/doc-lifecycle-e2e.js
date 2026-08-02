/**
 * Document lifecycle — a car with lapsed insurance/registration cannot carry a
 * paying trip, and relists itself the moment the host renews.
 *
 * Booking guard (instant) + hourly sweep (pause/relist). Uses a non-primary
 * seed vehicle and fully restores it afterwards.
 *
 * Run: node scripts/doc-lifecycle-e2e.js
 */
const path = require('path');
const fs = require('fs');
const API = process.env.API || 'http://127.0.0.1:8080/api/v1';
const ADMIN = { email: 'admin@cato.com', password: 'Cato@Admin2026' };

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `  -> ${d}` : ''}`); } };

async function call(method, p, { token, body, key } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(`${API}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, ok: res.ok, body: json };
}
const mongoUri = () => fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^MONGO_URI=(.+)$/m)[1].trim();
const RUN = 2600 + ((Math.floor(Date.now() / 1000) * 150) % 800_000);
const BASE = Date.now() + RUN * 864e5;
const day = (n) => new Date(BASE + n * 864e5).toISOString();

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nDocument lifecycle (insurance/registration)\n');

  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body?.data?.tokens?.accessToken;

  // Verified guest.
  const email = `doc${Date.now()}@test.com`;
  await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: 'Doc', lastName: 'T' } });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  const gid = (await login()).body.data.user.id;
  await db.collection('users').updateOne({ _id: gid }, { $set: { emailVerified: true, phoneVerified: true } });
  await db.collection('kycs').updateOne({ userId: gid }, { $set: { status: 'approved', level: 'full', updatedAt: new Date() }, $setOnInsert: { _id: `kyc_${gid}`, documents: [], createdAt: new Date() } }, { upsert: true });
  const token = (await login()).body.data.tokens.accessToken;

  // A non-primary instant-book NYC car so we don't disturb the [0] target.
  const cars = (await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=5&instantBook=true')).body.data;
  const car = cars[2] || cars[cars.length - 1];
  const docId = `docexp_${car._id}`;

  try {
    ok('admin can log in', !!adminToken);
    const book = (off) => call('POST', '/bookings', { token, key: `dl${Date.now()}${Math.random()}`, body: { vehicleId: car._id, start: day(off), end: day(off + 2) } });

    // Baseline: bookable before any expiry.
    const b0 = await book(10);
    ok('car is bookable before any doc expiry', b0.body?.data?.status === 'paid', `${b0.status} ${JSON.stringify(b0.body?.error ?? '')}`);
    if (b0.body?.data?._id) await db.collection('availabilities').deleteMany({ bookingId: b0.body.data._id });

    // Insert an EXPIRED insurance document.
    await db.collection('documents').updateOne(
      { _id: docId },
      { $set: { ownerId: 'seed', vehicleId: car._id, category: 'insurance', url: 'https://cdn.example.com/ins.pdf', expiresAt: new Date(Date.now() - 864e5), verification: { status: 'verified' }, deletedAt: null, createdAt: new Date() } },
      { upsert: true },
    );

    // Booking-time guard fires immediately (before any sweep).
    const blocked = await book(20);
    ok('booking is blocked the moment a mandatory doc is expired', blocked.status === 409 && blocked.body?.error?.code === 'DOCS_EXPIRED', `${blocked.status} ${JSON.stringify(blocked.body?.error ?? '')}`);

    // Sweep pauses the car.
    const sweep1 = await call('POST', '/admin/compliance/sweep', { token: adminToken });
    ok('sweep pauses the non-compliant car', sweep1.ok && sweep1.body?.data?.paused >= 1, `${sweep1.status} ${JSON.stringify(sweep1.body?.data ?? sweep1.body?.error)}`);
    const paused = await db.collection('vehicles').findOne({ _id: car._id }, { projection: { status: 1, complianceHold: 1 } });
    ok('car is paused with a compliance hold', paused?.status === 'paused' && paused?.complianceHold === true, JSON.stringify(paused));

    // Paused car disappears from search.
    const inSearch = (await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=20')).body.data.some((v) => v._id === car._id);
    ok('paused car is hidden from search', !inSearch);

    // Renew the document.
    await db.collection('documents').updateOne({ _id: docId }, { $set: { expiresAt: new Date(Date.now() + 365 * 864e5) } });

    // Sweep relists it.
    const sweep2 = await call('POST', '/admin/compliance/sweep', { token: adminToken });
    ok('sweep relists the renewed car', sweep2.ok && sweep2.body?.data?.restored >= 1, JSON.stringify(sweep2.body?.data));
    const restored = await db.collection('vehicles').findOne({ _id: car._id }, { projection: { status: 1, complianceHold: 1 } });
    ok('car is listed again, hold cleared', restored?.status === 'listed' && !restored?.complianceHold, JSON.stringify(restored));

    // Bookable again.
    const b1 = await book(30);
    ok('car is bookable again after renewal', b1.body?.data?.status === 'paid', `${b1.status} ${JSON.stringify(b1.body?.error ?? '')}`);
    if (b1.body?.data?._id) await db.collection('availabilities').deleteMany({ bookingId: b1.body.data._id });
  } finally {
    await db.collection('documents').deleteOne({ _id: docId });
    await db.collection('vehicles').updateOne({ _id: car._id }, { $set: { status: 'listed', complianceHold: false } });
  }

  console.log('\n' + '='.repeat(48));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(48) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
