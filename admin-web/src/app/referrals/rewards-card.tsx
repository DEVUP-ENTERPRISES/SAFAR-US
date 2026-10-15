'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { SettingsCard, type SettingChange } from '@/features/admin/components/settings-card';
import { adminApi, type PlatformConfig } from '@/features/admin/api';
import { ApiError } from '@/lib/api/types';

const dollars = (cents: number) => (cents / 100).toFixed(2);
const cents = (v: string) => Math.round(Number(v) * 100);

function fromConfig(cfg: PlatformConfig) {
  return {
    on: !!cfg.programs?.referralEnabled,
    referrer: dollars(cfg.referral.referrerCreditCents),
    referee: dollars(cfg.referral.refereeCreditCents),
    minTrip: dollars(cfg.referral.minTripSpendCents),
    max: String(cfg.referral.maxRewardsPerReferrer),
  };
}

/** Whether Refer a friend is on, and what each side earns once the friend's first trip qualifies. */
export function ReferralRewards({ cfg }: { cfg: PlatformConfig }) {
  const qc = useQueryClient();
  const toast = useToast();
  const initial = fromConfig(cfg);
  const [v, setV] = useState(initial);
  useEffect(() => setV(fromConfig(cfg)), [cfg]);

  const n = { referrer: cents(v.referrer), referee: cents(v.referee), minTrip: cents(v.minTrip), max: Math.round(Number(v.max)) };
  const valid = [n.referrer, n.referee, n.minTrip].every((x) => Number.isFinite(x) && x >= 0) && Number.isInteger(n.max) && n.max >= 1;
  const changes: SettingChange[] = [
    { label: 'Refer a friend', from: initial.on ? 'On' : 'Off', to: v.on ? 'On' : 'Off' },
    { label: 'Credit for the member who refers', from: `$${initial.referrer}`, to: `$${Number(v.referrer || 0).toFixed(2)}` },
    { label: 'Credit for the new guest', from: `$${initial.referee}`, to: `$${Number(v.referee || 0).toFixed(2)}` },
    { label: 'Minimum first trip', from: `$${initial.minTrip}`, to: `$${Number(v.minTrip || 0).toFixed(2)}` },
    { label: 'Most rewards per member', from: initial.max, to: v.max },
  ].filter((c) => c.from !== c.to);

  const save = useMutation({
    meta: { silentError: true },
    mutationFn: () =>
      adminApi.saveConfig({
        referral: { referrerCreditCents: n.referrer, refereeCreditCents: n.referee, minTripSpendCents: n.minTrip, maxRewardsPerReferrer: n.max },
        programs: { rewardsEnabled: !!cfg.programs?.rewardsEnabled, membershipEnabled: !!cfg.programs?.membershipEnabled, referralEnabled: v.on },
        reason: 'Referral rewards',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform-config'] });
      toast({ tone: 'success', title: 'Referral rewards saved' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not save' }),
  });

  return (
    <SettingsCard
      title="Referral rewards"
      about="Members share a code. When the friend they invite finishes a first trip worth at least the minimum, both get wallet credit."
      affects={['Guests']}
      changes={valid ? changes : []}
      saving={save.isPending}
      onSave={() => save.mutate()}
      example={valid
        ? (v.on
          ? <>A friend’s first trip of <b>${Number(v.minTrip || 0).toFixed(2)}</b> or more gives the member <b>${Number(v.referrer || 0).toFixed(2)}</b> and the friend <b>${Number(v.referee || 0).toFixed(2)}</b>. One member can earn this up to <b>{v.max}</b> times, at most <b>${((n.referrer * n.max) / 100).toFixed(2)}</b> in total.</>
          : <>Refer a friend is off: it’s hidden from guests and codes entered at sign-up are ignored.</>)
        : <span className="text-destructive">Amounts can’t be negative, and the limit must be at least 1.</span>}
    >
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-primary" checked={v.on} onChange={(e) => setV({ ...v, on: e.target.checked })} />
        <span className="font-medium">Refer a friend is on</span>
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Member who refers ($)" htmlFor="r-ref"><Input id="r-ref" type="number" min={0} step="0.01" value={v.referrer} onChange={(e) => setV({ ...v, referrer: e.target.value })} /></Field>
        <Field label="New guest ($)" htmlFor="r-new"><Input id="r-new" type="number" min={0} step="0.01" value={v.referee} onChange={(e) => setV({ ...v, referee: e.target.value })} /></Field>
        <Field label="Minimum first trip ($)" htmlFor="r-min"><Input id="r-min" type="number" min={0} step="0.01" value={v.minTrip} onChange={(e) => setV({ ...v, minTrip: e.target.value })} /></Field>
        <Field label="Most rewards per member" htmlFor="r-max"><Input id="r-max" type="number" min={1} step="1" value={v.max} onChange={(e) => setV({ ...v, max: e.target.value })} /></Field>
      </div>
    </SettingsCard>
  );
}
