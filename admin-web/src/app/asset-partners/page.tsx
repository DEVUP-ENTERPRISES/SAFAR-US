'use client';

import { useQuery } from '@tanstack/react-query';
import { Car, CheckCircle2, Clock, Handshake, MessageSquareWarning, PauseCircle, UserPlus, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatTile } from '@/components/ui/stat-tile';
import { partnerManageApi } from '@/features/asset-partners/manage-api';

const manage = partnerManageApi('/admin');

/** Headline numbers only; applications, partners and the agreement are run from the operations panel. */
export default function AssetPartnersOverviewPage() {
  const q = useQuery({ queryKey: ['admin-asset-partner-summary'], queryFn: () => manage.summary() });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Money out"
        title="Asset Partners at a glance"
        description="Reviewing applications, partners and the agreement happens in the CatoDrive operations panel."
      />
      {q.isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : q.isError || !q.data ? (
        <ErrorState message="Couldn’t load the numbers." retry={() => q.refetch()} />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Applications</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile tone="warning" icon={<Clock className="h-5 w-5" />} label="Waiting for review" value={(q.data.applications.submitted ?? 0) + (q.data.applications.under_review ?? 0)} />
              <StatTile icon={<MessageSquareWarning className="h-5 w-5" />} label="Sent back for changes" value={q.data.applications.changes_requested ?? 0} />
              <StatTile tone="success" icon={<CheckCircle2 className="h-5 w-5" />} label="Approved" value={q.data.applications.approved ?? 0} />
              <StatTile icon={<XCircle className="h-5 w-5" />} label="Not approved" value={q.data.applications.rejected ?? 0} />
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Partners and cars</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile tone="success" icon={<Handshake className="h-5 w-5" />} label="Active partners" value={q.data.partners.active ?? 0} />
              <StatTile tone="warning" icon={<UserPlus className="h-5 w-5" />} label="Onboarding" value={q.data.partners.onboarding ?? 0} />
              <StatTile icon={<PauseCircle className="h-5 w-5" />} label="Suspended" value={q.data.partners.suspended ?? 0} />
              <StatTile icon={<Car className="h-5 w-5" />} label="Partner cars" value={q.data.vehicles} />
            </div>
          </section>
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">Programme terms (management fee, insurance, detailing, payout day) are still set here under Programme Terms.</CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
