'use client';

import { Radio, Eye, Fingerprint } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { adminApi, type TrafficSource } from '@/features/admin/api';

const SOURCE_LABEL: Record<TrafficSource, string> = {
  direct: 'Direct',
  search: 'Search',
  social: 'Social',
  referral: 'Referral',
  email: 'Email',
  paid: 'Paid',
};

/** Horizontal ranked bars — same pattern as the main Analytics page. */
function Ranked({ rows }: { rows: { label: string; count: number }[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data in the last 24 hours.</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{r.count}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary/70" style={{ width: `${max > 0 ? (r.count / max) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LiveTrafficPage() {
  // Polling rather than a socket push: visitor volume here is low enough
  // that a 5s refresh reads as "live" without adding a second realtime
  // transport just for this one screen.
  const { data, isLoading } = useQuery({
    queryKey: ['admin-live-traffic'],
    queryFn: () => adminApi.liveTraffic(),
    refetchInterval: 5_000,
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title="Live Traffic"
        description="Who's on the site right now, where they came from, and what they're looking at. Updates every 5 seconds."
      />

      {isLoading || !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
          </div>
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              tone="success"
              icon={<Radio className="h-5 w-5" />}
              label="Active right now"
              value={data.activeVisitors.toLocaleString()}
              sub="Distinct sessions in the last 5 minutes"
            />
            <StatTile
              icon={<Eye className="h-5 w-5" />}
              label="Visits · last 24h"
              value={data.visitsLast24h.toLocaleString()}
              sub="Every pageview, any visitor"
            />
            <StatTile
              icon={<Fingerprint className="h-5 w-5" />}
              label="Unique visitors · last 24h"
              value={data.uniqueVisitorsLast24h.toLocaleString()}
              sub="Deduped by anonymous device hash"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="rounded-2xl shadow-soft">
              <CardHeader><CardTitle>Traffic sources</CardTitle></CardHeader>
              <CardContent>
                <Ranked rows={data.bySource.map((s) => ({ label: SOURCE_LABEL[s.source], count: s.count }))} />
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-soft">
              <CardHeader><CardTitle>Top referrers</CardTitle></CardHeader>
              <CardContent>
                <Ranked rows={data.topReferrers.map((r) => ({ label: r.domain, count: r.count }))} />
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-soft">
              <CardHeader><CardTitle>Top pages</CardTitle></CardHeader>
              <CardContent>
                <Ranked rows={data.topPages.map((p) => ({ label: p.path, count: p.count }))} />
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl shadow-soft">
            <CardHeader><CardTitle>Recent visits</CardTitle></CardHeader>
            <CardContent>
              {data.recent.length === 0 ? (
                <EmptyState title="No visits yet" description="Pageviews will appear here as people browse the site." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-start text-muted-foreground">
                        <th className="px-3 py-2 text-start font-medium">Page</th>
                        <th className="px-3 py-2 text-start font-medium">Source</th>
                        <th className="px-3 py-2 text-start font-medium">Location</th>
                        <th className="px-3 py-2 text-start font-medium">Device</th>
                        <th className="px-3 py-2 text-start font-medium">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((r, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="max-w-[240px] truncate px-3 py-2 font-medium">{r.path}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {SOURCE_LABEL[r.source]}{r.referrerDomain ? ` · ${r.referrerDomain}` : ''}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {[r.city, r.country].filter(Boolean).join(', ') || '—'}
                          </td>
                          <td className="px-3 py-2 capitalize text-muted-foreground">{r.device}</td>
                          <td className="px-3 py-2 text-muted-foreground">{new Date(r.at).toLocaleTimeString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
