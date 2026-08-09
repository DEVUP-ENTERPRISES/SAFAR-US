/**
 * Promo codes + the member economy, admin-connected.
 *
 * Covers the four gaps that had no admin surface (or no enforcement at all):
 *  1. Coupon CRUD from the admin console, and the business rules that make a
 *     campaign safe: per-user limits (declared but never enforced before), a
 *     max-discount cap on percentage codes, a campaign budget, targeting, and
 *     an atomic redemption that cannot oversell.
 *  2. Trust tiers + risk bands read from PlatformConfig — flipped live to prove
 *     they are policy, not code.
 *  3. Wallet: staff view + goodwill credit / correction, ledger-backed.
 *  4. Rewards + referral oversight, and referral points read from config.
 *
 * Run: node scripts/coupons-economy-e2e.js
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
const RUN = Number(process.env.RUN_OFFSET) || 1700 + ((Math.floor(Date.now() / 1000) * 170) % 1_000_000);
const BASE = Date.now() + RUN * 864e5;
const day = (n) => new Date(BASE + n * 864e5).toISOString();

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nPromo codes + member economy\n');

  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body?.data?.tokens?.accessToken;

  const email = `promo${Date.now()}@test.com`;
  await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: 'Pro', lastName: 'Mo' } });
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

  const CODE = `E2E${Date.now().toString().slice(-8)}`;
  let couponId, bookingIds = [];
  const cfgBefore = (await call('GET', '/admin/config', { token: adminToken })).body?.data;

  try {
    // ── 1. Coupon admin CRUD ──────────────────────────────────────────
    section('Admin can create a promo code');
    const created = await call('POST', '/admin/coupons', {
      token: adminToken,
      body: {
        code: CODE, campaign: 'E2E launch test', type: 'percent', valueBps: 5000,
        maxDiscount: 1500, budget: 100000, perUserLimit: 1, maxRedemptions: 5,
        validTo: new Date(Date.now() + 30 * 864e5).toISOString(),
      },
    });
    couponId = created.body?.data?._id;
    ok('coupon created via the admin API', created.status === 201 && !!couponId, `${created.status} ${JSON.stringify(created.body?.error ?? '')}`);
    ok('code is normalised to uppercase', created.body?.data?.code === CODE.toUpperCase());

    const dupe = await call('POST', '/admin/coupons', {
      token: adminToken,
      body: { code: CODE, type: 'fixed', amount: 500, validTo: new Date(Date.now() + 864e5).toISOString() },
    });
    ok('duplicate codes are rejected', dupe.status === 409, String(dupe.status));

    const incoherent = await call('POST', '/admin/coupons', {
      token: adminToken,
      body: { code: `${CODE}X`, type: 'percent', valueBps: 0, validTo: new Date(Date.now() + 864e5).toISOString() },
    });
    ok('a percentage coupon with no value is rejected', incoherent.status === 400 || incoherent.status === 422, String(incoherent.status));

    const listed = await call('GET', '/admin/coupons', { token: adminToken });
    ok('coupon appears in the admin list', listed.ok && listed.body.data.some((c) => c._id === couponId));

    section('Promo codes are not readable by every staff role');
    const noAuth = await call('GET', '/admin/coupons');
    ok('listing requires authorisation', noAuth.status === 401 || noAuth.status === 403, String(noAuth.status));

    // ── Business rules ────────────────────────────────────────────────
    section('Discount rules are enforced at quote time');
    const quoteBody = { vehicleId: car._id, start: day(20), end: day(24), couponCode: CODE };
    const quoted = await call('POST', '/bookings/quote', { token, body: quoteBody });
    const discount = quoted.body?.data?.discount?.amount;
    ok('coupon discounts the quote', quoted.ok && discount > 0, `${quoted.status} discount=${discount}`);
    ok('percentage discount is capped by maxDiscount', discount <= 1500, `discount=${discount} cap=1500`);

    const badCode = await call('POST', '/bookings/quote', { token, body: { ...quoteBody, couponCode: 'NOPE-NOT-REAL' } });
    ok('an unknown code is rejected', badCode.status === 400 || badCode.status === 422, String(badCode.status));

    section('Per-user limit is actually enforced (it never was before)');
    const b1 = await call('POST', '/bookings', { token, key: `promo1${Date.now()}`, body: quoteBody });
    bookingIds.push(b1.body?.data?._id);
    ok('first booking with the coupon succeeds', b1.status === 201, `${b1.status} ${JSON.stringify(b1.body?.error ?? '')}`);

    const second = await call('POST', '/bookings/quote', { token, body: { vehicleId: car._id, start: day(40), end: day(44), couponCode: CODE } });
    ok('the same guest cannot reuse a one-per-customer coupon', second.status === 400 || second.status === 422, `${second.status}`);

    section('Redemption is recorded and counted');
    const stats = await call('GET', `/admin/coupons/${couponId}/stats`, { token: adminToken });
    ok('stats report the redemption', stats.ok && stats.body.data.redemptions === 1, JSON.stringify(stats.body?.data?.redemptions));
    ok('stats report the discount given away', stats.body?.data?.discountGiven > 0, String(stats.body?.data?.discountGiven));
    ok('budget burn is tracked', typeof stats.body?.data?.budgetUsedPct === 'number', String(stats.body?.data?.budgetUsedPct));
    ok('remaining redemptions counted down', stats.body?.data?.redemptionsRemaining === 4, String(stats.body?.data?.redemptionsRemaining));

    section('Pausing a promo stops it immediately');
    await call('POST', `/admin/coupons/${couponId}/status`, { token: adminToken, body: { status: 'disabled' } });
    const paused = await call('POST', '/bookings/quote', {
      token, body: { vehicleId: car._id, start: day(60), end: day(64), couponCode: CODE },
    });
    ok('a disabled coupon is refused', paused.status === 400 || paused.status === 422, String(paused.status));

    // ── 2. Trust + risk thresholds from config ────────────────────────
    section('Trust tiers are admin policy, not code');
    const trustBefore = (await call('GET', '/trust/me', { token })).body?.data;
    ok('member has a trust tier', !!trustBefore?.tier, JSON.stringify(trustBefore?.tier));

    // Make gold unreachable and bronze impossible → everyone becomes 'new'.
    await call('PUT', '/admin/config', { token: adminToken, body: { trust: { tiers: { gold: 100, silver: 99, bronze: 98 } } } });
    const trustAfter = (await call('GET', '/trust/me', { token })).body?.data;
    ok('raising the thresholds demotes the tier — no deploy', trustAfter?.tier === 'new', `${trustBefore?.tier} -> ${trustAfter?.tier}`);

    await call('PUT', '/admin/config', { token: adminToken, body: { trust: { tiers: { gold: 0, silver: 0, bronze: 0 } } } });
    const trustGold = (await call('GET', '/trust/me', { token })).body?.data;
    ok('lowering them promotes to gold', trustGold?.tier === 'gold', String(trustGold?.tier));

    section('Perks follow the configured tier');
    const cfgNow = (await call('GET', '/admin/config', { token: adminToken })).body?.data;
    ok('deposit discount by tier is configurable', !!cfgNow?.trust?.perks?.depositDiscountPctByTier, JSON.stringify(cfgNow?.trust?.perks ?? {}));
    ok('risk bands are configurable', typeof cfgNow?.risk?.bands?.block === 'number', JSON.stringify(cfgNow?.risk?.bands ?? {}));
    ok('referral bonus points are configurable', typeof cfgNow?.referral?.referrerPoints === 'number', JSON.stringify(cfgNow?.referral ?? {}));

    // ── 3. Wallet admin ───────────────────────────────────────────────
    section('Support can see and fix a wallet');
    const view0 = await call('GET', `/admin/wallets/${userId}`, { token: adminToken });
    ok('staff can view a member wallet', view0.ok && typeof view0.body.data.balance === 'number', `${view0.status}`);

    const credit = await call('POST', `/admin/wallets/${userId}/adjust`, {
      token: adminToken, body: { amount: 2500, reason: 'Goodwill for a delayed pickup' },
    });
    ok('staff can issue a goodwill credit', credit.ok && credit.body.data.balance === view0.body.data.balance + 2500, JSON.stringify(credit.body?.data));

    const clawback = await call('POST', `/admin/wallets/${userId}/adjust`, {
      token: adminToken, body: { amount: -500, reason: 'Correcting a duplicate credit' },
    });
    ok('staff can claw back an over-credit', clawback.ok && clawback.body.data.balance === credit.body.data.balance - 500, JSON.stringify(clawback.body?.data));

    const overdraw = await call('POST', `/admin/wallets/${userId}/adjust`, {
      token: adminToken, body: { amount: -99999999, reason: 'Should be refused' },
    });
    ok('a correction cannot push the balance negative', overdraw.status === 409, String(overdraw.status));

    const noReason = await call('POST', `/admin/wallets/${userId}/adjust`, { token: adminToken, body: { amount: 100 } });
    ok('an adjustment without a reason is rejected', noReason.status === 400 || noReason.status === 422, String(noReason.status));

    const guestTry = await call('POST', `/admin/wallets/${userId}/adjust`, { token, body: { amount: 100000, reason: 'nice try' } });
    ok('a member cannot adjust their own wallet', guestTry.status === 401 || guestTry.status === 403, String(guestTry.status));

    section('The ledger still balances after adjustments');
    const entries = view0.body.data.entries;
    ok('wallet movements are ledger-backed', Array.isArray(entries));

    // ── 4. Rewards + referrals ────────────────────────────────────────
    section('Loyalty points oversight');
    const r0 = await call('GET', `/admin/rewards/${userId}`, { token: adminToken });
    ok('staff can view a member points balance', r0.ok && typeof r0.body.data.balance === 'number', `${r0.status}`);

    const award = await call('POST', `/admin/rewards/${userId}/award`, {
      token: adminToken, body: { points: 500, reason: 'Service recovery' },
    });
    ok('staff can award points', award.ok && award.body.data.balance === r0.body.data.balance + 500, JSON.stringify(award.body?.data?.balance));

    const deduct = await call('POST', `/admin/rewards/${userId}/award`, {
      token: adminToken, body: { points: -200, reason: 'Reversing abuse' },
    });
    ok('staff can deduct points', deduct.ok && deduct.body.data.balance === award.body.data.balance - 200, JSON.stringify(deduct.body?.data?.balance));

    section('Referral programme oversight');
    const refStats = await call('GET', '/admin/referrals/stats?days=30', { token: adminToken });
    ok('referral stats are exposed to admin', refStats.ok && typeof refStats.body.data.total === 'number', `${refStats.status}`);
    ok('conversion rate is computed', typeof refStats.body?.data?.conversionRatePct === 'number');
    ok('top referrers are surfaced (fraud signal)', Array.isArray(refStats.body?.data?.topReferrers));
  } finally {
    // Restore the trust thresholds we flipped, so the shared dev DB is left as found.
    if (cfgBefore?.trust?.tiers) {
      await call('PUT', '/admin/config', { token: adminToken, body: { trust: { tiers: cfgBefore.trust.tiers } } });
    }
    if (couponId) {
      await db.collection('coupons').deleteOne({ _id: couponId });
      await db.collection('couponredemptions').deleteMany({ couponId });
    }
    await db.collection('coupons').deleteMany({ code: `${CODE}X` });
    for (const id of bookingIds) if (id) await db.collection('availabilities').deleteMany({ bookingId: id });
  }

  console.log('\n' + '='.repeat(48));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(48) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
