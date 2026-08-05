/**
 * Unified message inbox — GET /messages lists one row per booking that has a
 * conversation, newest first, with the counterpart, the car, a last-message
 * preview and the unread count. Plus the admin read-only thread viewer.
 *
 * A booking with no messages is not a conversation and must not appear. Unread
 * counts only the counterpart's messages. Enrichment (counterpart name, car
 * title) must resolve. Verifies the guest's view (counterpart = host) and the
 * admin dispute viewer.
 *
 * Run: node scripts/inbox-e2e.js
 */
const path = require('path');
const fs = require('fs');
const API = process.env.API || 'http://127.0.0.1:8080/api/v1';
const ADMIN = { email: 'admin@cato.com', password: 'Cato@Admin2026' };

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `  -> ${d}` : ''}`); } };
const section = (t) => console.log(`\n-- ${t} ${'-'.repeat(Math.max(0, 44 - t.length))}`);

async function call(method, p, { token, body, key } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(`${API}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, ok: res.ok, body: json };
}
const mongoUri = () => fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^MONGO_URI=(.+)$/m)[1].trim();
const RUN = Number(process.env.RUN_OFFSET) || 1500 + ((Math.floor(Date.now() / 1000) * 130) % 1_000_000);
const BASE = Date.now() + RUN * 864e5;
const day = (n) => new Date(BASE + n * 864e5).toISOString();

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nUnified message inbox\n');

  const email = `inbox${Date.now()}@test.com`;
  await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: 'Ina', lastName: 'Box' } });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  let auth = (await login()).body.data;
  const userId = auth.user.id;
  await db.collection('users').updateOne({ _id: userId }, { $set: { emailVerified: true, phoneVerified: true } });
  await db.collection('kycs').updateOne(
    { userId },
    { $set: { status: 'approved', level: 'full', updatedAt: new Date() }, $setOnInsert: { _id: `kyc_${userId}`, documents: [], createdAt: new Date() } },
    { upsert: true },
  );
  const token = (await login()).body.data.tokens.accessToken;
  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body?.data?.tokens?.accessToken;

  const car = (await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=1&instantBook=true')).body.data[0];
  const vehicle = await db.collection('vehicles').findOne({ _id: car._id }, { projection: { hostId: 1, make: 1, model: 1, year: 1 } });
  const host = await db.collection('hosts').findOne({ _id: vehicle.hostId }, { projection: { userId: 1, displayName: 1 } });

  let bookingA, bookingB;
  try {
    section('Seed: one booking with a conversation, one without');
    bookingA = (await call('POST', '/bookings', { token, key: `inbA${Date.now()}`, body: { vehicleId: car._id, start: day(20), end: day(24) } })).body?.data?._id;
    bookingB = (await call('POST', '/bookings', { token, key: `inbB${Date.now()}`, body: { vehicleId: car._id, start: day(30), end: day(34) } })).body?.data?._id;
    ok('two bookings created', !!bookingA && !!bookingB);

    await call('POST', `/messages/${bookingA}`, { token, body: { body: 'Hi, is early pickup possible?' } });
    // Counterpart (host) replies — inject with the host's userId so it counts as unread-to-me.
    await db.collection('messages').insertOne({
      _id: `m_${Date.now()}`, bookingId: bookingA, senderId: host.userId, body: 'Sure, 9am works!',
      attachments: [], readBy: [host.userId], createdAt: new Date(), updatedAt: new Date(),
    });

    section('Inbox (guest view)');
    const inbox = (await call('GET', '/messages', { token })).body?.data ?? [];
    const rowA = inbox.find((c) => c.bookingId === bookingA);
    ok('conversation with messages appears', !!rowA, `inbox has ${inbox.length}`);
    ok('empty booking is NOT a conversation', !inbox.some((c) => c.bookingId === bookingB));
    ok('counterpart resolves to the host', rowA?.counterpart?.name === host.displayName, `${rowA?.counterpart?.name} vs ${host.displayName}`);
    ok('car title is enriched', rowA?.vehicle?.title === `${vehicle.year} ${vehicle.make} ${vehicle.model}`, rowA?.vehicle?.title);
    ok('last message preview is the counterpart’s reply', rowA?.last?.preview === 'Sure, 9am works!' && rowA?.last?.fromMe === false, JSON.stringify(rowA?.last));
    ok('unread counts only the counterpart’s message', rowA?.unread === 1, String(rowA?.unread));

    section('Read marking');
    await call('POST', `/messages/${bookingA}/read`, { token });
    const after = (await call('GET', '/messages', { token })).body?.data ?? [];
    ok('unread clears after reading', after.find((c) => c.bookingId === bookingA)?.unread === 0);

    section('Admin dispute thread (connected)');
    const adminThread = await call('GET', `/admin/bookings/${bookingA}/messages`, { token: adminToken });
    ok('admin can read the booking thread', adminThread.ok && adminThread.body.data.length >= 2, `${adminThread.status} len=${adminThread.body?.data?.length}`);
    const noAuth = await call('GET', `/admin/bookings/${bookingA}/messages`);
    ok('admin thread requires authorisation', noAuth.status === 401 || noAuth.status === 403, String(noAuth.status));

    section('Inbox requires auth');
    const anon = await call('GET', '/messages');
    ok('inbox is private', anon.status === 401, String(anon.status));
  } finally {
    for (const id of [bookingA, bookingB]) {
      if (id) { await db.collection('availabilities').deleteMany({ bookingId: id }); await db.collection('messages').deleteMany({ bookingId: id }); }
    }
  }

  console.log('\n' + '='.repeat(46));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(46) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
