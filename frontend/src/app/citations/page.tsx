'use client';

import { AuthGuard } from '@/components/layout/auth-guard';
import { PageHeader } from '@/components/ui/page-header';
import { MyCitations } from '@/features/violations/my-citations';

/**
 * Tickets and tolls charged to me.
 *
 * Its own route rather than a tab buried in account settings: a charge someone
 * did not expect is exactly the thing they go looking for, and it needs to be
 * linkable from the notification that told them about it.
 */
export default function CitationsPage() {
  return (
    <AuthGuard>
      <div className="mx-auto max-w-3xl space-y-6 py-6">
        <PageHeader
          title="Tickets & tolls"
          description="Citations from your trips, charged at cost. If one is not yours, say so and we will hold it."
        />
        <MyCitations />
      </div>
    </AuthGuard>
  );
}
