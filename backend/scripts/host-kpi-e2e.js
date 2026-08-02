/**
 * Host KPIs — All-Star (Superhost) is earned across multiple factors, and
 * maintenance-due reminders reach the host.
 *
 * Run: node scripts/host-kpi-e2e.js
 */
const path = require('path');
const fs = require('fs');
const API = process.env.API || 'http://127.0.0.1:8080/api/v1';
const ADMIN = { email: 'admin@cato.com', password: 'Cato@Admin2026' };

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `  -> ${d}` : ''}`); } };
const section = (t) => console.log(`\n-- ${t} ${'-'.repeat(Math.max(0, 44 - t.length))}`);

async function call(method, p, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, ok: res.ok, body: json };
}
const mongoUri = () => fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^MONGO_URI=(.+)$/m)[1].trim();
const recompute = (t, hostId) => call('POST', `/admin/hosts/${hostId}/recompute-superhost`, { token: t }).then((r) => r.body?.data?.superhost);
const seedBookings = async (db, hostId, status, n, tag) =>
  db.collection('bookings').insertMany(Array.from({ length: n }, (_, i) => ({ _id: `hk_${tag}_${hostId}_${i}`, code: `hk_${tag}_${hostId}_${i}`, hostId, guestId: 'seed', status, createdAt: new Date() })));

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nHost KPIs\n');

  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body?.data?.tokens?.accessToken;
  const email = `hk${Date.now()}@test.com`;
  await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: 'HK', lastName: 'T' } });
  const huId = (await call('POST', '/auth/login', { body: { email, password: 'Test@1234' } })).body.data.user.id;
  const hostId = `host_hk_${Date.now()}`;

  try {
    // Seed a host record for that user.
    await db.collection('hosts').insertOne({ _id: hostId, userId: huId, displayName: 'HK Host', verificationStatus: 'verified', ratingAvg: 4.9, ratingCount: 5, totalTrips: 10, isSuperhost: false, createdAt: new Date() });

    section('All-Star (Superhost) qualification');
    // Only rating — but not enough trips yet.
    await db.collection('hosts').updateOne({ _id: hostId }, { $set: { totalTrips: 2 } });
    ok('high rating but too few trips → not All-Star', (await recompute(adminToken, hostId)) === false, 'trips below bar');

    // Enough trips + rating + clean cancellation → qualifies.
    await db.collection('hosts').updateOne({ _id: hostId }, { $set: { totalTrips: 10 } });
    await seedBookings(db, hostId, 'completed', 10, 'c');
    ok('trips + rating + no cancellations → All-Star', (await recompute(adminToken, hostId)) === true);

    // Push cancellation rate above the bar → loses it.
    await seedBookings(db, hostId, 'cancelled_host', 3, 'x'); // 3 / 13 ≈ 23% > 5%
    ok('high host-cancellation rate → All-Star revoked', (await recompute(adminToken, hostId)) === false);

    section('Maintenance-due reminder');
    await db.collection('maintenances').insertOne({ _id: `mnt_${Date.now()}`, vehicleId: 'veh_hk', hostId, type: 'service', scheduledFor: new Date(Date.now() + 12 * 3600e3), status: 'scheduled', reminded: false, createdAt: new Date() });
    const run = await call('POST', '/admin/maintenance/run-reminders', { token: adminToken });
    ok('reminder run sends at least one alert', run.ok && run.body?.data?.reminded >= 1, `${run.status} ${JSON.stringify(run.body?.data ?? run.body?.error)}`);
    const notif = await db.collection('notifications').findOne({ userId: huId, templateKey: 'vehicle.maintenance_due' });
    ok('host receives a maintenance-due notification', !!notif, 'no notification found');
    const again = await call('POST', '/admin/maintenance/run-reminders', { token: adminToken });
    const stillDue = await db.collection('maintenances').findOne({ hostId, reminded: { $ne: true } });
    ok('a reminded item is not pinged again', !stillDue, `run2=${again.body?.data?.reminded}`);
  } finally {
    await db.collection('hosts').deleteOne({ _id: hostId });
    await db.collection('bookings').deleteMany({ _id: /^hk_/ });
    await db.collection('maintenances').deleteMany({ hostId });
    await db.collection('notifications').deleteMany({ userId: huId });
  }

  console.log('\n' + '='.repeat(46));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(46) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
