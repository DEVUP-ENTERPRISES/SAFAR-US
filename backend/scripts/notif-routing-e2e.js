/**
 * Notification routing = urgency ∩ admin category matrix ∩ user preferences.
 *
 * Proves: notifications are categorised; the admin matrix routes a category away
 * from a channel (honoured even for critical messages); and users can read/set
 * per-channel + per-category preferences.
 *
 * Run: node scripts/notif-routing-e2e.js
 */
const path = require('path');
const fs = require('fs');
const API = process.env.API || 'http://127.0.0.1:8080/api/v1';
const ADMIN = { email: 'admin@cato.com', password: 'Cato@Admin2026' };

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `  -> ${d}` : ''}`); } };
const section = (t) => console.log(`\n-- ${t} ${'-'.repeat(Math.max(0, 44 - t.length))}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, p, { token, body, key } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(`${API}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, ok: res.ok, body: json };
}
const mongoUri = () => fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^MONGO_URI=(.+)$/m)[1].trim();
const RUN = 5600 + ((Math.floor(Date.now() / 1000) * 270) % 300_000);
const BASE = Date.now() + RUN * 864e5;
const day = (n) => new Date(BASE + n * 864e5).toISOString();

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nNotification routing\n');

  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body?.data?.tokens?.accessToken;
  const email = `nr${Date.now()}@test.com`;
  await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: 'NR', lastName: 'T' } });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  const gid = (await login()).body.data.user.id;
  await db.collection('users').updateOne({ _id: gid }, { $set: { emailVerified: true, phoneVerified: true, phone: '+15551230000', timezone: 'America/New_York' } });
  await db.collection('kycs').updateOne({ userId: gid }, { $set: { status: 'approved', level: 'full', updatedAt: new Date() }, $setOnInsert: { _id: `kyc_${gid}`, documents: [], createdAt: new Date() } }, { upsert: true });
  const token = (await login()).body.data.tokens.accessToken;
  const car = (await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=1&instantBook=true')).body.data[0];

  const bookAndGetNotif = async (off) => {
    const b = await call('POST', '/bookings', { token, key: `nr${Date.now()}${Math.random()}`, body: { vehicleId: car._id, start: day(off), end: day(off + 2) } });
    if (b.body?.data?._id) await db.collection('availabilities').deleteMany({ bookingId: b.body.data._id });
    await sleep(700);
    return db.collection('notifications').find({ userId: gid, templateKey: 'booking.confirmed' }).sort({ createdAt: -1 }).limit(1).toArray().then((r) => r[0]);
  };

  try {
    section('Categorisation + default fan-out');
    const n1 = await bookAndGetNotif(5);
    ok('booking.confirmed is categorised as trips', n1?.category === 'trips', String(n1?.category));
    const ch1 = (n1?.attempts ?? []).map((a) => a.channel).sort();
    ok('trips default fan-out includes SMS (allowed + critical)', ch1.includes('sms'), JSON.stringify(ch1));

    section('Admin routing matrix');
    const cfg = (await call('GET', '/admin/config', { token: adminToken })).body?.data;
    ok('matrix exposes per-category channels', cfg?.notifications?.categoryChannels?.trips?.sms === true, JSON.stringify(cfg?.notifications?.categoryChannels?.trips));
    const upd = await call('PUT', '/admin/config', { token: adminToken, body: { notifications: { categoryChannels: { ...cfg.notifications.categoryChannels, trips: { push: true, email: true, sms: false } } } } });
    ok('admin routes trips away from SMS', upd.ok);

    const n2 = await bookAndGetNotif(30);
    const ch2 = (n2?.attempts ?? []).map((a) => a.channel).sort();
    ok('SMS is no longer attempted for trips', !ch2.includes('sms'), JSON.stringify(ch2));
    ok('push and email still go (matrix + critical)', ch2.includes('push') && ch2.includes('email'), JSON.stringify(ch2));

    section('User preferences');
    const def = (await call('GET', '/users/me/notification-preferences', { token })).body?.data;
    ok('defaults are permissive with SMS critical-only', def?.push === true && def?.smsCriticalOnly === true, JSON.stringify(def));
    const patched = await call('PATCH', '/users/me/notification-preferences', { token, body: { email: false, categories: { promotions: false } } });
    ok('preferences update (channel + category)', patched.ok && patched.body?.data?.email === false && patched.body?.data?.categories?.promotions === false, JSON.stringify(patched.body?.data));
    const reread = (await call('GET', '/users/me/notification-preferences', { token })).body?.data;
    ok('preferences persist', reread?.email === false && reread?.categories?.promotions === false);
  } finally {
    // Restore the platform matrix.
    const cfg = (await call('GET', '/admin/config', { token: adminToken })).body?.data;
    if (cfg) await call('PUT', '/admin/config', { token: adminToken, body: { notifications: { categoryChannels: { ...cfg.notifications.categoryChannels, trips: { push: true, email: true, sms: true } } } } });
  }

  console.log('\n' + '='.repeat(46));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(46) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
