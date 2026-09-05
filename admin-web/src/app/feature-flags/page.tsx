'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { adminApi } from '@/features/admin/api';

/**
 * Feature flags. The nav has listed this route since the module shipped, but
 * the page never existed — clicking it 404'd.
 *
 * Toggling is immediate and affects live traffic, so each row states its
 * rollout percentage rather than only on/off: a flag at 10% is not "on".
 */
export default function FeatureFlagsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const flags = useQuery({ queryKey: ['admin-flags'], queryFn: () => adminApi.featureFlags() });

  const save = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => adminApi.saveFlag(key, { enabled }),
    onSuccess: (_d, v) => {
      toast({ tone: 'success', title: `${v.key} ${v.enabled ? 'enabled' : 'disabled'}` });
      qc.invalidateQueries({ queryKey: ['admin-flags'] });
    },
    onError: () => toast({ tone: 'error', title: 'Could not save the flag' }),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Feature flags" description="Turn behaviour on and off without a deploy. Changes take effect immediately." />

      {flags.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : flags.isError ? (
        <ErrorState message="Couldn't load feature flags." retry={() => flags.refetch()} />
      ) : (flags.data?.length ?? 0) === 0 ? (
        <EmptyState icon={<Flag className="h-8 w-8" />} title="No flags defined" description="Flags appear here once the backend registers them." />
      ) : (
        <div className="space-y-3">
          {flags.data!.map((f) => {
            const pct = f.rollout?.percentage;
            const partial = f.enabled && typeof pct === 'number' && pct < 100;
            return (
              <Card key={f._id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold">
                      <span className="font-mono text-sm">{f._id}</span>
                      {/* A flag at 10% is not "on" — say which. */}
                      {partial ? (
                        <Badge tone="warning">{pct}% rollout</Badge>
                      ) : (
                        <Badge tone={f.enabled ? 'success' : 'muted'}>{f.enabled ? 'On' : 'Off'}</Badge>
                      )}
                    </p>
                    {f.description && <p className="mt-0.5 text-sm text-muted-foreground">{f.description}</p>}
                    {f.updatedAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last changed {new Date(f.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                        {f.updatedBy ? ` by ${f.updatedBy}` : ''}
                      </p>
                    )}
                  </div>
                  <button
                    role="switch"
                    aria-checked={f.enabled}
                    aria-label={`Toggle ${f._id}`}
                    disabled={save.isPending}
                    onClick={() => save.mutate({ key: f._id, enabled: !f.enabled })}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${f.enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                  >
                    <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${f.enabled ? 'start-6' : 'start-1'}`} />
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
