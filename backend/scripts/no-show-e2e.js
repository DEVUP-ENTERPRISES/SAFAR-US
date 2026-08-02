/**
 * No-show handling.
 *
 * Guest no-show: forfeits a configurable share, the rest refunded, and the host
 * earns their part of the forfeit (scheduled payout). Host no-show: full refund
 * + rebooking event. Reporting is asymmetric — host reports guest, guest reports
 * host — so neither side self-serves.
 *
 * Run: node scripts/no-show-e2e.js
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
const RUN = 3200 + ((Math.floor(Date.now() / 1000) * 170) % 700_000);
const BASE = Date.now() + RUN * 864e5;
const day = (n) => new Date(BASE + n * 864e5).toISOString();
const balance = async (token) => (await call('GET', '/wallet', { token })).body?.data?.balance ?? 0;

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nNo-show handling\n');

  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body?.data?.tokens?.accessToken;
  const email = `ns${Date.now()}@test.com`;
  await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: 'NS', lastName: 'T' } });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  const gid = (await login()).body.data.user.id;
  await db.collection('users').updateOne({ _id: gid }, { $set: { emailVerified: true, phoneVerified: true } });
  await db.collection('kycs').updateOne({ userId: gid }, { $set: { status: 'approved', level: 'full', updatedAt: new Date() }, $setOnInsert: { _id: `kyc_${gid}`, documents: [], createdAt: new Date() } }, { upsert: true });
  const token = (await login()).body.data.tokens.accessToken;

  const car = (await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=1&instantBook=true')).body.data[0];
  const cfg = (await call('GET', '/platform/config')).body?.data; // no noShow in public; use default 50%
  const forfeit = 0.5;

  const ids = [];
  const book = async (off) => {
    const b = await call('POST', '/bookings', { token, key: `ns${Date.now()}${Math.random()}`, body: { vehicleId: car._id, start: day(off), end: day(off + 2) } });
    ids.push(b.body?.data?._id);
    return b.body?.data;
  };
  const backdate = (id) => db.collection('bookings').updateOne({ _id: id }, { $set: { 'period.start': new Date(Date.now() - 6 * 3600e3) } });

  try {
    // ── Guest no-show ────────────────────────────────────────────────
    section('Guest no-show');
    const b1 = await book(5);
    const total1 = b1.priceBreakdown.total.amount;
    const host1 = b1.priceBreakdown.hostEarnings.amount;

    const tooEarly = await call('POST', `/bookings/${b1._id}/no-show`, { token: adminToken, body: { party: 'guest' } });
    ok('cannot declare a no-show before start + grace', tooEarly.status === 409 && tooEarly.body?.error?.code === 'TOO_EARLY', `${tooEarly.status} ${JSON.stringify(tooEarly.body?.error)}`);

    await backdate(b1._id);
    const selfServe = await call('POST', `/bookings/${b1._id}/no-show`, { token, body: { party: 'guest' } });
    ok('a guest cannot report their own no-show', selfServe.status === 403, String(selfServe.status));

    const before1 = await balance(token);
    const ns1 = await call('POST', `/bookings/${b1._id}/no-show`, { token: adminToken, body: { party: 'guest' } });
    ok('guest no-show is accepted', ns1.ok && ns1.body?.data?.status === 'cancelled_guest', `${ns1.status} ${ns1.body?.data?.status}`);
    ok('guest is refunded all but the forfeit', (await balance(token)) - before1 === Math.round(total1 * (1 - forfeit)), `${(await balance(token)) - before1} vs ${Math.round(total1 * (1 - forfeit))}`);

    await sleep(600); // async payout subscriber
    const payout = await db.collection('payouts').findOne({ bookingId: b1._id });
    ok('host earns their share of the forfeit (payout scheduled)', payout && payout.amount === Math.round(host1 * forfeit), `payout=${payout?.amount} vs ${Math.round(host1 * forfeit)}`);

    // ── Host no-show ─────────────────────────────────────────────────
    section('Host no-show');
    const b2 = await book(30);
    const total2 = b2.priceBreakdown.total.amount;
    await backdate(b2._id);
    const before2 = await balance(token);
    const ns2 = await call('POST', `/bookings/${b2._id}/no-show`, { token, body: { party: 'host' } });
    ok('host no-show is accepted (guest reports)', ns2.ok && ns2.body?.data?.status === 'cancelled_host', `${ns2.status} ${ns2.body?.data?.status}`);
    ok('guest is fully refunded on a host no-show', (await balance(token)) - before2 === total2, `${(await balance(token)) - before2} vs ${total2}`);

    // ── Ledger integrity ─────────────────────────────────────────────
    section('Ledger integrity');
    const rows = await db.collection('ledgerentries').aggregate([{ $group: { _id: '$direction', t: { $sum: '$amount' } } }]).toArray();
    const credit = (rows.find((x) => x._id === 'credit') || { t: 0 }).t;
    const debit = (rows.find((x) => x._id === 'debit') || { t: 0 }).t;
    ok('ledger globally balanced', credit === debit, `${credit} vs ${debit}`);
    void cfg;
  } finally {
    for (const id of ids) if (id) await db.collection('availabilities').deleteMany({ bookingId: id });
  }

  console.log('\n' + '='.repeat(46));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(46) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
