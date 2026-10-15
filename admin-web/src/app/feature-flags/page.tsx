'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Flag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { adminApi, type FeatureFlag } from '@/features/admin/api';

function Toggle({ on, onClick, loading }: { on: boolean; onClick: () => void; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      aria-pressed={on}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-primary' : 'bg-muted'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'start-[22px]' : 'start-0.5'}`}
      />
    </button>
  );
}

export default function AdminSettingsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [form, setForm] = useState({ key: '', description: '', percentage: 100 });
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['admin-flags'], queryFn: () => adminApi.featureFlags() });

  const save = useMutation({
    mutationFn: ({ key, body }: { key: string; body: Parameters<typeof adminApi.saveFlag>[1] }) =>
      adminApi.saveFlag(key, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-flags'] });
      setForm({ key: '', description: '', percentage: 100 });
      setCreating(false);
    },
  });

  // Flipping a flag changes behaviour for real users instantly — always confirm.
  const toggle = async (f: FeatureFlag) => {
    const turningOn = !f.enabled;
    const { ok } = await confirm({
      title: turningOn ? `Enable "${f._id}"?` : `Disable "${f._id}"?`,
      description: turningOn
        ? `This takes effect immediately for ${f.rollout?.percentage ?? 100}% of users. No deploy required.`
        : 'This immediately turns the feature off for all users. No deploy required.',
      confirmLabel: turningOn ? 'Enable flag' : 'Disable flag',
      tone: turningOn ? 'default' : 'destructive',
    });
    if (ok) save.mutate({ key: f._id, body: { enabled: turningOn } });
  };

  const setRollout = async (f: FeatureFlag, percentage: number) => {
    const { ok } = await confirm({
      title: `Set "${f._id}" rollout to ${percentage}%?`,
      description: `The feature will be active for ${percentage}% of users. Changes apply immediately.`,
      confirmLabel: 'Update rollout',
    });
    if (ok) save.mutate({ key: f._id, body: { rollout: { percentage } } });
  };

  const create = async () => {
    const { ok } = await confirm({
      title: `Create flag "${form.key}"?`,
      description: 'The flag is created disabled — enable it when you are ready to roll out.',
      confirmLabel: 'Create flag',
    });
    if (ok) {
      save.mutate({
        key: form.key.trim(),
        body: {
          description: form.description || undefined,
          enabled: false,
          rollout: { percentage: form.percentage },
        },
      });
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Platform"
        title="Feature flags"
        description="Toggle features live for real users — no deploy required. Every change is audited."
        actions={
          <Button onClick={() => setCreating((c) => !c)} variant={creating ? 'outline' : 'primary'}>
            <Plus className="h-4 w-4" /> {creating ? 'Cancel' : 'New flag'}
          </Button>
        }
      />

      {creating && (
        <Card className="animate-scale-in rounded-2xl shadow-soft">
          <CardHeader>
            <CardTitle>Create a feature flag</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Key" hint="Lowercase, dot or dash separated.">
              <Input
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                placeholder="instant-payout.enabled"
              />
            </Field>
            <Field label="Description">
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What does this gate?"
              />
            </Field>
            <Field label="Rollout %">
              <Input
                type="number"
                min={0}
                max={100}
                value={form.percentage}
                onChange={(e) => setForm({ ...form, percentage: Number(e.target.value) })}
              />
            </Field>
            <div className="sm:col-span-3">
              <Button disabled={!form.key.trim()} loading={save.isPending} onClick={create}>
                Create flag
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}

      {data && data.length === 0 && !creating && (
        <EmptyState
          icon={<Flag className="h-10 w-10" />}
          title="No feature flags yet"
          description="Create your first flag to gate a feature without a deploy."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New flag
            </Button>
          }
        />
      )}

      {data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((f) => {
            const pct = f.rollout?.percentage ?? 100;
            return (
              <Card key={f._id} className="rounded-2xl shadow-soft">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm font-semibold">{f._id}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          f.enabled ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {f.enabled ? 'live' : 'off'}
                      </span>
                    </div>
                    {f.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{f.description}</p>
                    )}

                    {/* Rollout control — real, not a static label. */}
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        defaultValue={pct}
                        disabled={save.isPending}
                        onMouseUp={(e) => {
                          const next = Number((e.target as HTMLInputElement).value);
                          if (next !== pct) setRollout(f, next);
                        }}
                        className="h-1.5 w-40 cursor-pointer accent-[hsl(var(--primary))]"
                        aria-label={`${f._id} rollout percentage`}
                      />
                      <span className="text-xs tabular-nums text-muted-foreground">{pct}% of users</span>
                    </div>
                  </div>

                  <Toggle on={!!f.enabled} loading={save.isPending} onClick={() => toggle(f)} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
