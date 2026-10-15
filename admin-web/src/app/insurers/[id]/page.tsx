'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatTile } from '@/components/ui/stat-tile';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { adminApi } from '@/features/admin/api';
import { INSURER_STATUS, PLAN_REVIEW, type InsurerPlan } from '@/features/insurers/api';
import { keyFromUrl } from '@/features/media/secure-url';
import { api } from '@/lib/api/client';
import { formatDate, formatMoney } from '@/lib/utils/format';
import { adminPath } from '@/lib/admin-path';
import { ApiError } from '@/lib/api/types';

const usd = (amount: number) => formatMoney({ amount, currency: 'USD' });

/** One insurer: review, suspend or reinstate, its commission, its plans, what it is owed, and recording payouts. */
export default function InsurerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['admin-insurer', id], queryFn: () => adminApi.insurer(id) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-insurer', id] });
    void qc.invalidateQueries({ queryKey: ['admin-insurers'] });
  };
  const fail = (e: unknown) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That didn’t work' });

  const review = useMutation({
    meta: { silentError: true },
    mutationFn: ({ decision, notes }: { decision: 'approved' | 'rejected'; notes?: string }) => adminApi.reviewInsurer(id, decision, notes),
    onSuccess: () => { refresh(); toast({ tone: 'success', title: 'Decision saved and the insurer told' }); },
    onError: fail,
  });
  const planReview = useMutation({
    meta: { silentError: true },
    mutationFn: ({ planId, decision, note }: { planId: string; decision: 'approved' | 'rejected'; note?: string }) => adminApi.reviewInsurerPlan(id, planId, decision, note),
    onSuccess: () => { refresh(); toast({ tone: 'success', title: 'Plan decision saved and the insurer told' }); },
    onError: fail,
  });
  const status = useMutation({
    meta: { silentError: true },
    mutationFn: ({ to, reason }: { to: 'approved' | 'suspended'; reason?: string }) => adminApi.setInsurerStatus(id, to, reason),
    onSuccess: refresh,
    onError: fail,
  });
  const [commission, setCommission] = useState('');
  const saveCommission = useMutation({
    meta: { silentError: true },
    mutationFn: (bps: number | null) => adminApi.setInsurerCommission(id, bps),
    onSuccess: () => { refresh(); setCommission(''); toast({ tone: 'success', title: 'Commission saved' }); },
    onError: fail,
  });
  const [payout, setPayout] = useState({ amount: '', reference: '', note: '' });
  const recordPayout = useMutation({
    meta: { silentError: true },
    mutationFn: () => adminApi.recordInsurerPayout(id, { amount: Math.round(Number(payout.amount) * 100), reference: payout.reference.trim(), note: payout.note.trim() || undefined }),
    onSuccess: () => { refresh(); setPayout({ amount: '', reference: '', note: '' }); toast({ tone: 'success', title: 'Payout recorded' }); },
    onError: fail,
  });

  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (q.isError || !q.data) return <ErrorState message="Couldn’t load this insurer." retry={() => q.refetch()} />;
  const { insurer, plans, summary, payouts, commissionBps } = q.data;

  const decide = async (decision: 'approved' | 'rejected') => {
    const { ok, reason } = await confirm({
      title: decision === 'approved' ? `Approve ${insurer.displayName}?` : `Reject ${insurer.displayName}?`,
      description: decision === 'approved' ? 'Each plan you have approved goes on checkout for cars in their licensed states.' : 'They are told, with your note, and can apply again.',
      confirmLabel: decision === 'approved' ? 'Approve' : 'Reject',
      tone: decision === 'approved' ? 'default' : 'destructive',
      reason: { label: decision === 'approved' ? 'Note (optional)' : 'Reason (shared with the insurer)', required: decision === 'rejected' },
    });
    if (ok) review.mutate({ decision, notes: reason || undefined });
  };
  const decidePlan = async (plan: InsurerPlan, decision: 'approved' | 'rejected') => {
    const { ok, reason } = await confirm({
      title: decision === 'approved' ? `Approve ${plan.name}?` : `Send ${plan.name} back?`,
      description: decision === 'approved'
        ? (insurer.status === 'approved' ? 'Guests can buy it at checkout straight away while it is switched on.' : 'It goes on checkout once the company itself is approved.')
        : 'It stays off checkout. The insurer sees your note and can edit the plan, which sends it back for review.',
      confirmLabel: decision === 'approved' ? 'Approve plan' : 'Send back',
      tone: decision === 'approved' ? 'default' : 'destructive',
      reason: decision === 'rejected' ? { label: 'What needs to change (shared with the insurer)', required: true } : undefined,
    });
    if (ok) planReview.mutate({ planId: plan._id, decision, note: reason || undefined });
  };
  const suspend = async () => {
    const { ok, reason } = await confirm({
      title: `Suspend ${insurer.displayName}?`,
      description: 'Their plans leave checkout immediately. Trips already sold stay covered and money already earned is still owed.',
      confirmLabel: 'Suspend',
      tone: 'destructive',
      reason: { label: 'Reason (shown to the insurer)', required: true },
    });
    if (ok) status.mutate({ to: 'suspended', reason });
  };
  const pay = async () => {
    const { ok } = await confirm({
      title: `Record a ${usd(Math.round(Number(payout.amount) * 100))} payout?`,
      description: 'Record it only after the money has been sent. It comes off what this insurer is owed and cannot be undone.',
      confirmLabel: 'Record payout',
    });
    if (ok) recordPayout.mutate();
  };

  return (
    <div className="space-y-6">
      <Link href={adminPath('insurers')} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Insurers
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{insurer.displayName}</h1>
        <Badge tone={INSURER_STATUS[insurer.status].tone}>{INSURER_STATUS[insurer.status].label}</Badge>
      </div>

      <Card>
        <CardHeader><CardTitle>Application</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <p><span className="text-muted-foreground">Company:</span> {insurer.legalName}</p>
          <p><span className="text-muted-foreground">Licence:</span> {insurer.licenceNumber}</p>
          <p><span className="text-muted-foreground">States:</span> {insurer.licensedStates.join(', ')}</p>
          <p><span className="text-muted-foreground">Contact:</span> {insurer.contactName} · {insurer.email}{insurer.phone ? ` · ${insurer.phone}` : ''}</p>
          {insurer.website && <p><span className="text-muted-foreground">Website:</span> {insurer.website}</p>}
          <p><span className="text-muted-foreground">Applied:</span> {formatDate(insurer.createdAt)}</p>
          {insurer.licenceDoc && <LicenceLink url={insurer.licenceDoc.url} />}
          {insurer.reviewNotes && <p className="sm:col-span-2"><span className="text-muted-foreground">Review note:</span> {insurer.reviewNotes}</p>}
        </CardContent>
        <CardContent className="flex flex-wrap gap-2 border-t border-border pt-4">
          {insurer.status === 'pending' && (
            <>
              <Button loading={review.isPending} onClick={() => void decide('approved')}>Approve</Button>
              <Button variant="outline" disabled={review.isPending} onClick={() => void decide('rejected')}>Reject</Button>
            </>
          )}
          {insurer.status === 'approved' && <Button variant="outline" loading={status.isPending} onClick={() => void suspend()}>Suspend</Button>}
          {insurer.status === 'suspended' && <Button loading={status.isPending} onClick={() => status.mutate({ to: 'approved' })}>Reinstate</Button>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Owed to them" value={usd(summary.balance)} tone="warning" />
        <StatTile label="Premiums earned" value={usd(summary.earned)} sub="After commission" />
        <StatTile label="Paid out" value={usd(summary.paidOut)} />
        <StatTile label="Trips covered" value={String(summary.policies)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Commission</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">CatoDrive keeps <strong>{commissionBps / 100}%</strong> of each premium {typeof insurer.commissionBps === 'number' ? '(negotiated for this insurer)' : '(the platform default)'}.</p>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Set a negotiated rate (%)"><Input type="number" min={0} max={50} step="0.5" value={commission} onChange={(e) => setCommission(e.target.value)} className="w-32" /></Field>
              <Button disabled={commission === '' || Number(commission) < 0 || Number(commission) > 50} loading={saveCommission.isPending} onClick={() => saveCommission.mutate(Math.round(Number(commission) * 100))}>Save</Button>
              {typeof insurer.commissionBps === 'number' && <Button variant="ghost" onClick={() => saveCommission.mutate(null)}>Use default</Button>}
            </div>
            <p className="text-xs text-muted-foreground">Applies to bookings made after saving.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Record a payout</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {insurer.payoutDetails?.accountLast4 ? (
              <p className="text-sm">Pays to {insurer.payoutDetails.accountHolder} · {insurer.payoutDetails.bankName} · routing {insurer.payoutDetails.routingNumber} · ••{insurer.payoutDetails.accountLast4}</p>
            ) : (
              <p className="text-sm text-warning">No bank details yet - the insurer adds them in their portal.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Amount ($)"><Input type="number" min={0} step="0.01" value={payout.amount} onChange={(e) => setPayout({ ...payout, amount: e.target.value })} /></Field>
              <Field label="Reference" hint="Wire or check number"><Input value={payout.reference} onChange={(e) => setPayout({ ...payout, reference: e.target.value })} /></Field>
            </div>
            <Field label="Note (optional)"><Input value={payout.note} onChange={(e) => setPayout({ ...payout, note: e.target.value })} /></Field>
            <Button
              disabled={!(Number(payout.amount) > 0) || Math.round(Number(payout.amount) * 100) > summary.balance || payout.reference.trim().length < 2}
              loading={recordPayout.isPending}
              onClick={() => void pay()}
            >
              Record payout
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
          <p className="text-sm text-muted-foreground">Guests see a plan only when you have approved it and the company. An edit by the insurer sends the plan back here.</p>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {plans.length === 0 && <p className="p-4 text-sm text-muted-foreground">No plans yet.</p>}
          {plans.map((p) => (
            <div key={p._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {p.name}
                  <Badge tone={PLAN_REVIEW[p.reviewStatus ?? 'pending'].tone}>{PLAN_REVIEW[p.reviewStatus ?? 'pending'].label}</Badge>
                  {!p.active && <Badge tone="muted">Switched off</Badge>}
                </p>
                {p.description && <p className="text-sm">{p.description}</p>}
                <p className="text-xs text-muted-foreground">
                  {usd(p.pricePerDay)}/day · {usd(p.deductibleCents)} deductible · {p.states.length ? p.states.join(', ') : 'all licensed states'} · {p.categories.length ? p.categories.join(', ') : 'all categories'}
                </p>
                {p.coverage.length > 0 && <p className="text-xs text-muted-foreground">Covers: {p.coverage.join(', ')}</p>}
                {p.reviewStatus === 'rejected' && p.reviewNote && <p className="text-xs text-destructive">Sent back: {p.reviewNote}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {p.reviewStatus !== 'approved' && <Button size="sm" disabled={planReview.isPending} onClick={() => void decidePlan(p, 'approved')}>Approve</Button>}
                {p.reviewStatus !== 'rejected' && <Button size="sm" variant="outline" disabled={planReview.isPending} onClick={() => void decidePlan(p, 'rejected')}>{p.reviewStatus === 'approved' ? 'Pull from checkout' : 'Send back'}</Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payouts</CardTitle></CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {payouts.length === 0 && <p className="p-4 text-sm text-muted-foreground">None recorded.</p>}
          {payouts.map((p) => (
            <div key={p._id} className="flex items-center justify-between p-4 text-sm">
              <span>{formatDate(p.paidAt)} · Ref {p.reference}{p.note ? ` · ${p.note}` : ''}</span>
              <span className="font-semibold">{usd(p.amount)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/** Opens the private licence file on a short-lived signed link. */
function LicenceLink({ url }: { url: string }) {
  const toast = useToast();
  const open = async () => {
    const key = keyFromUrl(url);
    try {
      const signed = key ? await api.get<{ url: string }>('/media/download', { key }) : { url };
      window.open(signed.url, '_blank', 'noopener');
    } catch {
      toast({ tone: 'error', title: 'Couldn’t open the licence' });
    }
  };
  return (
    <p>
      <button type="button" onClick={() => void open()} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
        <FileText className="h-4 w-4" /> Licence certificate
      </button>
    </p>
  );
}
