'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Percent, Clock, Gift, Users, ShieldCheck, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ApiError } from '@/lib/api/types';
import { adminApi, type PlatformConfig } from '@/features/admin/api';

/** cents <-> dollars, kept explicit so we never float-round money into the API. */
const toDollars = (cents: number) => (cents / 100).toFixed(2);
const toCents = (dollars: string) => Math.round(Number(dollars) * 100);
const toPct = (bps: number) => (bps / 100).toString();
const toBps = (pct: string) => Math.round(Number(pct) * 100);

export default function AdminEconomicsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading } = useQuery({ queryKey: ['platform-config'], queryFn: () => adminApi.config() });

  const [draft, setDraft] = useState<PlatformConfig | null>(null);
  useEffect(() => { if (data) setDraft(structuredClone(data)); }, [data]);

  const save = useMutation({
    mutationFn: (patch: Partial<PlatformConfig>) => adminApi.saveConfig(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-config'] });
      qc.invalidateQueries({ queryKey: ['commission-preview'] });
    },
  });

  if (isLoading || !draft || !data) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const dirty = JSON.stringify(draft) !== JSON.stringify(data);

  const commit = async () => {
    const { ok } = await confirm({
      title: 'Apply new platform economics?',
      description:
        'These rates take effect on the very next quote — no deploy, no restart. Bookings already priced keep their original rate.',
      confirmLabel: 'Apply live',
      tone: 'destructive',
      requireText: 'APPLY',
    });
    if (ok) {
      save.mutate({
        commission: draft.commission,
        tax: draft.tax,
        payout: draft.payout,
        rewards: draft.rewards,
        referral: draft.referral,
        protection: draft.protection,
      });
    }
  };

  const set = (fn: (d: PlatformConfig) => void) => {
    const next = structuredClone(draft);
    fn(next);
    setDraft(next);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Revenue"
        title="Platform economics"
        description="Every rate the marketplace runs on. Nothing here is hardcoded — changes are hot and audited."
        actions={
          <Button disabled={!dirty} loading={save.isPending} onClick={commit}>
            <Save className="h-4 w-4" /> {dirty ? 'Apply changes' : 'No changes'}
          </Button>
        }
      />

      {save.isError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {save.error instanceof ApiError ? save.error.message : 'Could not save.'}
        </p>
      )}
      {save.isSuccess && !dirty && (
        <p className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
          Applied — live on the next quote ✓
        </p>
      )}

      {/* Commission */}
      <Card className="rounded-2xl shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Percent className="h-5 w-5 text-primary" /> Commission</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <Field label="Default take %" hint="Used when no commission rule matches.">
            <Input type="number" step="0.5" value={toPct(draft.commission.defaultBps)}
              onChange={(e) => set((d) => { d.commission.defaultBps = toBps(e.target.value); })} />
          </Field>
          <Field label="Minimum %" hint="Guard rail — rules below this are rejected.">
            <Input type="number" step="0.5" value={toPct(draft.commission.minBps)}
              onChange={(e) => set((d) => { d.commission.minBps = toBps(e.target.value); })} />
          </Field>
          <Field label="Maximum %" hint="Guard rail — a typo can't take 90%.">
            <Input type="number" step="0.5" value={toPct(draft.commission.maxBps)}
              onChange={(e) => set((d) => { d.commission.maxBps = toBps(e.target.value); })} />
          </Field>
          <Field label="Tax on commission %" hint="US launch = 0.">
            <Input type="number" step="0.5" value={toPct(draft.tax.bps)}
              onChange={(e) => set((d) => { d.tax.bps = toBps(e.target.value); })} />
          </Field>
        </CardContent>
      </Card>

      {/* Payouts */}
      <Card className="rounded-2xl shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /> Host payouts</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Hold window (hours)" hint="Protects against disputes/chargebacks.">
            <Input type="number" min={0} value={draft.payout.holdHours}
              onChange={(e) => set((d) => { d.payout.holdHours = Number(e.target.value); })} />
          </Field>
          <Field label="Instant payout fee %">
            <Input type="number" step="0.1" value={toPct(draft.payout.instantFeeBps)}
              onChange={(e) => set((d) => { d.payout.instantFeeBps = toBps(e.target.value); })} />
          </Field>
          <Field label="Minimum fee ($)">
            <Input type="number" step="0.01" value={toDollars(draft.payout.instantFeeMinCents)}
              onChange={(e) => set((d) => { d.payout.instantFeeMinCents = toCents(e.target.value); })} />
          </Field>
        </CardContent>
      </Card>

      {/* Protection */}
      <Card className="rounded-2xl shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Protection plans</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.protection.map((p, i) => (
            <div key={p.code} className="grid items-end gap-3 rounded-xl border border-border p-3 sm:grid-cols-4">
              <Field label="Code"><Input value={p.code} disabled /></Field>
              <Field label="Label">
                <Input value={p.label} onChange={(e) => set((d) => { d.protection[i].label = e.target.value; })} />
              </Field>
              <Field label="Description">
                <Input value={p.description} onChange={(e) => set((d) => { d.protection[i].description = e.target.value; })} />
              </Field>
              <Field label="Price / day ($)">
                <Input type="number" step="0.01" value={toDollars(p.pricePerDay)}
                  onChange={(e) => set((d) => { d.protection[i].pricePerDay = toCents(e.target.value); })} />
              </Field>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Growth levers */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-primary" /> Rewards</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Point value ($)" hint="Redemption value of 1 point.">
              <Input type="number" step="0.01" value={toDollars(draft.rewards.pointValueCents)}
                onChange={(e) => set((d) => { d.rewards.pointValueCents = toCents(e.target.value); })} />
            </Field>
            <Field label="Points per $1 earned">
              <Input type="number" min={0} value={draft.rewards.pointsPerDollar}
                onChange={(e) => set((d) => { d.rewards.pointsPerDollar = Number(e.target.value); })} />
            </Field>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Referrals</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Referrer credit ($)">
              <Input type="number" step="0.01" value={toDollars(draft.referral.referrerCreditCents)}
                onChange={(e) => set((d) => { d.referral.referrerCreditCents = toCents(e.target.value); })} />
            </Field>
            <Field label="Referee credit ($)">
              <Input type="number" step="0.01" value={toDollars(draft.referral.refereeCreditCents)}
                onChange={(e) => set((d) => { d.referral.refereeCreditCents = toCents(e.target.value); })} />
            </Field>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
