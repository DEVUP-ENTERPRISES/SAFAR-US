'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { ApiError } from '@/lib/api/types';
import { legalApi } from '@/features/legal/api';

export default function AssetPartnerAgreementPage() {
  const q = useQuery({ queryKey: ['public-partner-agreement'], queryFn: legalApi.partnerAgreement, retry: false, staleTime: 10 * 60_000 });
  const missing = q.error instanceof ApiError && q.error.status === 404;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader
        title="Asset Partner Agreement"
        description="The current agreement Asset Partners sign, with our standard terms filled in. Your own details go in the blanks when you sign."
      />
      {q.isLoading ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : missing ? (
        <EmptyState icon={<FileText className="h-8 w-8" />} title="No agreement published yet" description="It appears here as soon as CatoDrive publishes it. Ask the partnerships team for a copy in the meantime." />
      ) : q.isError || !q.data ? (
        <ErrorState message="We couldn’t load the agreement." retry={() => void q.refetch()} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {q.data.title} · Version {q.data.version} · Published {new Date(q.data.publishedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
          </p>
          <div className="whitespace-pre-wrap break-words rounded-lg border border-border bg-card p-5 text-sm leading-relaxed">{q.data.body}</div>
          <p className="text-xs text-muted-foreground">
            Sample for review only. Your own terms can differ and are shown to you before you sign. See also the{' '}
            <Link href="/legal/disclosures#earnings" className="font-semibold text-foreground underline underline-offset-2">earnings disclosure</Link>.
          </p>
        </>
      )}
    </div>
  );
}
