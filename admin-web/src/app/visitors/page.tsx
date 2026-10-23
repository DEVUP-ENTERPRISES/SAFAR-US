'use client';

import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { PageTabs } from '@/features/admin/components/page-tabs';
import { LiveTrafficPage } from './live-tab';
import { GeoIntelligencePage } from './places-tab';

export default function VisitorsPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Overview" title="Visitors" description="Who is on the website right now, and where visitors come from." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
        <PageTabs
          tabs={[
            { key: 'live', label: 'Right now', render: () => <LiveTrafficPage /> },
            { key: 'places', label: 'Where they’re from', render: () => <GeoIntelligencePage /> },
          ]}
        />
      </Suspense>
    </div>
  );
}
