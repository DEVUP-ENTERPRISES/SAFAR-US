'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, TrendingUp, Gauge } from 'lucide-react';
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
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { adminApi, type SurgeRule, type SurgeScope } from '@/features/admin/api';

const CITIES = ['New York', 'Los Angeles', 'San Francisco', 'Chicago', 'Miami', 'Austin'];
const SCOPES: { key: SurgeScope; label: string }[] = [
  { key: 'global', label: 'Everywhere' },
  { key: 'city', label: 'City' },
  { key: 'category', label: 'Category' },
  { key: 'cityCategory', label: 'City + Category' },
];

const x = (bps: number) => `${(bps / 10000).toFixed(2)}x`;

export default function AdminSurgePage() {
  const qc = useQueryClient();
  const confirm = useConfirm();

  const rules = useQuery({ queryKey: ['surge-rules'], queryFn: () => adminApi.surgeRules() });
  const config = useQuery({ queryKey: ['platform-config'], queryFn: () => adminApi.config() });

  const [city, setCity] = useState('New York');
  const occupancy = useQuery({
    queryKey: ['occupancy', city],
    queryFn: () => adminApi.occupancy(city),
    refetchInterval: 60_000,
  });

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', scope: 'city' as SurgeScope, city: 'New York', category: '', mult: '1.25' });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['surge-rules'] });
    qc.invalidateQueries({ queryKey: ['occupancy'] });
  };

  const create = useMutation({
    mutationFn: () =>
      adminApi.createSurgeRule({
        name: form.name.trim(),
        scope: form.scope,
        city: form.scope === 'city' || form.scope === 'cityCategory' ? form.city : undefined,
        category: form.scope === 'category' || form.scope === 'cityCategory' ? form.category.trim() : undefined,
        multiplierBps: Math.round(Number(form.mult) * 10000),
      }),
    onSuccess: () => { invalidate(); setCreating(false); setForm({ ...form, name: '' }); },
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => adminApi.updateSurgeRule(id, { active }),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => adminApi.deleteSurgeRule(id), onSuccess: invalidate });

  const cfg = config.data;
  const mult = Math.round(Number(form.mult) * 10000);
  const overCap = !!cfg && mult > cfg.surge.maxMultiplierBps;

  const doCreate = async () => {
    const { ok } = await confirm({
      title: `Surge ${x(mult)} on ${form.scope === 'global' ? 'every booking' : form.scope === 'category' ? form.category : form.city}?`,
      description: 'Guests will pay this multiplier on the daily rate immediately. CATO Plus members are exempt.',
      confirmLabel: 'Create surge rule',
      tone: 'destructive',
    });
    if (ok) create.mutate();
  };

  const doDelete = async (r: SurgeRule) => {
    const { ok } = await confirm({
      title: `Delete “${r.name}”?`,
      description: 'Prices return to normal for matching bookings immediately.',
      confirmLabel: 'Delete rule',
      tone: 'destructive',
    });
    if (ok) remove.mutate(r._id);
  };

  const columns: Column<SurgeRule>[] = [
    {
      header: 'Rule',
      cell: (r) => (
        <div>
          <p className="font-medium">{r.name}</p>
          <p className="text-xs text-muted-foreground">
            {r.scope === 'global' ? 'everywhere' : [r.city, r.category].filter(Boolean).join(' · ')}
          </p>
        </div>
      ),
    },
    { header: 'Multiplier', cell: (r) => <span className="font-mono font-semibold">{x(r.multiplierBps)}</span> },
    { header: 'Scope', cell: (r) => <Badge tone="muted">{r.scope}</Badge> },
    { header: 'Status', cell: (r) => <Badge tone={r.active ? 'warning' : 'muted'}>{r.active ? 'surging' : 'off'}</Badge> },
    {
      header: 'Actions',
      className: 'text-right',
      cell: (r) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" loading={toggle.isPending} onClick={() => toggle.mutate({ id: r._id, active: !r.active })}>
            {r.active ? 'Pause' : 'Resume'}
          </Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => doDelete(r)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const occ = occupancy.data;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Revenue"
        title="Surge pricing"
        description="Lift prices when demand outstrips supply. Manual rules for known peaks; auto-surge from measured occupancy. CATO Plus members never pay surge."
        actions={
          <Button onClick={() => setCreating((c) => !c)} variant={creating ? 'outline' : 'primary'}>
            <Plus className="h-4 w-4" /> {creating ? 'Cancel' : 'New surge rule'}
          </Button>
        }
      />

      {/* Live demand */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          tone={(occ?.occupancyPct ?? 0) >= 85 ? 'destructive' : (occ?.occupancyPct ?? 0) >= 70 ? 'warning' : 'success'}
          icon={<Gauge className="h-5 w-5" />}
          label={`${city} occupancy (live)`}
          value={occ?.occupancyPct != null ? `${Math.round(occ.occupancyPct)}%` : '—'}
          sub="Cars booked today vs listed"
        />
        <StatTile
          tone={(occ?.multiplierBps ?? 10000) > 10000 ? 'warning' : 'default'}
          icon={<TrendingUp className="h-5 w-5" />}
          label="Resolved multiplier"
          value={occ ? x(occ.multiplierBps) : '—'}
          sub={occ?.source}
        />
        <StatTile
          icon={<TrendingUp className="h-5 w-5" />}
          label="Surge ceiling"
          value={cfg ? x(cfg.surge.maxMultiplierBps) : '—'}
          sub={cfg?.surge.enabled ? (cfg.surge.autoEnabled ? 'Auto-surge on' : 'Manual rules only') : 'Surge disabled'}
          href="/admin/economics"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {CITIES.map((c) => (
          <button
            key={c}
            onClick={() => setCity(c)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              c === city ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/40'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {creating && (
        <Card className="animate-scale-in rounded-2xl shadow-soft">
          <CardHeader><CardTitle>New surge rule</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Labor Day weekend" />
            </Field>
            <Field label="Applies to">
              <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as SurgeScope })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {SCOPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="City">
              <select disabled={form.scope === 'global' || form.scope === 'category'} value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50">
                {CITIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <Input disabled={form.scope === 'global' || form.scope === 'city'} value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="luxury" />
            </Field>
            <Field label="Multiplier" hint={cfg ? `Max ${x(cfg.surge.maxMultiplierBps)}` : undefined}>
              <Input type="number" step="0.05" min={1} value={form.mult} onChange={(e) => setForm({ ...form, mult: e.target.value })} />
            </Field>
            <div className="sm:col-span-2 lg:col-span-5">
              {overCap && <p className="mb-2 text-sm text-destructive">{x(mult)} exceeds the surge ceiling.</p>}
              <Button disabled={!form.name.trim() || overCap || mult < 10000} loading={create.isPending} onClick={doCreate}>
                Create surge rule
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {rules.isLoading ? (
        <Skeleton className="h-56 w-full rounded-2xl" />
      ) : rules.data && rules.data.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="h-10 w-10" />}
          title="No manual surge rules"
          description="Auto-surge still lifts prices from live occupancy. Add a rule for a known peak (a holiday, a conference)."
          action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New surge rule</Button>}
        />
      ) : (
        <DataTable columns={columns} rows={rules.data} caption={`${rules.data?.length ?? 0} rule(s)`} />
      )}
    </div>
  );
}
