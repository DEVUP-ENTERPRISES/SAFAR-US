/**
 * Customer support — the support-agent lifecycle and KPIs, admin-connected.
 *
 * Ticket → agent first response (stamped) → resolve → requester CSAT. Admin KPI
 * endpoint reports first-response / resolution time, CSAT, volume, escalation
 * rate. All from real ticket timestamps.
 *
 * Run: node scripts/support-e2e.js
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

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nCustomer support\n');

  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body?.data?.tokens?.accessToken;
  const email = `sup${Date.now()}@test.com`;
  await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: 'Sup', lastName: 'T' } });
  const token = (await call('POST', '/auth/login', { body: { email, password: 'Test@1234' } })).body.data.tokens.accessToken;

  const ids = [];
  try {
    section('Ticket lifecycle + first response');
    const t = await call('POST', '/support/tickets', { token, body: { subject: 'Charged twice?', body: 'I think I was double charged.' } });
    const id = t.body?.data?._id; ids.push(id);
    ok('requester opens a ticket', t.ok && !!id, `${t.status}`);

    const early = await call('POST', `/support/tickets/${id}/csat`, { token, body: { rating: 5 } });
    ok('cannot rate CSAT before resolution', early.status === 409 && early.body?.error?.code === 'NOT_RESOLVED', `${early.status}`);

    const reply = await call('POST', `/admin/tickets/${id}/reply`, { token: adminToken, body: { body: 'Looking into it now.' } });
    ok('agent reply stamps first response', reply.ok, `${reply.status} ${JSON.stringify(reply.body?.error ?? '')}`);
    const afterReply = await db.collection('tickets').findOne({ _id: id }, { projection: { firstRespondedAt: 1 } });
    ok('firstRespondedAt is recorded', !!afterReply?.firstRespondedAt);

    const resolve = await call('POST', `/admin/tickets/${id}/resolve`, { token: adminToken });
    ok('agent resolves the ticket', resolve.ok && resolve.body?.data?.status === 'resolved', `${resolve.status}`);

    section('CSAT');
    const rate = await call('POST', `/support/tickets/${id}/csat`, { token, body: { rating: 5 } });
    ok('requester rates CSAT after resolution', rate.ok && rate.body?.data?.csat === 5, `${rate.status} csat=${rate.body?.data?.csat}`);

    section('Escalation');
    const t2 = await call('POST', '/support/tickets', { token, body: { subject: 'Urgent safety', body: 'Unsafe host.' } });
    const id2 = t2.body?.data?._id; ids.push(id2);
    const esc = await call('POST', `/admin/tickets/${id2}/escalate`, { token: adminToken });
    ok('agent escalates a ticket', esc.ok && esc.body?.data?.status === 'escalated', `${esc.status}`);
    const escDoc = await db.collection('tickets').findOne({ _id: id2 }, { projection: { wasEscalated: 1 } });
    ok('escalation is recorded (sticky) for the KPI', escDoc?.wasEscalated === true);

    section('Admin KPIs');
    const m = await call('GET', '/admin/tickets/metrics?days=30', { token: adminToken });
    const kpi = m.body?.data;
    ok('metrics endpoint returns the support KPIs', m.ok && kpi && typeof kpi.volume === 'number', `${m.status}`);
    ok('first-response time is measured', kpi?.firstResponseMinutes !== null && kpi?.firstResponseMinutes >= 0, JSON.stringify(kpi?.firstResponseMinutes));
    ok('resolution time is measured', kpi?.resolutionMinutes !== null, JSON.stringify(kpi?.resolutionMinutes));
    ok('CSAT is aggregated', kpi?.csatAvg !== null && kpi?.csatCount >= 1, `avg=${kpi?.csatAvg} n=${kpi?.csatCount}`);
    ok('escalation rate is a percentage', typeof kpi?.escalationRatePct === 'number' && kpi.escalationRatePct >= 0, String(kpi?.escalationRatePct));

    section('Access control');
    const noAuth = await call('GET', '/admin/tickets/metrics');
    ok('KPIs require admin authorisation', noAuth.status === 401 || noAuth.status === 403, String(noAuth.status));
  } finally {
    for (const id of ids) if (id) await db.collection('tickets').deleteOne({ _id: id });
  }

  console.log('\n' + '='.repeat(46));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(46) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
