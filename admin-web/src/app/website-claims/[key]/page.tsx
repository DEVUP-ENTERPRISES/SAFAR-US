'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { websiteComplianceApi, CLAIM_STATUS, type WebsiteClaim } from '@/features/admin/website-compliance-api';
import { ApiError } from '@/lib/api/types';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { adminPath } from '@/lib/admin-path';

type Form = { label: string; display: string; value: string; asOf: string; wording: string; definition: string; pages: string; owner: string; note: string };
const toForm = (c: WebsiteClaim): Form => ({
  label: c.draft.label, display: c.draft.display, value: c.draft.value === undefined ? '' : String(c.draft.value), asOf: c.draft.asOf ?? '',
  wording: c.wording, definition: c.definition, pages: c.pages.join(', '), owner: c.owner, note: '',
});

export default function WebsiteClaimPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['admin-website-claim', key], queryFn: () => websiteComplianceApi.claim(key) });
  const rules = useQuery({ queryKey: ['admin-website-claim-rules'], queryFn: websiteComplianceApi.rules, staleTime: 10 * 60_000 });
  const [form, setForm] = useState<Form | null>(null);
  const [ev, setEv] = useState({ label: '', url: '', note: '' });
  useEffect(() => { if (q.data) setForm(toForm(q.data)); }, [q.data]);

  const done = (title: string) => (c: WebsiteClaim) => {
    qc.setQueryData(['admin-website-claim', key], { ...q.data, ...c });
    void qc.invalidateQueries({ queryKey: ['admin-website-claim', key] });
    void qc.invalidateQueries({ queryKey: ['admin-website-claims'] });
    toast({ tone: 'success', title });
  };
  const fail = (e: unknown) => toast({ tone: 'error', title: e instanceof ApiError ? (e.status === 403 ? 'Your role can’t do this step.' : e.message) : 'That didn’t go through. Try again.' });
  const act = useMutation({ meta: { silentError: true }, mutationFn: (fn: () => Promise<WebsiteClaim>) => fn(), onError: fail });

  if (q.isLoading || !form) return q.isError ? <ErrorState message="We couldn’t load this claim." retry={() => void q.refetch()} /> : <Skeleton className="h-96 w-full rounded-lg" />;
  const c = q.data!;
  const names = c.names ?? {};
  const who = (id: string) => (id === 'system' ? 'System' : names[id] ?? 'Staff');
  const needsLegal = rules.data?.needsLegal.includes(c.category);
  const isText = c.draft.kind === 'text';
  const valueNum = form.value.trim() === '' ? null : Number(form.value);
  const formError = form.label.trim().length < 2 ? 'Add a label.' : form.display.trim() === '' ? 'Add the figure as shown.' : valueNum !== null && (!Number.isFinite(valueNum) || valueNum < 0) ? 'The number must be 0 or more.' : form.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(form.asOf) ? 'Pick a date.' : null;

  const save = () => act.mutate(() => websiteComplianceApi.update(key, {
    label: form.label.trim(), display: form.display.trim(), value: valueNum, asOf: form.asOf || null, wording: form.wording.trim(), definition: form.definition.trim(),
    pages: form.pages.split(',').map((p) => p.trim()).filter(Boolean), owner: form.owner, note: form.note.trim() || undefined,
  }), { onSuccess: done('Saved. It needs verification and approval before the website changes.') });

  const withNote = async (title: string, label: string, required: boolean, run: (note: string) => Promise<WebsiteClaim>, success: string, destructive = false) => {
    const r = await confirm({ title, confirmLabel: title, tone: destructive ? 'destructive' : 'default', reason: { label, required } });
    if (r.ok) act.mutate(() => run(r.reason), { onSuccess: done(success) });
  };

  return (
    <div className="space-y-6">
      <Link href={adminPath('website-claims')} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Website claims</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{c.wording}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{c.category.replace('_', ' ')} · Owner: {c.owner} · Review every {rules.data?.reviewDays[c.category] ?? '—'} days{needsLegal ? ' · Needs legal review' : ''}</p>
        </div>
        <Badge tone={CLAIM_STATUS[c.status].tone}>{CLAIM_STATUS[c.status].label}</Badge>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Next step</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid gap-2 sm:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">On the website now</dt><dd className="font-semibold tabular-nums">{c.live ? c.live.display : c.status === 'suspended' ? 'Hidden (suspended)' : '—'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Last reviewed</dt><dd>{c.lastReviewedAt ? formatDate(c.lastReviewedAt) : 'Not yet'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Next review</dt><dd>{c.nextReviewAt ? formatDate(c.nextReviewAt) : '—'}</dd></div>
          </dl>
          {isText && <p className="rounded-lg bg-subtle p-3 text-xs">This is wording in the page text. Approving records the sign-off; suspending emails the team to remove it from the pages listed.</p>}
          <div className="flex flex-wrap gap-2">
            {['draft', 'evidence'].includes(c.status) && (
              <Button size="sm" disabled={!c.evidence.length} loading={act.isPending} onClick={() => void withNote('Verify', 'What you checked (optional)', false, (n) => websiteComplianceApi.verify(key, n || undefined), needsLegal ? 'Verified. Now record the legal review.' : 'Verified. Ready to approve.')}>
                Verify against the evidence
              </Button>
            )}
            {c.status === 'legal_review' && (
              <Button size="sm" loading={act.isPending} onClick={() => void withNote('Record legal review', 'Counsel and what they approved', true, (n) => websiteComplianceApi.legalReview(key, n), 'Legal review recorded. Ready to approve.')}>
                Record legal review
              </Button>
            )}
            {c.status === 'verified' && (
              <Button size="sm" loading={act.isPending} onClick={() => void withNote('Approve and publish', 'Note (optional)', false, (n) => websiteComplianceApi.approve(key, n || undefined), 'Approved. The website shows it within a few minutes.')}>
                Approve and publish
              </Button>
            )}
            {c.status === 'approved' && (
              <Button size="sm" variant="outline" loading={act.isPending} onClick={() => void withNote('Mark reviewed', 'What you checked (optional)', false, (n) => websiteComplianceApi.reviewed(key, n || undefined), 'Marked reviewed.')}>
                Still accurate, mark reviewed
              </Button>
            )}
            {c.status !== 'suspended' && (
              <Button size="sm" variant="destructive" loading={act.isPending} onClick={() => void withNote('Suspend', 'Why it may be inaccurate', true, (n) => websiteComplianceApi.suspend(key, n), 'Suspended and taken off the website.', true)}>
                Suspend
              </Button>
            )}
          </div>
          {['draft', 'evidence'].includes(c.status) && !c.evidence.length && <p className="text-xs text-muted-foreground">Add at least one supporting record below before verifying.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Evidence</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">Needed: {rules.data?.evidenceHint[c.category] ?? '…'}</p>
          {c.evidence.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {c.evidence.map((e) => (
                <li key={e._id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-medium">{e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{e.label} <ExternalLink className="h-3 w-3" /></a> : e.label}</span>
                    <span className="block text-xs text-muted-foreground">{who(e.addedBy)} · {formatDateTime(e.addedAt)}{e.note ? ` · ${e.note}` : ''}</span>
                  </span>
                  <button type="button" aria-label={`Remove ${e.label}`} className="rounded-sm p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => void withNote('Remove evidence', 'Why (optional)', false, () => websiteComplianceApi.removeEvidence(key, e._id), 'Evidence removed.', true)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="text-muted-foreground">No supporting records yet.</p>}
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr]" onSubmit={(e) => { e.preventDefault(); act.mutate(() => websiteComplianceApi.addEvidence(key, { label: ev.label.trim(), url: ev.url.trim() || undefined, note: ev.note.trim() || undefined }), { onSuccess: (r) => { setEv({ label: '', url: '', note: '' }); done('Evidence added')(r); } }); }}>
            <Field label="Record" htmlFor="ev-label"><Input id="ev-label" maxLength={160} placeholder="e.g. General ledger, Nov 2026" value={ev.label} onChange={(e) => setEv({ ...ev, label: e.target.value })} /></Field>
            <Field label="Link (optional)" htmlFor="ev-url" error={ev.url && !ev.url.startsWith('https://') ? 'Use an https:// link' : undefined}><Input id="ev-url" type="url" inputMode="url" maxLength={500} placeholder="https://…" value={ev.url} onChange={(e) => setEv({ ...ev, url: e.target.value })} /></Field>
            <Field label="Note (optional)" htmlFor="ev-note"><Input id="ev-note" maxLength={1000} value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} /></Field>
            <div className="flex items-end justify-end"><Button type="submit" size="sm" disabled={ev.label.trim().length < 2 || (!!ev.url && !ev.url.startsWith('https://'))} loading={act.isPending}>Add evidence</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Edit the claim</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Saving sends it back through verification{needsLegal ? ', legal review' : ''} and approval. The website keeps showing the approved figure until then.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Figure as shown" htmlFor="f-display"><Input id="f-display" maxLength={40} value={form.display} onChange={(e) => setForm({ ...form, display: e.target.value })} /></Field>
            <Field label="Number used on the site (optional)" htmlFor="f-value" hint={c.category === 'owner_earnings' ? 'Monthly gross in cents; the net is worked out from it.' : 'Used by counters and charts.'}><Input id="f-value" inputMode="decimal" className="tabular-nums" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value.replace(/[^\d.]/g, '').slice(0, 14) })} /></Field>
            <Field label="Label" htmlFor="f-label"><Input id="f-label" maxLength={160} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
            <Field label="As of" htmlFor="f-asof"><Input id="f-asof" type="date" value={form.asOf} onChange={(e) => setForm({ ...form, asOf: e.target.value })} /></Field>
            <Field label="Exact published wording" htmlFor="f-wording"><Input id="f-wording" maxLength={400} value={form.wording} onChange={(e) => setForm({ ...form, wording: e.target.value })} /></Field>
            <Field label="Owner" htmlFor="f-owner"><Select id="f-owner" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}>{(rules.data?.owners ?? [form.owner]).map((o) => <option key={o} value={o}>{o}</option>)}</Select></Field>
          </div>
          <Field label="Definition and method" htmlFor="f-def"><Textarea id="f-def" rows={2} maxLength={1000} value={form.definition} onChange={(e) => setForm({ ...form, definition: e.target.value })} /></Field>
          <Field label="Pages" htmlFor="f-pages" hint="Comma-separated, e.g. /, /about, /investors"><Input id="f-pages" maxLength={400} value={form.pages} onChange={(e) => setForm({ ...form, pages: e.target.value })} /></Field>
          <Field label="Why you changed it (optional)" htmlFor="f-note"><Input id="f-note" maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setForm(toForm(c))}>Reset</Button>
            <Button disabled={!!formError} loading={act.isPending} onClick={save}>Save changes</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm">
            {[...c.history].reverse().map((h, i) => (
              <li key={`${h.at}-${i}`} className="border-s-2 border-border ps-3">
                <p className="font-medium">{h.action}</p>
                <p className="text-xs text-muted-foreground">{who(h.by)} · {formatDateTime(h.at)}{h.note ? ` · ${h.note}` : ''}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
