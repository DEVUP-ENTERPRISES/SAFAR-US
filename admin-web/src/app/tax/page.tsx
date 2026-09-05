'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Calculator, Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { adminApi, type TaxRule } from '@/features/admin/api';

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

const SCOPES = ['country', 'state', 'city', 'airport'] as const;
const KINDS = ['sales_tax', 'rental_excise', 'airport_concession', 'surcharge'] as const;
const kindLabel = (k?: string) => (k ?? 'sales_tax').replace(/_/g, ' ');

/**
 * Rental tax rules.
 *
 * The thing to understand before editing anything here: these rules STACK.
 * Unlike commission rules, which resolve to a single most-specific winner, a
 * booking at DFW pays the country rule AND the state rule AND the city rule AND
 * the airport rule. That is how US rental tax actually works, and it is also the
 * easiest thing to get wrong — hence the preview, which shows the full stack for
 * a jurisdiction before a guest is ever charged by it.
 */
export default function TaxPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  const rules = useQuery({ queryKey: ['admin-tax-rules'], queryFn: () => adminApi.taxRules() });

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-tax-rules'] });

  const create = useMutation({
    mutationFn: (body: Partial<TaxRule>) => adminApi.createTaxRule(body),
    onSuccess: () => { toast({ tone: 'success', title: 'Rule added' }); setAdding(false); refresh(); },
    onError: () => toast({ tone: 'error', title: 'Could not add the rule' }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => adminApi.updateTaxRule(id, { active }),
    onSuccess: refresh,
    onError: () => toast({ tone: 'error', title: 'Could not update the rule' }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteTaxRule(id),
    onSuccess: () => { toast({ tone: 'success', title: 'Rule deleted' }); refresh(); },
    onError: () => toast({ tone: 'error', title: 'Could not delete the rule' }),
  });

  const byScope = (s: string) => (rules.data ?? []).filter((r) => r.scope === s);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rental tax"
        description="Per-jurisdiction tax. These rules stack — a booking pays every rule that matches it."
      />

      <div className="flex justify-end">
        <Button onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4" /> {adding ? 'Cancel' : 'New rule'}
        </Button>
      </div>

      {adding && <NewRuleForm busy={create.isPending} onSubmit={(b) => create.mutate(b)} />}

      <PreviewPanel />

      {rules.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : rules.isError ? (
        <ErrorState message="Couldn't load tax rules." retry={() => rules.refetch()} />
      ) : (rules.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Layers className="h-8 w-8" />}
          title="No tax rules yet"
          description="Without any rules, bookings are quoted with no tax. Add at least a country-level rule."
        />
      ) : (
        SCOPES.filter((s) => byScope(s).length > 0).map((s) => (
          <section key={s} className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{s}</h2>
            <div className="space-y-2">
              {byScope(s).map((r) => (
                <Card key={r._id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {r.label}
                        <Badge tone="muted">{r.matchValue}</Badge>
                        <span className="text-xs font-normal capitalize text-muted-foreground">{kindLabel(r.kind)}</span>
                        {r.active === false && <Badge tone="warning">Inactive</Badge>}
                      </p>
                      <p className="numeric mt-0.5 text-sm text-muted-foreground">
                        {[
                          r.rateBps ? `${(r.rateBps / 100).toFixed(2)}% of subtotal` : null,
                          r.perDayCents ? `${money(r.perDayCents)} per day` : null,
                          r.perTripCents ? `${money(r.perTripCents)} per trip` : null,
                        ].filter(Boolean).join(' + ') || 'No charge configured'}
                      </p>
                      {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        loading={toggle.isPending}
                        onClick={() => toggle.mutate({ id: r._id, active: r.active === false })}
                      >
                        {r.active === false ? 'Activate' : 'Deactivate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${r.label}`}
                        loading={remove.isPending}
                        onClick={() => remove.mutate(r._id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

/** Check a jurisdiction's full stack before a guest is charged by it. */
function PreviewPanel() {
  const [state, setState] = useState('TX');
  const [city, setCity] = useState('Dallas');
  const [airport, setAirport] = useState('');
  const [days, setDays] = useState(3);
  const [amount, setAmount] = useState(30000);

  const preview = useQuery({
    queryKey: ['tax-preview', state, city, airport, days, amount],
    queryFn: () => adminApi.previewTax({ amount, state, city, airport: airport || undefined, days }),
  });

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="py-5">
        <p className="flex items-center gap-2 font-semibold">
          <Calculator className="h-4 w-4 text-primary" /> Preview a jurisdiction
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          <Field label="State"><Input size="sm" value={state} onChange={(e) => setState(e.target.value)} /></Field>
          <Field label="City"><Input size="sm" value={city} onChange={(e) => setCity(e.target.value)} /></Field>
          <Field label="Airport" hint="blank = not an airport pickup">
            <Input size="sm" value={airport} onChange={(e) => setAirport(e.target.value)} placeholder="DFW" />
          </Field>
          <Field label="Days"><Input size="sm" type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} /></Field>
          <Field label="Subtotal ($)">
            <Input size="sm" type="number" min={0} value={Math.round(amount / 100)} onChange={(e) => setAmount((Number(e.target.value) || 0) * 100)} />
          </Field>
        </div>

        <div className="mt-4 border-t border-primary/20 pt-3">
          {preview.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : preview.isError ? (
            <p className="text-sm text-destructive">Preview failed.</p>
          ) : (preview.data?.lines.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No rules match this place — a booking here would be quoted with no tax.</p>
          ) : (
            <dl className="numeric space-y-1.5 text-sm">
              {preview.data!.lines.map((l, i) => (
                <div key={i} className="flex justify-between">
                  <dt className="text-muted-foreground">{l.label}</dt>
                  <dd>{money(l.amount.amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-primary/20 pt-2 font-bold">
                <dt>Total tax</dt>
                <dd>{money(preview.data!.total.amount)}</dd>
              </div>
            </dl>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NewRuleForm({ busy, onSubmit }: { busy: boolean; onSubmit: (b: Partial<TaxRule>) => void }) {
  const [f, setF] = useState({
    label: '', scope: 'state' as TaxRule['scope'], matchValue: '',
    kind: 'sales_tax' as NonNullable<TaxRule['kind']>,
    ratePct: '', perDay: '', perTrip: '', note: '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });

  const hasCharge = !!(f.ratePct || f.perDay || f.perTrip);
  const valid = f.label.trim().length >= 3 && f.matchValue.trim().length >= 1 && hasCharge;

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Label" hint="Shown to guests on the price breakdown">
            <Input value={f.label} onChange={(e) => set('label', e.target.value)} placeholder="Texas motor vehicle rental tax" />
          </Field>
          <Field label="Applies to">
            <Select value={f.scope} onChange={(e) => set('scope', e.target.value as TaxRule['scope'])}>
              {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field
            label="Match value"
            hint={f.scope === 'country' ? 'Use * to match every booking' : 'Matched case-insensitively'}
          >
            <Input
              value={f.matchValue}
              onChange={(e) => set('matchValue', e.target.value)}
              placeholder={f.scope === 'country' ? '*' : f.scope === 'airport' ? 'DFW' : f.scope === 'state' ? 'TX' : 'Dallas'}
            />
          </Field>
          <Field label="Kind">
            <Select value={f.kind} onChange={(e) => set('kind', e.target.value as NonNullable<TaxRule['kind']>)}>
              {KINDS.map((k) => <option key={k} value={k} className="capitalize">{kindLabel(k)}</option>)}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Rate (%)" hint="of the subtotal">
            <Input type="number" step="0.01" min={0} max={100} value={f.ratePct} onChange={(e) => set('ratePct', e.target.value)} placeholder="10" />
          </Field>
          <Field label="Per day ($)">
            <Input type="number" step="0.01" min={0} value={f.perDay} onChange={(e) => set('perDay', e.target.value)} placeholder="2.00" />
          </Field>
          <Field label="Per trip ($)">
            <Input type="number" step="0.01" min={0} value={f.perTrip} onChange={(e) => set('perTrip', e.target.value)} placeholder="5.00" />
          </Field>
        </div>

        <Field label="Note" hint="Internal — cite the statute so the next person knows where this came from">
          <Input value={f.note} onChange={(e) => set('note', e.target.value)} />
        </Field>

        {!hasCharge && (
          <p className="text-xs text-muted-foreground">Set at least one of rate, per day, or per trip — a rule that charges nothing does nothing.</p>
        )}

        <Button
          disabled={!valid}
          loading={busy}
          onClick={() =>
            onSubmit({
              label: f.label.trim(),
              scope: f.scope,
              matchValue: f.matchValue.trim(),
              kind: f.kind,
              ...(f.ratePct ? { rateBps: Math.round(Number(f.ratePct) * 100) } : {}),
              ...(f.perDay ? { perDayCents: Math.round(Number(f.perDay) * 100) } : {}),
              ...(f.perTrip ? { perTripCents: Math.round(Number(f.perTrip) * 100) } : {}),
              ...(f.note.trim() ? { note: f.note.trim() } : {}),
              active: true,
            })
          }
        >
          Add rule
        </Button>
      </CardContent>
    </Card>
  );
}
