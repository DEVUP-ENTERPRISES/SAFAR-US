'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PLAN_CATEGORIES, type InsurerPlan, type InsurerPlanInput } from '@/features/insurers/api';

const dollars = (cents: number) => (cents ? String(cents / 100) : '');
const toCents = (v: string) => Math.round((Number(v) || 0) * 100);
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** One plan's terms: price, deductible, liability, what it covers, and where it applies. */
export function PlanEditor({ plan, licensedStates, saving, onSave, onCancel }: { plan?: InsurerPlan; licensedStates: string[]; saving: boolean; onSave: (input: InsurerPlanInput) => void; onCancel: () => void }) {
  const [name, setName] = useState(plan?.name ?? '');
  const [description, setDescription] = useState(plan?.description ?? '');
  const [price, setPrice] = useState(dollars(plan?.pricePerDay ?? 0));
  const [deductible, setDeductible] = useState(dollars(plan?.deductibleCents ?? 0));
  const [liability, setLiability] = useState(dollars(plan?.liabilityLimitCents ?? 0));
  const [coverage, setCoverage] = useState((plan?.coverage ?? []).join('\n'));
  const [states, setStates] = useState<string[]>(plan?.states ?? []);
  const [categories, setCategories] = useState<string[]>(plan?.categories ?? []);
  const [active, setActive] = useState(plan?.active ?? true);

  const valid = name.trim().length >= 2 && price !== '';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Plan name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard" /></Field>
        <Field label="Price per trip day ($)"><Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <Field label="Deductible ($)" hint="What the guest pays toward a covered claim"><Input type="number" min={0} step="1" value={deductible} onChange={(e) => setDeductible(e.target.value)} /></Field>
        <Field label="Liability limit ($)" hint="Leave blank if not stated"><Input type="number" min={0} step="1" value={liability} onChange={(e) => setLiability(e.target.value)} /></Field>
      </div>
      <Field label="Short description"><Textarea rows={2} maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="What it covers" hint="One line each; guests see these at checkout"><Textarea rows={4} value={coverage} onChange={(e) => setCoverage(e.target.value)} placeholder={'Collision damage\nTheft\nRoadside assistance'} /></Field>
      <Field label="States" hint="None selected = every state you are licensed in">
        <div className="flex flex-wrap gap-1.5">
          {licensedStates.map((s) => <Chip key={s} active={states.includes(s)} onClick={() => setStates(toggle(states, s))}>{s}</Chip>)}
        </div>
      </Field>
      <Field label="Car categories" hint="None selected = every category">
        <div className="flex flex-wrap gap-1.5">
          {PLAN_CATEGORIES.map((c) => <Chip key={c} active={categories.includes(c)} onClick={() => setCategories(toggle(categories, c))}><span className="capitalize">{c}</span></Chip>)}
        </div>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-[hsl(var(--primary))]" />
        Offer this plan at checkout
      </label>
      <div className="flex gap-2">
        <Button
          disabled={!valid}
          loading={saving}
          onClick={() =>
            onSave({
              name: name.trim(),
              description: description.trim(),
              pricePerDay: toCents(price),
              deductibleCents: toCents(deductible),
              liabilityLimitCents: toCents(liability),
              coverage: coverage.split('\n').map((l) => l.trim()).filter(Boolean),
              states,
              categories,
              active,
            })
          }
        >
          Save plan
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
