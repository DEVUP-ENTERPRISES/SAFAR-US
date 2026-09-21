'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Percent, ShieldCheck, Sparkles, Wrench, Banknote, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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

const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

/**
 * The Asset Partner programme's own economics.
 *
 * Deliberately NOT part of Platform Economics or Commission. A host earns per
 * booking (subtotal − commission − tax); a partner is paid monthly on
 * gross − management fee − insurance − detailing. They are different
 * businesses with different arithmetic, and an operator editing one must never
 * be able to believe they edited the other.
 */
export default function AdminAssetPartnerTermsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading } = useQuery({ queryKey: ['platform-config'], queryFn: () => adminApi.config() });

  const [draft, setDraft] = useState<PlatformConfig | null>(null);
  useEffect(() => { if (data) setDraft(structuredClone(data)); }, [data]);

  const save = useMutation({
    mutationFn: (patch: Partial<PlatformConfig>) => adminApi.saveConfig(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-config'] });
      qc.invalidateQueries({ queryKey: ['config-versions'] });
    },
  });

  if (isLoading || !draft || !data) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const ap = draft.assetPartner;
  const dirty = JSON.stringify(draft.assetPartner) !== JSON.stringify(data.assetPartner);

  const set = (fn: (d: PlatformConfig) => void) => {
    const next = structuredClone(draft);
    fn(next);
    setDraft(next);
  };

  const commit = async () => {
    const { ok } = await confirm({
      title: 'Apply new partner programme terms?',
      description:
        'These figures drive every partner statement from the next one onward. Statements already issued keep the terms they were calculated under. Partners with negotiated overrides are unaffected.',
      confirmLabel: 'Apply live',
      tone: 'destructive',
      requireText: 'APPLY',
    });
    if (ok) save.mutate({ assetPartner: draft.assetPartner });
  };

  /*
   * A worked month at the current figures, using the published mid-range
   * example ($1,365–$2,028 gross). This mirrors asset-partner-statement.service
   * exactly — an operator must see what a change does to a real partner's
   * cheque before applying it, not after a partner queries their statement.
   */
  const exampleGross = 169_650; // $1,696.50 — mid-point of the published range
  const exampleFee = Math.round((exampleGross * ap.managementFeeBps) / 10_000);
  const exampleNet = exampleGross - exampleFee - ap.insuranceMonthlyCents - ap.detailingMonthlyCents;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Asset Partners"
        title="Programme terms"
        description="The partner agreement's figures. These drive every monthly statement — they are not commission rules and never touch host payouts."
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
          Applied — live on the next statement ✓
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── What CatoDrive keeps and charges ───────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-primary" /> Revenue share and recurring costs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="Management fee"
              hint="Percentage of gross booking revenue CatoDrive keeps. The published rate is 20%."
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                value={toPct(ap.managementFeeBps)}
                onChange={(e) => set((d) => { d.assetPartner.managementFeeBps = toBps(e.target.value); })}
              />
            </Field>

            <Field
              label="Fleet insurance, per vehicle per month"
              hint="Charged whether or not the car earned that month — it is incurred by holding the car, not renting it."
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                value={toDollars(ap.insuranceMonthlyCents)}
                onChange={(e) => set((d) => { d.assetPartner.insuranceMonthlyCents = toCents(e.target.value); })}
              />
            </Field>

            <Field
              label="Professional detailing, per vehicle per month"
              hint="Recurring, same basis as insurance above."
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                value={toDollars(ap.detailingMonthlyCents)}
                onChange={(e) => set((d) => { d.assetPartner.detailingMonthlyCents = toCents(e.target.value); })}
              />
            </Field>
          </CardContent>
        </Card>

        {/* ── Partner exposure and approvals ─────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Partner exposure
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="Damage deductible cap, per incident"
              hint="The partner's maximum out-of-pocket per incident (Addendum No. 1). CatoDrive absorbs anything above it. This figure is published to partners — changing it changes a promise already made."
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                value={toDollars(ap.deductibleCapCents)}
                onChange={(e) => set((d) => { d.assetPartner.deductibleCapCents = toCents(e.target.value); })}
              />
            </Field>

            <Field
              label="Maintenance approval threshold"
              hint="Work at or below this proceeds without interrupting the partner. Above it, the partner must approve first."
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                value={toDollars(ap.maintenanceApprovalCents)}
                onChange={(e) => set((d) => { d.assetPartner.maintenanceApprovalCents = toCents(e.target.value); })}
              />
            </Field>
          </CardContent>
        </Card>

        {/* ── Payout schedule ────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" /> Payout schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="Payout day of month"
              hint="Partners are paid monthly, covering trips completed the prior month. Capped at 28 so every month has the day."
            >
              <Input
                type="number"
                min="1"
                max="28"
                value={String(ap.payoutDayOfMonth)}
                onChange={(e) => set((d) => {
                  d.assetPartner.payoutDayOfMonth = Math.min(28, Math.max(1, Number(e.target.value) || 1));
                })}
              />
            </Field>

            <Field label="Payout method" hint="How the monthly net reaches the partner.">
              <Select
                value={ap.payoutMethod}
                onChange={(e) => set((d) => {
                  d.assetPartner.payoutMethod = e.target.value as 'check' | 'zelle';
                })}
              >
                <option value="check">Check</option>
                <option value="zelle">Zelle</option>
              </Select>
            </Field>
          </CardContent>
        </Card>

        {/* ── Worked example ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" /> One vehicle, one month, at these figures
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Calculated exactly the way a real statement is, so the effect of a change is visible before it
              reaches a partner&apos;s cheque.
            </p>
            <table className="w-full text-sm">
              <tbody>
                <Row label="Gross booking revenue" value={money(exampleGross)} hint="Mid-range example month" />
                <Row
                  label={`Management fee (${toPct(ap.managementFeeBps)}%)`}
                  value={`− ${money(exampleFee)}`}
                  muted
                  icon={Percent}
                />
                <Row label="Fleet insurance" value={`− ${money(ap.insuranceMonthlyCents)}`} muted icon={ShieldCheck} />
                <Row label="Professional detailing" value={`− ${money(ap.detailingMonthlyCents)}`} muted icon={Sparkles} />
                <tr className="border-t border-border">
                  <td className="pt-3 font-semibold">Partner net</td>
                  <td className={`pt-3 text-right text-lg font-bold ${exampleNet < 0 ? 'text-destructive' : 'text-success'}`}>
                    {money(exampleNet)}
                  </td>
                </tr>
              </tbody>
            </table>
            {exampleNet < 0 && (
              <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                At these figures a mid-range month pays the partner nothing and leaves them owing. Recurring
                costs now exceed what an average car earns.
              </p>
            )}
            <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              These are programme defaults. A partner with negotiated terms on their own record overrides them,
              and is not affected by changes here.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label, value, muted, hint, icon: Icon,
}: {
  label: string; value: string; muted?: boolean; hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <tr>
      <td className="py-1.5">
        <span className="flex items-center gap-2">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
        </span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </td>
      <td className={`py-1.5 text-right font-medium tabular-nums ${muted ? 'text-muted-foreground' : ''}`}>
        {value}
      </td>
    </tr>
  );
}
