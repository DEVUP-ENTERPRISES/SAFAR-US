'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Plus, ShieldCheck, TrendingUp, Wallet } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { StatTile } from '@/components/ui/stat-tile';
import { BarChart } from '@/components/ui/charts';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatDateRange, formatMoney } from '@/lib/utils/format';
import { ApiError } from '@/lib/api/types';
import { INSURER_STATUS, PLAN_REVIEW, insurerApi, type Insurer, type InsurerPlan, type InsurerPlanInput } from '@/features/insurers/api';
import { PlanEditor } from '@/features/insurers/components/plan-editor';

type Tab = 'overview' | 'plans' | 'policies' | 'payouts' | 'profile';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'plans', label: 'Plans' },
  { key: 'policies', label: 'Policies' },
  { key: 'payouts', label: 'Payouts' },
  { key: 'profile', label: 'Profile' },
];
const usd = (amount: number) => formatMoney({ amount, currency: 'USD' });

/** The insurance partner's own portal: money, plans, the trips it covers, payouts and its details. */
function InsurerPortal() {
  const me = useQuery({ queryKey: ['insurer-me'], queryFn: () => insurerApi.me() });
  const [tab, setTab] = useState<Tab>('overview');

  if (me.isLoading) return <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6"><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  if (me.isError) return <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6"><ErrorState message="We couldn’t load your insurer account." retry={() => me.refetch()} /></div>;
  const insurer = me.data?.insurer;
  if (!insurer || insurer.status === 'rejected') {
    return (
      <div className="mx-auto w-full max-w-xl px-4 sm:px-6 py-12">
        <EmptyState
          title={insurer ? INSURER_STATUS[insurer.status].label : 'Complete your company details'}
          description={insurer ? 'Update your company details and send them again.' : 'Tell us about your company to start setting up your plans.'}
          action={<Link href="/apply"><Button>{insurer ? 'Update details' : 'Start'}</Button></Link>}
        />
      </div>
    );
  }
  // While CatoDrive reviews the company it can already set up plans; money and trips open on approval.
  const tabs = insurer.status === 'pending' ? TABS.filter((t) => t.key === 'plans') : TABS;
  const active = insurer.status === 'pending' ? 'plans' : tab;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 space-y-6 py-8">
      <PageHeader
        eyebrow="Insurance partner"
        title={insurer.displayName}
        description={`CatoDrive keeps ${(me.data!.commissionBps / 100).toFixed(1).replace(/\.0$/, '')}% of each premium; the rest is yours.`}
        actions={<Badge tone={INSURER_STATUS[insurer.status].tone}>{INSURER_STATUS[insurer.status].label}</Badge>}
      />
      {insurer.status === 'pending' && (
        <Card><CardContent className="p-4 text-sm">CatoDrive is reviewing your company. Set up your plans now; guests see each plan once both your company and that plan are approved.</CardContent></Card>
      )}
      {insurer.status === 'approved' && !insurer.payoutDetails?.accountLast4 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-sm"><Landmark className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> You’re approved. Add your bank account so we can pay out your premiums.</p>
            <Button size="sm" className="w-full sm:w-auto" onClick={() => setTab('profile')}>Add bank account</Button>
          </CardContent>
        </Card>
      )}
      {insurer.status === 'suspended' && (
        <Card><CardContent className="p-4 text-sm text-destructive">Your plans are off checkout{insurer.suspendedReason ? `: ${insurer.suspendedReason}` : '.'} Money already earned is still paid out.</CardContent></Card>
      )}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => <Chip key={t.key} active={active === t.key} onClick={() => setTab(t.key)}>{t.label}</Chip>)}
      </div>
      {active === 'overview' && <Overview />}
      {active === 'plans' && <Plans insurer={insurer} />}
      {active === 'policies' && <Policies />}
      {active === 'payouts' && <Payouts />}
      {active === 'profile' && <Profile insurer={insurer} />}
    </div>
  );
}

