'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { adminApi } from '@/features/admin/api';

export default function AdminReferralsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-referrals', days],
    queryFn: () => adminApi.referralStats(days),
  });

  return (
    <div className="space-y-6">
      <h1 className="display text-display-sm">Referrals</h1>

      <div className="flex flex-wrap gap-2">
        {[7, 30, 90].map((d) => (
          <Chip key={d} active={days === d} onClick={() => setDays(d)}>Last {d} days</Chip>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !data ? (
        <EmptyState title="No referral data" description="Nothing has been referred yet." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Total referrals" value={data.total} />
            <Stat label="Converted" value={data.converted} />
            <Stat label="Pending" value={data.pending} />
            <Stat label="Conversion rate" value={`${data.conversionRatePct}%`} />
          </div>

          <Card>
            <CardContent className="py-5">
              <p className="font-semibold">Top referrers</p>
              {/* Referral fraud is self-dealing at scale, so an outlier here is
                  the thing worth investigating, not celebrating. */}
              <p className="mt-0.5 text-sm text-muted-foreground">
                An unusually high count can mean advocacy — or self-referral. Worth a look either way.
              </p>
              {data.topReferrers.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No conversions yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {data.topReferrers.map((r, i) => (
                    <li key={r.userId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="flex items-center gap-3">
                        <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                        <span className="font-mono">{r.userId.slice(0, 12)}…</span>
                      </span>
                      <span className="font-semibold">{r.conversions} converted</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
