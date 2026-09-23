'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import type { Vehicle } from '@/features/vehicles/types';

type SaveFn = (patch: Record<string, unknown>) => void;

/** The editable form behind "Pricing & discounts" — shared by the accordion and the dedicated page. */
export function PricingPanel({ vehicle, onSave, saving }: { vehicle: Vehicle; onSave: SaveFn; saving: boolean }) {
  const p = vehicle.pricing;
  const cur = p.currency;
  const pctFromBps = (bps?: number) => String(bps ? Math.round(bps / 100) : 0);
  const upliftFromBps = (bps?: number) => String(bps ? Math.round((bps - 10000) / 100) : 0);

  const [daily, setDaily] = useState(String(p.dailyPrice / 100));
  const [cleaning, setCleaning] = useState(String((p.cleaningFee ?? 0) / 100));
  const [weekend, setWeekend] = useState(upliftFromBps(p.weekendMultiplierBps));
  const [weekly, setWeekly] = useState(pctFromBps(p.weeklyDiscountBps));
  const [monthly, setMonthly] = useState(pctFromBps(p.monthlyDiscountBps));
  const [earlyBird, setEarlyBird] = useState(pctFromBps(p.earlyBirdBps));
  const [lastMinute, setLastMinute] = useState(pctFromBps(p.lastMinuteBps));
  const [rules, setRules] = useState(
    (p.seasonalRules ?? []).map((r) => ({
      label: r.label,
      start: r.start.slice(0, 10),
      end: r.end.slice(0, 10),
      pct: String(Math.round(r.multiplierBps / 100)),
    })),
  );

  const num = (s: string) => Number(s) || 0;
  const addRule = () => setRules((rs) => [...rs, { label: '', start: '', end: '', pct: '150' }]);
  const setRule = (i: number, patch: Partial<(typeof rules)[number]>) =>
    setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeRule = (i: number) => setRules((rs) => rs.filter((_, j) => j !== i));

  const save = () =>
    onSave({
      dailyPrice: Math.round(num(daily) * 100),
      cleaningFee: Math.round(num(cleaning) * 100),
      weekendMultiplierBps: 10000 + Math.max(0, num(weekend)) * 100,
      weeklyDiscountBps: Math.min(90, Math.max(0, num(weekly))) * 100,
      monthlyDiscountBps: Math.min(90, Math.max(0, num(monthly))) * 100,
      earlyBirdBps: Math.min(50, Math.max(0, num(earlyBird))) * 100,
      lastMinuteBps: Math.min(50, Math.max(0, num(lastMinute))) * 100,
      seasonalRules: rules
        .filter((r) => r.label.trim() && r.start && r.end)
        .map((r) => ({
          label: r.label.trim(),
          start: r.start,
          end: r.end,
          multiplierBps: Math.min(300, Math.max(10, num(r.pct))) * 100,
        })),
    });

  return (
    <div className="space-y-4 bg-subtle px-4 py-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Daily price (${cur})`}>
          <Input type="number" min={1} value={daily} onChange={(e) => setDaily(e.target.value)} />
        </Field>
        <Field label={`Cleaning fee (${cur})`}>
          <Input type="number" min={0} value={cleaning} onChange={(e) => setCleaning(e.target.value)} />
        </Field>
        <Field label="Weekend uplift (%)" hint="Added Fri–Sun">
          <Input type="number" min={0} value={weekend} onChange={(e) => setWeekend(e.target.value)} />
        </Field>
        <Field label="Weekly discount (%)" hint="7+ day trips">
          <Input type="number" min={0} max={90} value={weekly} onChange={(e) => setWeekly(e.target.value)} />
        </Field>
        <Field label="Monthly discount (%)" hint="28+ day trips">
          <Input type="number" min={0} max={90} value={monthly} onChange={(e) => setMonthly(e.target.value)} />
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
          A multiplier for a date range — 150% charges half again as much (peak), 80% takes a fifth off (low season).
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
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Field label="From"><Input type="date" value={r.start} onChange={(e) => setRule(i, { start: e.target.value })} /></Field>
              <Field label="To"><Input type="date" min={r.start || undefined} value={r.end} onChange={(e) => setRule(i, { end: e.target.value })} /></Field>
              <Field label="Rate (%)"><Input type="number" min={10} max={300} value={r.pct} onChange={(e) => setRule(i, { pct: e.target.value })} /></Field>
            </div>
          </div>
        ))}
      </div>

      <Button size="sm" loading={saving} disabled={!daily} onClick={save}>
        Save pricing
      </Button>
    </div>
  );
}
