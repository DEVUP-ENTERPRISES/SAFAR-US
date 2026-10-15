'use client';

import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { PageTabs } from '@/features/admin/components/page-tabs';
import { AdminFinancePage } from './money-tab';
import { RevenueBySourcePage } from './sources-tab';
import { AdminAnalyticsPage } from './activity-tab';

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Overview" title="Reports" description="All the numbers in one place: the money, where it came from, and how bookings and sign-ups are going." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <PageTabs
          tabs={[
            { key: 'money', label: 'Money', render: () => <AdminFinancePage /> },
            { key: 'sources', label: 'Revenue by source', render: () => <RevenueBySourcePage /> },
            { key: 'activity', label: 'Bookings & users', render: () => <AdminAnalyticsPage /> },
          ]}
        />
      </Suspense>
    </div>
  );
}
