'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Percent, FlaskConical } from 'lucide-react';
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
import { adminApi, type CommissionRule, type CommissionScope } from '@/features/admin/api';
import { adminPath } from '@/lib/admin-path';

const SCOPES: { key: CommissionScope; label: string; hint: string }[] = [
  { key: 'global', label: 'Global', hint: 'Every booking' },
  { key: 'category', label: 'Category', hint: 'e.g. luxury, ev, economy' },
  { key: 'hostTier', label: 'Host tier', hint: 'e.g. superhost' },
  { key: 'host', label: 'Specific host', hint: 'A negotiated fleet rate — paste the host ID' },
];

const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

export default function AdminCommissionPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();

  const rules = useQuery({ queryKey: ['commission-rules'], queryFn: () => adminApi.commissionRules() });
  const config = useQuery({ queryKey: ['platform-config'], queryFn: () => adminApi.config() });

  const [form, setForm] = useState<{ name: string; scope: CommissionScope; scopeValue: string; percent: string; priority: string }>({
    name: '', scope: 'category', scopeValue: '', percent: '20', priority: '0',
  });
  const [creating, setCreating] = useState(false);

  // Live simulator — dry-run the engine before a rule touches real bookings.
  const [sim, setSim] = useState({ category: '', hostTier: '', hostId: '' });
  const preview = useQuery({
    queryKey: ['commission-preview', sim],
    queryFn: () => adminApi.previewCommission({
      category: sim.category || undefined,
      hostTier: sim.hostTier || undefined,
      hostId: sim.hostId || undefined,
    }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['commission-rules'] });
    qc.invalidateQueries({ queryKey: ['commission-preview'] });
  };

  const create = useMutation({
    mutationFn: () =>
      adminApi.createCommissionRule({
        name: form.name.trim(),
        scope: form.scope,
        scopeValue: form.scope === 'global' ? undefined : form.scopeValue.trim(),
        commissionBps: Math.round(Number(form.percent) * 100),
        priority: Number(form.priority) || 0,
      }),
    onSuccess: () => {
      invalidate();
      setForm({ name: '', scope: 'category', scopeValue: '', percent: '20', priority: '0' });
      setCreating(false);
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => adminApi.updateCommissionRule(id, { active }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteCommissionRule(id),
    onSuccess: invalidate,
  });

  const cfg = config.data;
  const bps = Math.round(Number(form.percent) * 100);
  const outOfBand = !!cfg && (bps < cfg.commission.minBps || bps > cfg.commission.maxBps);

  const doCreate = async () => {
    const { ok } = await confirm({
      title: `Take ${pct(bps)} on ${form.scope === 'global' ? 'every booking' : `${form.scope} “${form.scopeValue}”`}?`,
      description: 'This applies to new quotes immediately — no deploy. Existing bookings keep the rate they were priced at.',
      confirmLabel: 'Create rule',
    });
    if (ok) create.mutate();
  };

  const doToggle = async (r: CommissionRule) => {
    const { ok } = await confirm({
      title: r.active ? `Disable “${r.name}”?` : `Enable “${r.name}”?`,
      description: r.active
        ? 'Bookings matching this rule fall back to the next most specific rule (or the default rate).'
        : `Matching bookings will be taken at ${pct(r.commissionBps)} immediately.`,
      confirmLabel: r.active ? 'Disable rule' : 'Enable rule',
      tone: r.active ? 'destructive' : 'default',
    });
    if (ok) toggle.mutate({ id: r._id, active: !r.active });
  };

  const doDelete = async (r: CommissionRule) => {
    const { ok } = await confirm({
      title: `Delete “${r.name}”?`,
      description: 'This cannot be undone. Matching bookings revert to the next most specific rule.',
      confirmLabel: 'Delete rule',
      tone: 'destructive',
      requireText: 'DELETE',
    });
    if (ok) remove.mutate(r._id);
  };

  const columns: Column<CommissionRule>[] = [
    {
      header: 'Rule',
      cell: (r) => (
        <div>
          <p className="font-medium">{r.name}</p>
          <p className="text-xs text-muted-foreground">
            {r.scope === 'global' ? 'every booking' : `${r.scope}: ${r.scopeValue}`}
          </p>
        </div>
      ),
    },
    { header: 'Rate', cell: (r) => <span className="font-mono font-semibold">{pct(r.commissionBps)}</span> },
    {
      header: 'Specificity',
      cell: (r) => <Badge tone="muted">{r.scope}</Badge>,
    },
    { header: 'Priority', cell: (r) => <span className="tabular-nums text-xs">{r.priority}</span> },
    {
      header: 'Status',
      cell: (r) => <Badge tone={r.active ? 'success' : 'muted'}>{r.active ? 'active' : 'off'}</Badge>,
    },
    {
      header: 'Actions',
      className: 'text-end',
      cell: (r) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" loading={toggle.isPending} onClick={() => doToggle(r)}>
            {r.active ? 'Disable' : 'Enable'}
          </Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => doDelete(r)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Revenue"
        title="Commission"
        description="What the platform takes, and when. The most specific active rule wins: host → tier → category → default."
        actions={
          <Button onClick={() => setCreating((c) => !c)} variant={creating ? 'outline' : 'primary'}>
            <Plus className="h-4 w-4" /> {creating ? 'Cancel' : 'New rule'}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          tone="primary"
          icon={<Percent className="h-5 w-5" />}
          label="Default take rate"
          value={cfg ? pct(cfg.commission.defaultBps) : '—'}
          sub="When no rule matches"
          href={adminPath('economics')}
        />
        <StatTile
          icon={<Percent className="h-5 w-5" />}
          label="Allowed band"
          value={cfg ? `${pct(cfg.commission.minBps)} – ${pct(cfg.commission.maxBps)}` : '—'}
          sub="Rules outside this are rejected"
        />
        <StatTile
          icon={<Percent className="h-5 w-5" />}
          label="Active rules"
          value={rules.data ? rules.data.filter((r) => r.active).length : '—'}
          sub={rules.data ? `${rules.data.length} total` : undefined}
        />
      </div>

      {/* Create */}
      {creating && (
        <Card className="animate-scale-in rounded-2xl shadow-soft">
          <CardHeader><CardTitle>New commission rule</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Luxury premium take" />
            </Field>
            <Field label="Applies to">
              <select
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value as CommissionScope })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {SCOPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
            <Field
              label={form.scope === 'global' ? 'Value (n/a)' : 'Value'}
              hint={SCOPES.find((s) => s.key === form.scope)?.hint}
            >
              <Input
                disabled={form.scope === 'global'}
                value={form.scopeValue}
                onChange={(e) => setForm({ ...form, scopeValue: e.target.value })}
                placeholder={form.scope === 'category' ? 'luxury' : form.scope === 'hostTier' ? 'superhost' : 'host id'}
              />
            </Field>
            <Field label="Take rate %" hint={cfg ? `Allowed ${pct(cfg.commission.minBps)}–${pct(cfg.commission.maxBps)}` : undefined}>
              <Input type="number" step="0.5" min={0} value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} />
            </Field>
            <Field label="Priority" hint="Breaks ties within a scope">
              <Input type="number" min={0} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
            </Field>

            <div className="sm:col-span-2 lg:col-span-5">
              {outOfBand && (
                <p className="mb-2 text-sm text-destructive">
                  {pct(bps)} is outside the allowed band — raise the ceiling in Platform Economics first.
                </p>
              )}
              <Button
                disabled={!form.name.trim() || outOfBand || (form.scope !== 'global' && !form.scopeValue.trim())}
                loading={create.isPending}
                onClick={doCreate}
              >
                Create rule
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Simulator */}
      <Card className="rounded-2xl shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" /> Rate simulator
          </CardTitle>
        </CardHeader>
        <CardContent className="grid items-end gap-4 sm:grid-cols-4">
          <Field label="Category"><Input value={sim.category} onChange={(e) => setSim({ ...sim, category: e.target.value })} placeholder="luxury" /></Field>
          <Field label="Host tier"><Input value={sim.hostTier} onChange={(e) => setSim({ ...sim, hostTier: e.target.value })} placeholder="superhost" /></Field>
          <Field label="Host ID"><Input value={sim.hostId} onChange={(e) => setSim({ ...sim, hostId: e.target.value })} placeholder="optional" /></Field>
          <div className="rounded-xl border border-border bg-subtle p-4">
            <p className="text-xs text-muted-foreground">Resolved rate</p>
            <p className="text-2xl font-bold tracking-tight">
              {preview.data ? pct(preview.data.bps) : '—'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              via <span className="font-mono">{preview.data?.source ?? '…'}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Rules */}
      {rules.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : rules.data && rules.data.length === 0 ? (
        <EmptyState
          icon={<Percent className="h-10 w-10" />}
          title="No commission rules"
          description={cfg ? `Every booking is taken at the default ${pct(cfg.commission.defaultBps)}. Add a rule to charge differently by category, host tier, or host.` : undefined}
          action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New rule</Button>}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rules.data}
          caption={`${rules.data?.length ?? 0} rule(s) · most specific active rule wins`}
        />
      )}
    </div>
  );
}
