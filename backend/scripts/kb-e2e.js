/**
 * Knowledge base — self-serve help articles, admin-authored.
 *
 * Support staff draft/publish/curate from the admin console; guests browse,
 * search, read, and vote on the public help centre (no auth). Drafts stay
 * hidden; publishing exposes them; votes and views are real counters; the
 * admin stats endpoint surfaces least-helpful articles.
 *
 * Run: node scripts/kb-e2e.js
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
  console.log('\nKnowledge base\n');

  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body?.data?.tokens?.accessToken;
  const tag = `kbtest-${Date.now()}`;
  const ids = [];
  try {
    section('Authoring (admin)');
    const draft = await call('POST', '/admin/kb/articles', {
      token: adminToken,
      body: { title: 'How do I add a second driver?', summary: 'Add an approved driver to your trip.', body: 'Open your trip and tap **Add driver**. They must verify their licence.', category: 'trips', tags: [tag], status: 'draft' },
    });
    const id = draft.body?.data?._id; const slug = draft.body?.data?.slug; ids.push(id);
    ok('admin creates a draft article', draft.status === 201 && !!id, `${draft.status}`);
    ok('slug is derived from the title', slug === 'how-do-i-add-a-second-driver', slug);

    const dupe = await call('POST', '/admin/kb/articles', {
      token: adminToken,
      body: { title: 'How do I add a second driver?', body: 'Different article, same title.', category: 'trips', tags: [tag], status: 'draft' },
    });
    ids.push(dupe.body?.data?._id);
    ok('a clashing title gets a distinct slug', dupe.body?.data?.slug === 'how-do-i-add-a-second-driver-2', dupe.body?.data?.slug);

    section('Drafts are hidden from the public');
    const hidden = await call('GET', `/support/kb/articles?tag=${tag}`);
    ok('draft not listed publicly', hidden.ok && hidden.body.data.length === 0, JSON.stringify(hidden.body?.data?.length));

    section('Publishing');
    const pub = await call('POST', `/admin/kb/articles/${id}/publish`, { token: adminToken });
    ok('admin publishes the article', pub.ok && pub.body.data.status === 'published' && !!pub.body.data.publishedAt, `${pub.status}`);

    const listed = await call('GET', `/support/kb/articles?tag=${tag}`);
    ok('published article now appears publicly', listed.ok && listed.body.data.some((a) => a.slug === slug));
    ok('list hides the body (summary only)', listed.body.data[0] && listed.body.data[0].body === undefined);

    section('Reading + voting (public)');
    const read1 = await call('GET', `/support/kb/articles/${slug}`);
    ok('reads full body by slug', read1.ok && read1.body.data.body.includes('Add driver'), `${read1.status}`);
    ok('a read counts a view', read1.body.data.views >= 1, String(read1.body?.data?.views));
    const read2 = await call('GET', `/support/kb/articles/${slug}`);
    ok('views increment on each read', read2.body.data.views === read1.body.data.views + 1, `${read1.body.data.views}->${read2.body.data.views}`);

    const up = await call('POST', `/support/kb/articles/${slug}/vote`, { body: { helpful: true } });
    const down = await call('POST', `/support/kb/articles/${slug}/vote`, { body: { helpful: false } });
    ok('"was this helpful?" tallies both ways', up.ok && down.ok && down.body.data.helpful === 1 && down.body.data.notHelpful === 1, JSON.stringify(down.body?.data));

    section('Search + categories (public)');
    const search = await call('GET', `/support/kb/articles?q=${encodeURIComponent('second driver')}`);
    ok('full-text search finds the article', search.ok && search.body.data.some((a) => a.slug === slug), `${search.status}`);
    const cats = await call('GET', '/support/kb/categories');
    ok('categories list includes the article category', cats.ok && cats.body.data.includes('trips'));

    section('Admin stats + lifecycle');
    const stats = await call('GET', '/admin/kb/stats', { token: adminToken });
    ok('stats report published/draft/views', stats.ok && stats.body.data.published >= 1 && stats.body.data.draft >= 1 && stats.body.data.totalViews >= 2, JSON.stringify(stats.body?.data && { p: stats.body.data.published, d: stats.body.data.draft, v: stats.body.data.totalViews }));

    const unpub = await call('POST', `/admin/kb/articles/${id}/unpublish`, { token: adminToken });
    ok('admin can unpublish', unpub.ok && unpub.body.data.status === 'draft');
    const afterUnpub = await call('GET', `/support/kb/articles/${slug}`);
    ok('unpublished article is no longer public', afterUnpub.status === 404, String(afterUnpub.status));

    section('Access control');
    const noAuth = await call('POST', '/admin/kb/articles', { body: { title: 'nope', body: 'no auth here at all' } });
    ok('authoring requires admin authorisation', noAuth.status === 401 || noAuth.status === 403, String(noAuth.status));

    section('Delete');
    const del = await call('DELETE', `/admin/kb/articles/${id}`, { token: adminToken });
    ok('admin deletes an article', del.ok && del.body.data.deleted === true);
    const gone = await call('GET', `/admin/kb/articles/${id}`, { token: adminToken });
    ok('deleted article is gone', gone.status === 404, String(gone.status));
  } finally {
    for (const id of ids) if (id) await db.collection('kbarticles').deleteOne({ _id: id });
  }

  console.log('\n' + '='.repeat(46));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(46) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
