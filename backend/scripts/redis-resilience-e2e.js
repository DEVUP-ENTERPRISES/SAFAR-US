/**
 * Redis resilience — auth must survive Redis dying *mid-flight*.
 *
 * The access token is a short-lived, independently-verified JWT; the session
 * registry is a *revocation* layer on top. So when Redis drops out the app
 * should degrade (best-effort writes, liveness fails open) rather than 500 every
 * login and authenticated request — the failure we actually hit in development.
 *
 * Boot-time absence was already handled (main.ts falls back to the in-memory
 * store), so that path proves nothing about this fix. Instead this boots a
 * second app instance against a local TCP proxy to the REAL Redis — so the
 * Redis-backed store is genuinely selected — then kills the proxy to simulate an
 * outage and re-runs the same auth flows.
 *
 * Run: node scripts/redis-resilience-e2e.js
 */
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT_UNDER_TEST || 8099;
const PROXY_PORT = 6398;
const API = `http://127.0.0.1:${PORT}/api/v1`;
const BOOT_TIMEOUT_MS = 90_000;

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `  -> ${d}` : ''}`); } };
const section = (t) => console.log(`\n-- ${t} ${'-'.repeat(Math.max(0, 44 - t.length))}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, p, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, ok: res.ok, body: json };
}

const envFile = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const redisUrl = new URL(envFile.match(/^REDIS_URL=(.+)$/m)[1].trim());

/** TCP passthrough to the real Redis, so we can sever it on demand. */
function startProxy() {
  const sockets = new Set();
  const server = net.createServer((client) => {
    const upstream = net.connect({
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
    });
    sockets.add(client); sockets.add(upstream);
    client.pipe(upstream); upstream.pipe(client);
    const bye = () => { client.destroy(); upstream.destroy(); sockets.delete(client); sockets.delete(upstream); };
    client.on('error', bye); upstream.on('error', bye);
    client.on('close', bye); upstream.on('close', bye);
  });
  return new Promise((resolve) => {
    server.listen(PROXY_PORT, '127.0.0.1', () =>
      resolve({
        kill: () => { for (const s of sockets) s.destroy(); server.close(); },
      }),
    );
  });
}

/**
 * Kill the whole tree. `shell: true` means we spawned cmd → npx → node, and
 * proc.kill() would only reap the shell, leaving a zombie holding the port —
 * which then answers the next run's health check and corrupts its results.
 */
function killTree(proc) {
  if (!proc.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', shell: true });
    } else {
      process.kill(-proc.pid, 'SIGKILL');
    }
  } catch { /* already gone */ }
  try { proc.kill(); } catch { /* already gone */ }
}

/** Refuse to run against a stale server still holding the port. */
async function assertPortFree() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/api/v1/system/health`);
    throw new Error(`port ${PORT} is already serving — kill the stale process first`);
  } catch (e) {
    if (/already serving/.test(e.message)) throw e; // genuinely occupied
  }
}

async function waitForBoot(proc) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`server exited early (code ${proc.exitCode})`);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/v1/system/health`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(1000);
  }
  throw new Error('server did not become healthy in time');
}

(async () => {
  console.log('\nRedis resilience — auth survives Redis dying mid-flight\n');

  await assertPortFree();
  const proxy = await startProxy();
  // Same credentials, but routed through the proxy we can sever.
  const proxied = `redis://${redisUrl.username}:${redisUrl.password}@127.0.0.1:${PROXY_PORT}`;
  const env = { ...process.env, PORT: String(PORT), REDIS_URL: proxied, NODE_ENV: 'development' };

  const entry = fs.existsSync(path.join(__dirname, '..', 'src', 'main.ts')) ? 'src/main.ts' : 'src/index.ts';
  const proc = spawn('npx', ['ts-node', '--transpile-only', entry], {
    cwd: path.join(__dirname, '..'), env, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  });

  let log = '';
  const watch = (b) => { log += String(b); };
  proc.stdout.on('data', watch);
  proc.stderr.on('data', watch);

  try {
    section('Boot with Redis reachable (via proxy)');
    await waitForBoot(proc);
    ok('server boots healthy', true);
    // Critical precondition: if this were the in-memory fallback the whole test
    // would be vacuous, since the fallback never fails in the first place.
    ok('the REAL Redis store is in use (not the in-memory fallback)', /store:\s*Redis/i.test(log), 'boot log did not report the Redis store');

    section('Baseline: auth works normally');
    const emailA = `res${Date.now()}@test.com`;
    const regA = await call('POST', '/auth/register', { body: { email: emailA, password: 'Test@1234', firstName: 'Red', lastName: 'Is' } });
    ok('register works while Redis is up', regA.status === 201, String(regA.status));
    const loginA = await call('POST', '/auth/login', { body: { email: emailA, password: 'Test@1234' } });
    const meA = await call('GET', '/users/me', { token: loginA.body?.data?.tokens?.accessToken });
    ok('authenticated request works while Redis is up', meA.status === 200, String(meA.status));

    section('Sever Redis mid-flight');
    log = '';
    proxy.kill();
    await sleep(3000); // let ioredis notice the socket died
    ok('proxy severed', true);

    section('Auth still works (degraded, not broken)');
    const emailB = `res${Date.now()}b@test.com`;
    const regB = await call('POST', '/auth/register', { body: { email: emailB, password: 'Test@1234', firstName: 'Out', lastName: 'Age' } });
    ok('register succeeds during the outage', regB.status === 201, `${regB.status} ${JSON.stringify(regB.body?.error ?? '')}`);

    const loginB = await call('POST', '/auth/login', { body: { email: emailB, password: 'Test@1234' } });
    ok('login succeeds during the outage', loginB.status === 200, `${loginB.status} ${JSON.stringify(loginB.body?.error ?? '')}`);

    const tokens = loginB.body?.data?.tokens;
    const meB = await call('GET', '/users/me', { token: tokens?.accessToken });
    ok('authenticated request succeeds (liveness fails open)', meB.status === 200, String(meB.status));

    const refreshed = await call('POST', '/auth/token/refresh', { body: { refreshToken: tokens?.refreshToken } });
    ok('token refresh succeeds during the outage', refreshed.status === 200, `${refreshed.status} ${JSON.stringify(refreshed.body?.error ?? '')}`);

    section('Degradation is visible, not silent');
    ok('a degraded-mode warning was logged', /degraded/i.test(log), 'no "degraded" line in the log');

    section('Security invariants still hold');
    const noToken = await call('GET', '/users/me');
    ok('a missing token is still rejected', noToken.status === 401, String(noToken.status));
    const badToken = await call('GET', '/users/me', { token: 'not.a.real.token' });
    ok('a forged/invalid token is still rejected', badToken.status === 401, String(badToken.status));
  } finally {
    killTree(proc);
    try { proxy.kill(); } catch { /* already closed */ }
  }

  console.log('\n' + '='.repeat(46));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(46) + '\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\nFATAL:', e.message, '\n'); process.exit(1); });
