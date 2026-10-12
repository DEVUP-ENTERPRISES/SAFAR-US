'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import type { Vehicle } from '@/features/vehicles/types';
import { NEW_SEASONAL_RULE, pricingForm, pricingPatch, pricingValid, type PricingField, type PricingForm } from '../pricing-form';

type SaveFn = (patch: Record<string, unknown>) => void;

export type { PricingField };

/** The editable form behind "Pricing & discounts" - shared by the accordion and the dedicated page. */
export function PricingPanel({
  vehicle,
  onSave,
  saving,
  focus,
  onCancel,
}: {
  vehicle: Vehicle;
  onSave: SaveFn;
  saving: boolean;
  /** Which field to put the cursor in when opened from a trip-length card. */
  focus?: PricingField;
  onCancel?: () => void;
}) {
  const cur = vehicle.pricing.currency;
  const [form, setForm] = useState<PricingForm>(() => pricingForm(vehicle.pricing));
  const { daily, weekend, weekly, monthly, earlyBird, lastMinute, rules } = form;
  const set = (k: Exclude<keyof PricingForm, 'rules'>) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [setDaily, setWeekend, setWeekly, setMonthly, setEarlyBird, setLastMinute] = [set('daily'), set('weekend'), set('weekly'), set('monthly'), set('earlyBird'), set('lastMinute')];
  const setRules = (fn: (rs: PricingForm['rules']) => PricingForm['rules']) => setForm((f) => ({ ...f, rules: fn(f.rules) }));
  const addRule = () => setRules((rs) => [...rs, NEW_SEASONAL_RULE]);
  const setRule = (i: number, patch: Partial<PricingForm['rules'][number]>) =>
    setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeRule = (i: number) => setRules((rs) => rs.filter((_, j) => j !== i));

  const save = () => onSave(pricingPatch(form));

  return (
    <div className="space-y-4 bg-subtle px-4 py-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={`Daily price (${cur})`}>
          <Input type="number" min={1} inputMode="decimal" autoFocus={focus === 'daily'} value={daily} onChange={(e) => setDaily(e.target.value)} />
        </Field>
        <Field label="Weekend uplift (%)" hint="Added Fri–Sun">
          <Input type="number" min={0} value={weekend} onChange={(e) => setWeekend(e.target.value)} />
        </Field>
        <Field label="Weekly discount (%)" hint="7+ day trips">
          <Input type="number" min={0} max={90} inputMode="decimal" autoFocus={focus === 'weekly'} value={weekly} onChange={(e) => setWeekly(e.target.value)} />
        </Field>
        <Field label="Monthly discount (%)" hint="28+ day trips">
          <Input type="number" min={0} max={90} inputMode="decimal" autoFocus={focus === 'monthly'} value={monthly} onChange={(e) => setMonthly(e.target.value)} />
        </Field>
        <Field label="Early-bird (%)" hint="Booked well ahead">
          <Input type="number" min={0} max={50} value={earlyBird} onChange={(e) => setEarlyBird(e.target.value)} />
        </Field>
        <Field label="Last-minute (%)" hint="Fills idle days">
          <Input type="number" min={0} max={50} value={lastMinute} onChange={(e) => setLastMinute(e.target.value)} />
        </Field>
      </div>

      {/* Seasonal rules */}
      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Seasonal pricing</p>
          <button onClick={addRule} className="text-sm font-semibold text-primary hover:underline">+ Add rule</button>
        </div>
        <p className="text-xs text-muted-foreground">
          A multiplier for a date range - 150% charges half again as much (peak), 80% takes a fifth off (low season).
        </p>
        {rules.length === 0 && <p className="text-xs text-muted-foreground">No seasonal rules yet.</p>}
        {rules.map((r, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-2.5">
            <div className="flex items-center gap-2">
              <Input value={r.label} placeholder="e.g. Holiday peak" onChange={(e) => setRule(i, { label: e.target.value })} />
              <button onClick={() => removeRule(i)} aria-label="Remove rule" className="shrink-0 rounded-lg p-1.5 text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label="From"><Input type="date" value={r.start} onChange={(e) => setRule(i, { start: e.target.value })} /></Field>
              <Field label="To"><Input type="date" min={r.start || undefined} value={r.end} onChange={(e) => setRule(i, { end: e.target.value })} /></Field>
              <Field label="Rate (%)"><Input type="number" min={10} max={300} value={r.pct} onChange={(e) => setRule(i, { pct: e.target.value })} /></Field>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={saving} disabled={!pricingValid(form)} onClick={save}>
          Save pricing
        </Button>
        {onCancel && (
          <Button size="sm" variant="outline" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
