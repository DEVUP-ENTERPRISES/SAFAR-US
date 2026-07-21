/**
 * Prints the admin route registry as a .env comment block.
 * Run: node scripts/admin-routes.js         (view)
 *      node scripts/admin-routes.js --write (sync into .env and .env.example)
 */
const fs = require('fs');
const path = require('path');

// The console's base path is configurable, so resolve the same ADMIN_SLUG the
// app will boot with rather than assuming /admin.
function envSlug() {
  for (const file of ['.env', '.env.example']) {
    const p = path.join(__dirname, '..', file);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, 'utf8').match(/^ADMIN_SLUG=(.+)$/m);
    if (m) return m[1].trim();
  }
  return 'admin';
}
const BASE = `/${envSlug()}`;

const src = fs.readFileSync(path.join(__dirname, '..', 'src/modules/admin/admin.nav.ts'), 'utf8');
// nav entries write paths as A() / A('sub') — see the helper in admin.nav.ts.
const rows = [...src.matchAll(
  /slug:\s*'([^']+)',\s*path:\s*A\(\s*(?:'([^']*)')?\s*\),\s*apiPath:\s*'([^']+)',\s*label:\s*'([^']+)',\s*group:\s*'([^']+)',\s*permission:\s*'([^']+)'/g,
)].map((m) => ({
  slug: m[1],
  path: m[2] ? `${BASE}/${m[2]}` : BASE,
  apiPath: m[3], label: m[4], group: m[5], permission: m[6],
}));
if (rows.length === 0) {
  console.error('admin-routes: parsed 0 entries — admin.nav.ts shape changed, fix the regex.');
  process.exit(1);
}

const W = (a, n) => a.padEnd(n);
const lines = [
  '# ─── ADMIN ROUTE REGISTRY (generated — do not edit by hand) ───────────',
  '# Source of truth: src/modules/admin/admin.nav.ts, served at GET /admin/nav.',
  '# Regenerate with: npm run admin:routes',
  '# Listed here for reference only; nothing reads these values.',
  `# ${W('SLUG', 16)}${W('PATH', Math.max(20, BASE.length + 16))}${W('API', 26)}PERMISSION`,
];
let group = '';
for (const r of rows) {
  if (r.group !== group) { group = r.group; lines.push(`#   ── ${group} ──`); }
  lines.push(`# ${W(r.slug, 16)}${W(r.path, Math.max(20, BASE.length + 16))}${W(r.apiPath, 26)}${r.permission}`);
}
lines.push('# ──────────────────────────────────────────────────────────────────────');
const block = lines.join('\n');

if (!process.argv.includes('--write')) { console.log(block); process.exit(0); }

const START = '# ─── ADMIN ROUTE REGISTRY';
const END = '# ─────────────────────────────────────────────────────────────────────';
for (const file of ['.env', '.env.example']) {
  const p = path.join(__dirname, '..', file);
  if (!fs.existsSync(p)) continue;
  let content = fs.readFileSync(p, 'utf8');
  const s = content.indexOf(START);
  if (s !== -1) {
    const e = content.indexOf(END, s);
    const end = e === -1 ? content.length : e + END.length + 1;
    content = content.slice(0, s) + content.slice(end);   // drop the old block
  }
  content = content.replace(/\s*$/, '\n') + '\n' + block + '\n';
  fs.writeFileSync(p, content);
  console.log(`synced ${rows.length} routes → ${file}`);
}
