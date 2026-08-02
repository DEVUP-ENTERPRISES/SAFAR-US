/**
 * Identity verification — the automated flow the client drives.
 *
 * Mirrors exactly what the /account/verify-identity screen calls:
 * status → start a verification session → (dev) force a decision → status.
 * In stub mode (no live Stripe keys) the session is a stub and the decision is
 * forced via /kyc/dev/decide; with live keys the decision would arrive by
 * webhook instead.
 *
 * Run: node scripts/kyc-e2e.js
 */
const path = require('path');
const fs = require('fs');
const API = process.env.API || 'http://127.0.0.1:8080/api/v1';

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

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nIdentity verification\n');

  const email = `kyc${Date.now()}@test.com`;
  await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: 'Kay', lastName: 'See' } });
  const token = (await call('POST', '/auth/login', { body: { email, password: 'Test@1234' } })).body.data.tokens.accessToken;
  const userId = (await call('GET', '/users/me', { token })).body.data.id;

  try {
    section('Before verifying');
    const s0 = await call('GET', '/kyc/status', { token });
    ok('a new guest starts not_started', s0.ok && s0.body.data.status === 'not_started', JSON.stringify(s0.body?.data));

    section('Start a verification session');
    const start = await call('POST', '/kyc/verification-session', { token });
    ok('session is created', start.status === 201 && !!start.body?.data?.sessionId, `${start.status}`);
    ok('client gets a way to open capture (clientSecret or url)', !!(start.body?.data?.clientSecret || start.body?.data?.url));
    const s1 = await call('GET', '/kyc/status', { token });
    ok('status flips to pending after starting', s1.body.data.status === 'pending', JSON.stringify(s1.body?.data));

    const stub = start.body.data.provider === 'stub';
    console.log(`  (provider: ${start.body.data.provider}${stub ? ' — dev decision path' : ' — webhook path'})`);

    section('Decision');
    if (stub) {
      // Reject first (with reason), then a fresh session + approve — proves both terminal states.
      const rej = await call('POST', '/kyc/dev/decide', { token, body: { status: 'rejected', reason: 'documents_unreadable' } });
      ok('dev decision endpoint applies a rejection', rej.ok, `${rej.status}`);
      const sr = await call('GET', '/kyc/status', { token });
      ok('rejection surfaces status + reason for the retry screen', sr.body.data.status === 'rejected' && sr.body.data.reason === 'documents_unreadable', JSON.stringify(sr.body?.data));

      await call('POST', '/kyc/verification-session', { token }); // retry
      const app = await call('POST', '/kyc/dev/decide', { token, body: { status: 'verified' } });
      ok('a retry can be approved', app.ok, `${app.status}`);
      const sa = await call('GET', '/kyc/status', { token });
      ok('approval surfaces as approved', sa.body.data.status === 'approved', JSON.stringify(sa.body?.data));
    } else {
      // Live provider: /dev/decide must NOT exist — decisions only come by webhook.
      const dev = await call('POST', '/kyc/dev/decide', { token, body: { status: 'verified' } });
      ok('dev decision route is absent under a live provider', dev.status === 404, `${dev.status}`);
    }

    section('Access control');
    const noAuth = await call('POST', '/kyc/verification-session');
    ok('starting a session requires auth', noAuth.status === 401, String(noAuth.status));
  } finally {
    await db.collection('kycs').deleteMany({ userId });
    await db.collection('users').deleteOne({ _id: userId });
  }

  console.log('\n' + '='.repeat(46));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(46) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
