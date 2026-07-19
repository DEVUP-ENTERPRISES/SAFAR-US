'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Users, Wallet, Car, CheckSquare, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { formatMoney } from '@/lib/utils/format';
import { corporateApi } from '@/features/corporate/api';

export default function CorporateDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['corp-dashboard'],
    queryFn: () => corporateApi.dashboard(),
    refetchInterval: 30_000,
  });

  if (isLoading || !data)
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={data.role.replace('_', ' ')}
        title={data.org.name}
        description="Corporate mobility — manage members, budgets, policy and invoices."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          tone="primary"
          icon={<TrendingUp className="h-5 w-5" />}
          label="Total spend"
          value={formatMoney({ amount: data.totalSpend, currency: data.currency })}
          sub={`${data.totalTrips} trip${data.totalTrips === 1 ? '' : 's'}`}
        />
        <StatTile
          tone={data.pendingApprovals > 0 ? 'warning' : 'default'}
          emphasis={data.pendingApprovals > 0}
          icon={<CheckSquare className="h-5 w-5" />}
          label="Pending approvals"
          value={data.pendingApprovals}
          href="/corporate/approvals"
          sub={data.pendingApprovals > 0 ? 'Blocking travel' : 'All clear'}
        />
        <StatTile icon={<Users className="h-5 w-5" />} label="Members" value={data.members} href="/corporate/members" />
        <StatTile icon={<Wallet className="h-5 w-5" />} label="Cost centers" value={data.costCenters} href="/corporate/cost-centers" />
      </div>

      <Card className="rounded-2xl shadow-soft">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Car className="h-5 w-5" />
            </span>
            <span className="text-sm text-muted-foreground">
              Employees request business trips; managers approve them under your travel policy.
            </span>
          </div>
          <Link href="/corporate/approvals" className="text-sm font-medium text-primary hover:underline">
            Review requests →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
