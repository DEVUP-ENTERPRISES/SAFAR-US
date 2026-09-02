'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { aiApi } from '@/features/ai/api';

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

const LABELS: Record<string, string> = {
  'damage-review': 'Damage review',
  'case-file': 'Claim case files',
};

/**
 * What AI actually costs, per feature.
 *
 * Deliberately not one number. "AI cost $180 last week" tells an operator
 * nothing they can act on; "damage review is 90% of it at 3c a call" tells them
 * whether to keep it. Failures are shown beside calls because a feature that is
 * failing half the time is both wasting money and quietly broken.
 */
export default function AiUsagePage() {
  const [days, setDays] = useState(7);
  const q = useQuery({ queryKey: ['ai-usage', days], queryFn: () => aiApi.usage(days) });

  const total = (q.data?.byFeature ?? []).reduce((s, f) => s + f.costCents, 0);
  const calls = (q.data?.byFeature ?? []).reduce((s, f) => s + f.calls, 0);
  const failures = (q.data?.byFeature ?? []).reduce((s, f) => s + f.failures, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="AI usage" description="What each AI feature costs, and whether it is working." />

      <div className="flex gap-2">
        {[1, 7, 30].map((d) => (
          <Chip key={d} active={days === d} onClick={() => setDays(d)}>
            {d === 1 ? 'Today' : `${d} days`}
          </Chip>
        ))}
      </div>

      {q.isLoading ? (
        <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" /></div>
      ) : q.isError ? (
        <ErrorState message="Couldn't load AI usage." retry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={`Spent over ${days === 1 ? 'today' : `${days} days`}`} value={money(total)} />
            <Stat label="Spent today" value={money(q.data!.spentTodayCents)} />
            <Stat
              label="Calls"
              value={String(calls)}
              sub={failures > 0 ? `${failures} failed` : 'all succeeded'}
              tone={failures > 0 ? 'warning' : undefined}
            />
          </div>

          {(q.data?.byFeature.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Sparkles className="h-8 w-8" />}
              title="No AI calls in this window"
              description="Usage appears here once a feature runs."
            />
          ) : (
            <Card>
              <CardContent className="divide-y divide-border py-2">
                {q.data!.byFeature.map((f) => {
                  const failing = f.failures > 0 && f.failures / f.calls > 0.2;
                  return (
                    <div key={f._id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                      <div className="min-w-0">
                        <p className="font-medium">{LABELS[f._id] ?? f._id}</p>
                        <p className="numeric mt-0.5 text-xs text-muted-foreground">
                          {f.calls} call{f.calls === 1 ? '' : 's'}
                          {' · '}{money(Math.round(f.costCents / Math.max(1, f.calls)))} each
                          {' · '}{(f.avgLatencyMs / 1000).toFixed(1)}s average
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* A feature failing often is broken, not just costly. */}
                        {failing && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                            <AlertTriangle className="h-3.5 w-3.5" /> {f.failures} failed
                          </span>
                        )}
                        <span className="numeric font-semibold">{money(f.costCents)}</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warning' }) {
  return (
    <Card className={tone === 'warning' ? 'border-warning/40' : undefined}>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="numeric mt-1.5 text-2xl font-bold">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
