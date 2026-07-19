'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Star, Users, DollarSign, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { formatMoney } from '@/lib/utils/format';
import { adminApi, type SubscriptionPlan } from '@/features/admin/api';

const money = (c: number) => formatMoney({ amount: c, currency: 'USD' });

export default function AdminMembershipsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();

  const plans = useQuery({ queryKey: ['sub-plans'], queryFn: () => adminApi.subscriptionPlans() });
  const stats = useQuery({ queryKey: ['sub-stats'], queryFn: () => adminApi.subscriptionStats() });
  const config = useQuery({ queryKey: ['platform-config'], queryFn: () => adminApi.config() });

  const [draft, setDraft] = useState<Record<string, SubscriptionPlan>>({});
  const [newCode, setNewCode] = useState('');

  const save = useMutation({
    mutationFn: ({ code, body }: { code: string; body: Partial<SubscriptionPlan> }) =>
      adminApi.saveSubscriptionPlan(code, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-plans'] });
      qc.invalidateQueries({ queryKey: ['sub-stats'] });
      setDraft({});
      setNewCode('');
    },
  });

  const totalMembers = stats.data?.reduce((s, x) => s + x.members, 0) ?? 0;
  const mrr = stats.data?.reduce((s, x) => s + x.mrrCents, 0) ?? 0;

  const edit = (p: SubscriptionPlan, fn: (d: SubscriptionPlan) => void) => {
    const base = draft[p.code] ?? structuredClone(p);
    const next = structuredClone(base);
    fn(next);
    setDraft({ ...draft, [p.code]: next });
  };

  const commit = async (p: SubscriptionPlan) => {
    const d = draft[p.code];
    if (!d) return;
    const { ok } = await confirm({
      title: `Update the ${d.name} plan?`,
      description:
        'New members get these benefits immediately. Existing members keep the benefits they signed up with — their plan is snapshotted at purchase.',
      confirmLabel: 'Save plan',
    });
    if (ok) {
      save.mutate({
        code: p.code,
        body: { name: d.name, description: d.description, priceCents: d.priceCents, active: d.active, benefits: d.benefits },
      });
    }
  };

  const createPlan = async () => {
    const code = newCode.trim().toLowerCase();
    const { ok } = await confirm({
      title: `Create the “${code}” plan?`,
      description: 'It starts inactive with no benefits — configure it, then activate.',
      confirmLabel: 'Create plan',
    });
    if (ok) {
      save.mutate({
        code,
        body: {
          name: code.toUpperCase(),
          description: '',
          priceCents: 0,
          active: false,
          benefits: { bookingDiscountBps: 0, waiveSurge: false, rewardsMultiplierBps: 10000 },
        },
      });
    }
  };

  const protectionCodes = config.data?.protection.map((p) => p.code) ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Revenue"
        title="Memberships"
        description="Paid tiers that make guests book more. Benefits apply to the price automatically — and are snapshotted at purchase so a plan change can't hurt existing members."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile tone="primary" icon={<Users className="h-5 w-5" />} label="Active members" value={totalMembers} />
        <StatTile tone="success" icon={<DollarSign className="h-5 w-5" />} label="Membership MRR" value={money(mrr)} sub="Recurring monthly" />
        <StatTile icon={<Star className="h-5 w-5" />} label="Plans" value={plans.data?.length ?? 0} sub={`${plans.data?.filter((p) => p.active).length ?? 0} live`} />
      </div>

      {/* New plan */}
      <Card className="rounded-2xl shadow-soft">
        <CardHeader><CardTitle>Add a plan</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Field label="Plan code" hint="Lowercase, e.g. plus, pro">
            <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="plus" />
          </Field>
          <Button disabled={!newCode.trim()} loading={save.isPending} onClick={createPlan}>Create plan</Button>
        </CardContent>
      </Card>

      {plans.isLoading && <Skeleton className="h-64 w-full rounded-2xl" />}

      {plans.data && plans.data.length === 0 && (
        <EmptyState icon={<Star className="h-10 w-10" />} title="No membership plans yet" description="Create a plan above to start selling memberships." />
      )}

      <div className="space-y-6">
        {plans.data?.map((p) => {
          const d = draft[p.code] ?? p;
          const dirty = !!draft[p.code] && JSON.stringify(draft[p.code]) !== JSON.stringify(p);
          const stat = stats.data?.find((s) => s.planCode === p.code);
          return (
            <Card key={p.code} className="rounded-2xl shadow-soft">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-primary" /> {d.name}
                  <Badge tone={d.active ? 'success' : 'muted'}>{d.active ? 'live' : 'draft'}</Badge>
                  {stat && <span className="text-sm font-normal text-muted-foreground">{stat.members} member(s) · {money(stat.mrrCents)} MRR</span>}
                </CardTitle>
                <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => commit(p)}>
                  <Save className="h-4 w-4" /> Save
                </Button>
              </CardHeader>

              <CardContent className="grid gap-4 sm:grid-cols-3">
                <Field label="Name"><Input value={d.name} onChange={(e) => edit(p, (x) => { x.name = e.target.value; })} /></Field>
                <Field label="Description"><Input value={d.description} onChange={(e) => edit(p, (x) => { x.description = e.target.value; })} /></Field>
                <Field label="Price / month ($)">
                  <Input type="number" step="0.01" value={(d.priceCents / 100).toFixed(2)}
                    onChange={(e) => edit(p, (x) => { x.priceCents = Math.round(Number(e.target.value) * 100); })} />
                </Field>

                <Field label="Booking discount %">
                  <Input type="number" step="0.5" value={d.benefits.bookingDiscountBps / 100}
                    onChange={(e) => edit(p, (x) => { x.benefits.bookingDiscountBps = Math.round(Number(e.target.value) * 100); })} />
                </Field>
                <Field label="Free protection tier" hint="Included at no cost">
                  <select value={d.benefits.freeProtectionCode ?? ''}
                    onChange={(e) => edit(p, (x) => { x.benefits.freeProtectionCode = e.target.value || undefined; })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">None</option>
                    {protectionCodes.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Rewards multiplier" hint="2 = double points">
                  <Input type="number" step="0.5" min={1} value={d.benefits.rewardsMultiplierBps / 10000}
                    onChange={(e) => edit(p, (x) => { x.benefits.rewardsMultiplierBps = Math.round(Number(e.target.value) * 10000); })} />
                </Field>

                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={d.benefits.waiveSurge}
                    onChange={(e) => edit(p, (x) => { x.benefits.waiveSurge = e.target.checked; })}
                    className="accent-[hsl(var(--primary))]" />
                  Never pay surge pricing
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={d.active}
                    onChange={(e) => edit(p, (x) => { x.active = e.target.checked; })}
                    className="accent-[hsl(var(--primary))]" />
                  Available to buy
                </label>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
