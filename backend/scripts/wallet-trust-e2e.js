/**
 * Trust-scaled wallet caps.
 *
 * A brand-new account cannot warehouse large sums (AML / stolen-card cash-out);
 * the cap rises with trust tier. Config-driven, enforced at top-up.
 *
 * Run: node scripts/wallet-trust-e2e.js
 */
const path = require('path');
const fs = require('fs');
const API = process.env.API || 'http://127.0.0.1:8080/api/v1';
const ADMIN = { email: 'admin@cato.com', password: 'Cato@Admin2026' };

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `  -> ${d}` : ''}`); } };

async function call(method, p, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, ok: res.ok, body: json };
}
const mongoUri = () => fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^MONGO_URI=(.+)$/m)[1].trim();
const topup = (token, amount) => call('POST', '/wallet/topup', { token, body: { amount } });

// Defaults from PlatformConfig.wallet.maxBalanceCentsByTier.
const CAP = { new: 50000, bronze: 200000, gold: 1000000 };

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nTrust-scaled wallet caps\n');

  const reg = async (prefix, verified) => {
    const email = `${prefix}${Date.now()}${Math.floor(Math.random() * 1e4)}@test.com`;
    await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: prefix, lastName: 'T' } });
    const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
    const id = (await login()).body.data.user.id;
    if (verified) {
      await db.collection('users').updateOne({ _id: id }, { $set: { emailVerified: true, phoneVerified: true } });
      await db.collection('kycs').updateOne({ userId: id }, { $set: { status: 'approved', level: 'full', updatedAt: new Date() }, $setOnInsert: { _id: `kyc_${id}`, documents: [], createdAt: new Date() } }, { upsert: true });
    }
    return { id, token: (await login()).body.data.tokens.accessToken };
  };

  const seedIds = [];
  try {
    // ── New (unverified) → smallest cap ────────────────────────────────
    const nu = await reg('wnew', false);
    ok('new account: top-up within cap succeeds', (await topup(nu.token, CAP.new - 10000)).ok);
    ok('new account: a top-up over the cap is rejected', (await topup(nu.token, 20000)).status >= 400);

    // ── Bronze (verified) → higher cap ─────────────────────────────────
    const br = await reg('wbrz', true);
    const trust = (await call('GET', '/trust/me', { token: br.token })).body?.data;
    ok('verified fresh guest is at least bronze', ['bronze', 'silver', 'gold'].includes(trust?.tier), `tier=${trust?.tier}`);
    ok('bronze: top-up near the bronze cap succeeds', (await topup(br.token, CAP.bronze - 10000)).ok);
    ok('bronze: a top-up over the bronze cap is rejected', (await topup(br.token, 20000)).status >= 400);

    // ── Gold → highest cap ─────────────────────────────────────────────
    const gd = await reg('wgld', true);
    await db.collection('bookings').insertMany(Array.from({ length: 30 }, (_, i) => ({ _id: `wseed_${gd.id}_${i}`, code: `wseed_${gd.id}_${i}`, guestId: gd.id, status: 'completed', createdAt: new Date() })));
    await db.collection('reviews').insertMany([1, 2].map((i) => ({ _id: `wrev_${gd.id}_${i}`, subjectId: gd.id, rating: 5, status: 'published', direction: 'host_to_guest', bookingId: `wrbk_${gd.id}_${i}`, authorId: 'wseed', createdAt: new Date() })));
    const gTrust = (await call('GET', '/trust/me', { token: gd.token })).body?.data;
    ok('seeded guest reaches gold', gTrust?.tier === 'gold', `tier=${gTrust?.tier}`);
    ok('gold: a top-up far above the bronze cap succeeds', (await topup(gd.token, CAP.bronze + 100000)).ok);
    seedIds.push(gd.id);
  } finally {
    await db.collection('bookings').deleteMany({ _id: /^wseed_/ });
    await db.collection('reviews').deleteMany({ authorId: 'wseed' });
  }

  console.log('\n' + '='.repeat(46));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(46) + '\n');
  void ADMIN; void seedIds;
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
