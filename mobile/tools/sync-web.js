#!/usr/bin/env node
/*
 * Copies the website's platform-free logic (API calls, types, hooks, formatters)
 * into packages/core/src/web so the apps run the exact same code as the site.
 *
 *   npm run sync:api    regenerate the copies
 *   npm run check:api   fail if the copies drifted from the website (CI)
 *
 * Imports are followed from ENTRIES. A file that reaches Next.js, the DOM, web
 * storage or a web UI component stops the sync: move the pure part into its own
 * file on the web side first. Files in OWNED are the apps' own implementations
 * (secure token storage, mobile headers, config) and are never overwritten.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.resolve(ROOT, '../frontend/src');
const OUT = path.join(ROOT, 'packages/core/src/web');
const HEADER = '// Generated from frontend/src/%s by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.\n';

const ENTRIES = [
  'lib/api/client.ts',
  'lib/api/types.ts',
  'lib/utils/format.ts',
  'lib/utils/safe-message.ts',
  'lib/data/countries.ts',
  'lib/data/us-states.ts',
  'lib/realtime/socket.ts',
  'lib/realtime/use-live-updates.ts',
  'features/auth/api.ts',
  'features/auth/store.ts',
  'features/auth/types.ts',
  'features/auth/session.ts',
  'features/account/api.ts',
  'features/platform/config.ts',
  'features/vehicles/api.ts',
  'features/vehicles/hooks.ts',
  'features/vehicles/types.ts',
  'features/vehicles/calendar-pricing.ts',
  'features/vehicles/pricing-form.ts',
  'features/vehicles/listing-form.ts',
  'features/vehicles/listing-options.ts',
  'features/vehicles/new-listing.ts',
  'features/vehicles/compare.ts',
  'features/search/search-store.ts',
  'features/search/search-params.ts',
  'features/bookings/api.ts',
  'features/bookings/types.ts',
  'features/bookings/booking-selection.ts',
  'features/bookings/queries.ts',
  'features/bookings/status.ts',
  'features/wallet/api.ts',
  'features/trips/api.ts',
  'features/trips/documents-api.ts',
  'features/trips/guest-photo-api.ts',
  'features/trips/hooks.ts',
  'features/trips/incidents.ts',
  'features/trips/photo-guide.ts',
  'features/ai/api.ts',
  'features/payments/deposits-api.ts',
  'features/account/eligibility-api.ts',
  'features/account/notification-options.ts',
  'features/account/setup-form.ts',
  'features/messaging/hooks.ts',
  'features/messaging/inquiry-hooks.ts',
  'features/favorites/hooks.ts',
  'features/media/secure-url.ts',
  'features/notifications/api.ts',
  'features/violations/api.ts',
  'features/reviews/api.ts',
  'features/hosts/api.ts',
  'features/kb/api.ts',
  'features/kb/markdown-parse.ts',
  'features/kyc/api.ts',
  'features/kyc/copy.ts',
  'features/documents/api.ts',
  'features/claims/api.ts',
  'features/claims/status.ts',
  'features/support/api.ts',
  'features/contact/api.ts',
  'features/contact/content.ts',
  'features/saved-search/api.ts',
  'features/subscriptions/api.ts',
  'features/subscriptions/hooks.ts',
  'features/rewards/api.ts',
  'features/host/api.ts',
  'features/host/hooks.ts',
  'features/host/public-profile.ts',
  'features/host/trips.api.ts',
  'features/host/trip-timing.ts',
  'features/host/trip-handover.ts',
  'features/host/incidentals.ts',
  'features/host/payouts.ts',
  'features/host/profile-form.ts',
  'features/host/fleet-import.ts',
  'features/host/team-api.ts',
  'features/host/tolls-api.ts',
  'features/asset-partners/api.ts',
  'features/asset-partners/hooks.ts',
  'features/asset-partners/status.ts',
  'features/corporate/api.ts',
  'features/partner/workspaces.ts',
  'features/maps/api.ts',
];

// The apps' own versions of these web files.
const OWNED = new Set(['lib/config.ts', 'lib/api/token-store.ts', 'lib/api/platform.ts']);

const PACKAGES = new Set(['react', 'zustand', 'zustand/middleware', '@tanstack/react-query', 'socket.io-client']);
const FORBIDDEN = [
  [/from ['"]next\//, 'imports Next.js'],
  [/from ['"]react-dom/, 'imports react-dom'],
  [/\b(window|document)\.[a-zA-Z]/, 'uses the browser DOM'],
  [/\b(localStorage|sessionStorage)\b/, 'uses web storage'],
  [/navigator\.geolocation/, 'uses browser geolocation'],
];

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

function resolveWeb(fromRel, spec) {
  let base;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  else return null;
  for (const cand of [base, `${base}.ts`, `${base}/index.ts`]) {
    if (OWNED.has(cand)) return cand;
    const abs = path.join(WEB, cand);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return cand;
  }
  if (fs.existsSync(path.join(WEB, `${base}.tsx`))) throw new Error(`${fromRel} imports a web UI component (${spec}); move the logic into a .ts file on the web side`);
  throw new Error(`${fromRel}: cannot resolve ${spec}`);
}

function build() {
  const files = new Map();
  const queue = [...ENTRIES];
  while (queue.length) {
    const rel = queue.shift();
    if (files.has(rel) || OWNED.has(rel)) continue;
    const src = fs.readFileSync(path.join(WEB, rel), 'utf8').replace(/\r\n/g, '\n');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
    for (const [re, why] of FORBIDDEN) if (re.test(code)) throw new Error(`${rel} ${why}; split the pure logic out on the web side`);
    let out = src;
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2] || m[3];
      const target = resolveWeb(rel, spec);
      if (target === null) {
        if (!PACKAGES.has(spec)) throw new Error(`${rel} imports package "${spec}", which the apps don't allow yet (add it to PACKAGES if it works on React Native)`);
        continue;
      }
      queue.push(target);
      const relSpec = path.posix.relative(path.posix.dirname(rel), target.replace(/\.ts$/, '').replace(/\/index$/, ''));
      out = out.split(`'${spec}'`).join(`'${relSpec.startsWith('.') ? relSpec : `./${relSpec}`}'`).split(`"${spec}"`).join(`'${relSpec.startsWith('.') ? relSpec : `./${relSpec}`}'`);
    }
    out = out.replace(/^['"]use client['"];?\n+/, '');
    files.set(rel, HEADER.replace('%s', rel) + out);
  }
  for (const o of OWNED) if (!fs.existsSync(path.join(OUT, o))) throw new Error(`missing app-owned file packages/core/src/web/${o}`);
  return files;
}

function generatedOnDisk() {
  const found = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (fs.readFileSync(abs, 'utf8').startsWith('// Generated from frontend/src/')) found.push(path.relative(OUT, abs).split(path.sep).join('/'));
    }
  };
  walk(OUT);
  return found;
}

function main() {
  const check = process.argv.includes('--check');
  const files = build();
  const stale = generatedOnDisk().filter((f) => !files.has(f));
  const drift = [];
  for (const [rel, content] of files) {
    const abs = path.join(OUT, rel);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current === content) continue;
    if (check) drift.push(rel);
    else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
  }
  if (check) {
    if (drift.length || stale.length) {
      console.error('The apps are out of date with the website. Run `npm run sync:api`.');
      for (const d of drift) console.error('  changed:', d);
      for (const s of stale) console.error('  no longer used:', s);
      process.exit(1);
    }
    console.log(`check:api OK (${files.size} files match the website)`);
    return;
  }
  for (const s of stale) fs.unlinkSync(path.join(OUT, s));
  console.log(`sync:api wrote ${files.size} files${stale.length ? `, removed ${stale.length}` : ''}`);
}

try {
  main();
} catch (err) {
  console.error('sync:api stopped:', err.message);
  process.exit(1);
}