function Overview() {
  const q = useQuery({ queryKey: ['insurer-summary'], queryFn: () => insurerApi.summary() });
  if (q.isLoading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (q.isError || !q.data) return <ErrorState message="We couldn’t load your numbers." retry={() => q.refetch()} />;
  const s = q.data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Owed to you" value={usd(s.balance)} sub="Not yet paid out" icon={<Wallet className="h-4 w-4" />} tone="success" />
        <StatTile label="Premiums earned" value={usd(s.earned)} sub="After CatoDrive’s commission" icon={<TrendingUp className="h-4 w-4" />} />
        <StatTile label="Paid out" value={usd(s.paidOut)} icon={<Landmark className="h-4 w-4" />} />
        <StatTile label="Trips covered" value={String(s.policies)} icon={<ShieldCheck className="h-4 w-4" />} />
      </div>
      {s.byMonth.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Premiums by month</CardTitle></CardHeader>
          <CardContent><BarChart data={s.byMonth.map((m) => ({ label: m.month.slice(5), value: m.amount }))} currency={s.currency} /></CardContent>
        </Card>
      )}
    </div>
  );
}

function Plans({ insurer }: { insurer: Insurer }) {
  const qc = useQueryClient();
  const toast = useToast();
  const plans = useQuery({ queryKey: ['insurer-plans'], queryFn: () => insurerApi.plans() });
  const [editing, setEditing] = useState<InsurerPlan | 'new' | null>(null);
  const canEdit = insurer.status === 'approved' || insurer.status === 'pending';
  const save = useMutation({
    meta: { silentError: true },
    mutationFn: (input: InsurerPlanInput) => (editing && editing !== 'new' ? insurerApi.updatePlan(editing._id, input) : insurerApi.createPlan(input)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['insurer-plans'] });
      setEditing(null);
      toast({ tone: 'success', title: 'Plan saved' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not save the plan' }),
  });

  if (editing) {
    return (
      <Card>
        <CardHeader><CardTitle>{editing === 'new' ? 'New plan' : editing.name}</CardTitle></CardHeader>
        <CardContent>
          <PlanEditor plan={editing === 'new' ? undefined : editing} licensedStates={insurer.licensedStates} saving={save.isPending} onSave={(input) => save.mutate(input)} onCancel={() => setEditing(null)} />
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      <Button className="w-full sm:w-auto" onClick={() => setEditing('new')} disabled={!canEdit}><Plus className="h-4 w-4" /> Add a plan</Button>
      {plans.isLoading && <Skeleton className="h-32 w-full rounded-2xl" />}
      {plans.data?.length === 0 && <EmptyState title="No plans yet" description="Add a plan. CatoDrive reviews it, and once approved guests can buy it at checkout for the cars it covers." />}
      {plans.data?.map((p) => (
        <Card key={p._id}>
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {p.name}
                <Badge tone={PLAN_REVIEW[p.reviewStatus ?? 'pending'].tone}>{PLAN_REVIEW[p.reviewStatus ?? 'pending'].label}</Badge>
                {!p.active && <Badge tone="muted">Off</Badge>}
              </p>
              {p.reviewStatus === 'rejected' && p.reviewNote && <p className="text-sm text-destructive">{p.reviewNote}</p>}
              <p className="text-sm">{usd(p.pricePerDay)}/day · {usd(p.deductibleCents)} deductible{p.liabilityLimitCents ? ` · ${usd(p.liabilityLimitCents)} liability` : ''}</p>
              <p className="text-xs text-muted-foreground">
                {p.states.length ? p.states.join(', ') : `All your states (${insurer.licensedStates.join(', ')})`} · {p.categories.length ? p.categories.join(', ') : 'all categories'}
              </p>
            </div>
            <Button variant="outline" size="sm" className="self-start" disabled={!canEdit} onClick={() => setEditing(p)}>Edit</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Policies() {
  const q = useQuery({ queryKey: ['insurer-policies'], queryFn: () => insurerApi.policies({ limit: 100 }) });
  if (q.isLoading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (!q.data?.length) return <EmptyState title="No trips yet" description="Trips appear here when a guest buys one of your plans." />;
  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        {q.data.map((p) => (
          <div key={p.bookingId} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{p.code} · {p.plan}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateRange(p.start, p.end)}
                {p.vehicle ? ` · ${p.vehicle.year} ${p.vehicle.make} ${p.vehicle.model}${p.vehicle.state ? ` (${p.vehicle.state})` : ''}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone="muted">{p.status.replace(/_/g, ' ')}</Badge>
              <span className="font-semibold">{formatMoney({ amount: p.premium, currency: p.currency })}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Payouts() {
  const q = useQuery({ queryKey: ['insurer-payouts'], queryFn: () => insurerApi.payouts() });
  if (q.isLoading) return <Skeleton className="h-32 w-full rounded-2xl" />;
  if (!q.data?.length) return <EmptyState title="No payouts yet" description="Payouts to your bank appear here with their reference." />;
  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        {q.data.map((p) => (
          <div key={p._id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{formatMoney({ amount: p.amount, currency: p.currency })}</p>
              <p className="text-xs text-muted-foreground">{formatDate(p.paidAt)} · Ref {p.reference}{p.note ? ` · ${p.note}` : ''}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Profile({ insurer }: { insurer: Insurer }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [contact, setContact] = useState({ displayName: insurer.displayName, contactName: insurer.contactName, email: insurer.email, phone: insurer.phone ?? '', website: insurer.website ?? '' });
  const [bank, setBank] = useState({ accountHolder: insurer.payoutDetails?.accountHolder ?? '', bankName: insurer.payoutDetails?.bankName ?? '', routingNumber: insurer.payoutDetails?.routingNumber ?? '', accountNumber: '' });
  useEffect(() => {
    setContact({ displayName: insurer.displayName, contactName: insurer.contactName, email: insurer.email, phone: insurer.phone ?? '', website: insurer.website ?? '' });
  }, [insurer]);
  const done = (title: string) => () => {
    void qc.invalidateQueries({ queryKey: ['insurer-me'] });
    toast({ tone: 'success', title });
  };
  const fail = (e: unknown) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not save' });
  const saveContact = useMutation({
    meta: { silentError: true },
    mutationFn: () => insurerApi.updateProfile({ ...contact, phone: contact.phone || undefined, website: contact.website || undefined }),
    onSuccess: done('Details saved'),
    onError: fail,
  });
  const saveBank = useMutation({
    meta: { silentError: true },
    mutationFn: () => insurerApi.setPayoutDetails(bank),
    onSuccess: () => {
      setBank((b) => ({ ...b, accountNumber: '' }));
      done('Bank details saved')();
    },
    onError: fail,
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Company and contact</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{insurer.legalName} · Licence {insurer.licenceNumber} · {insurer.licensedStates.join(', ')}</p>
          <Field label="Name guests see"><Input value={contact.displayName} onChange={(e) => setContact({ ...contact, displayName: e.target.value })} /></Field>
          <Field label="Contact name"><Input value={contact.contactName} onChange={(e) => setContact({ ...contact, contactName: e.target.value })} /></Field>
          <Field label="Contact email"><Input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
          <Field label="Phone"><Input type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
          <Field label="Website"><Input type="url" value={contact.website} onChange={(e) => setContact({ ...contact, website: e.target.value })} /></Field>
          <p className="text-xs text-muted-foreground">To change your licence or states, contact CatoDrive - they go through review again.</p>
          <Button loading={saveContact.isPending} onClick={() => saveContact.mutate()}>Save details</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Where payouts go</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {insurer.payoutDetails?.accountLast4 && <p className="text-sm text-muted-foreground">Current account: {insurer.payoutDetails.bankName} ••{insurer.payoutDetails.accountLast4}</p>}
          <Field label="Account holder"><Input value={bank.accountHolder} onChange={(e) => setBank({ ...bank, accountHolder: e.target.value })} /></Field>
          <Field label="Bank name"><Input value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} /></Field>
          <Field label="Routing number"><Input inputMode="numeric" maxLength={9} value={bank.routingNumber} onChange={(e) => setBank({ ...bank, routingNumber: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Account number" hint="We keep only the last four digits"><Input inputMode="numeric" autoComplete="off" value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value.replace(/\D/g, '') })} /></Field>
          <Button loading={saveBank.isPending} disabled={!bank.accountHolder || !bank.bankName || bank.routingNumber.length !== 9 || bank.accountNumber.length < 4} onClick={() => saveBank.mutate()}>
            Save bank details
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function InsurerPortalPage() {
  return (
    <AuthGuard loginPath="/sign-in?next=/portal">
      <InsurerPortal />
    </AuthGuard>
  );
}
