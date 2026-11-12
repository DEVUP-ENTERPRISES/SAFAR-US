'use client';

import { PageHeader } from '@/components/ui/page-header';
import { PartnerFeeReport } from '@/features/asset-partners/fee-report';
import { PartnersNav } from '~/features/partners/partners-nav';

export default function PartnerFeesPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Registration fees" description="What partners have paid to join, and what’s still due." />
      <PartnersNav />
      <PartnerFeeReport base="/ioc" partnerHref={(id) => `/ops/partners/members/${id}`} />
    </div>
  );
}
