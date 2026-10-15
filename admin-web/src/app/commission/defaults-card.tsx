'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { SettingsCard, type SettingChange } from '@/features/admin/components/settings-card';
import { adminApi, type PlatformConfig } from '@/features/admin/api';
import { ApiError } from '@/lib/api/types';

const pct = (bps: number) => String(bps / 100);
const bps = (v: string) => Math.round(Number(v) * 100);
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The default take and its guard rails; rules below override the default for specific hosts or cars. */
export function CommissionDefaults({ cfg }: { cfg: PlatformConfig }) {
  const qc = useQueryClient();
  const toast = useToast();
  const initial = { def: pct(cfg.commission.defaultBps), min: pct(cfg.commission.minBps), max: pct(cfg.commission.maxBps), tax: pct(cfg.tax.bps) };
  const [v, setV] = useState(initial);
  useEffect(() => setV({ def: pct(cfg.commission.defaultBps), min: pct(cfg.commission.minBps), max: pct(cfg.commission.maxBps), tax: pct(cfg.tax.bps) }), [cfg]);

  const n = { def: bps(v.def), min: bps(v.min), max: bps(v.max), tax: bps(v.tax) };
  const valid = [n.def, n.min, n.max, n.tax].every((x) => Number.isFinite(x) && x >= 0 && x <= 10_000) && n.min <= n.def && n.def <= n.max;
  const changes: SettingChange[] = [
    { label: 'Default take', from: `${initial.def}%`, to: `${v.def}%` },
    { label: 'Lowest allowed', from: `${initial.min}%`, to: `${v.min}%` },
    { label: 'Highest allowed', from: `${initial.max}%`, to: `${v.max}%` },
    { label: 'Tax on commission', from: `${initial.tax}%`, to: `${v.tax}%` },
  ].filter((c) => c.from !== c.to);

  const save = useMutation({
    meta: { silentError: true },
    mutationFn: () => adminApi.saveConfig({ commission: { defaultBps: n.def, minBps: n.min, maxBps: n.max }, tax: { bps: n.tax }, reason: 'Commission defaults' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform-config'] });
      void qc.invalidateQueries({ queryKey: ['commission-preview'] });
      toast({ tone: 'success', title: 'Commission saved' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not save' }),
  });

  const trip = 10_000;
  const take = Math.round((trip * n.def) / 10_000);
  const tax = Math.round((take * n.tax) / 10_000);

  return (
    <SettingsCard
      title="Default commission"
      about="What CatoDrive keeps from each host booking when no rule below applies. The lowest and highest stop a rule from being set to a mistaken rate."
      affects={['Hosts']}
      changes={valid ? changes : []}
      saving={save.isPending}
      onSave={() => save.mutate()}
      example={valid
        ? <>On a <b>$100.00</b> trip: CatoDrive keeps <b>{usd(take)}</b>{n.tax > 0 && <> plus <b>{usd(tax)}</b> tax on it</>}, the host earns <b>{usd(trip - take)}</b>.</>
        : <span className="text-destructive">The default must sit between the lowest and highest, and every value between 0 and 100.</span>}
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Field label="Default take %" htmlFor="c-def"><Input id="c-def" type="number" step="0.5" min={0} max={100} value={v.def} onChange={(e) => setV({ ...v, def: e.target.value })} /></Field>
        <Field label="Lowest allowed %" htmlFor="c-min"><Input id="c-min" type="number" step="0.5" min={0} max={100} value={v.min} onChange={(e) => setV({ ...v, min: e.target.value })} /></Field>
        <Field label="Highest allowed %" htmlFor="c-max"><Input id="c-max" type="number" step="0.5" min={0} max={100} value={v.max} onChange={(e) => setV({ ...v, max: e.target.value })} /></Field>
        <Field label="Tax on commission %" htmlFor="c-tax" hint="0 at the US launch"><Input id="c-tax" type="number" step="0.5" min={0} max={100} value={v.tax} onChange={(e) => setV({ ...v, tax: e.target.value })} /></Field>
      </div>
    </SettingsCard>
  );
}
