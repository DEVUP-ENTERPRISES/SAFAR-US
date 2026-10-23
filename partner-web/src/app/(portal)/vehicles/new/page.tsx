'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { assetPartnerApi, type PartnerApplicationDetail } from '@/features/asset-partners/api';
import { ApplicationForm } from '~/features/onboarding/application-form';

function AddCar() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const editId = useSearchParams().get('edit');
  const q = useQuery({ queryKey: ['asset-partner-dashboard'], queryFn: () => assetPartnerApi.dashboard() });

  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;
  if (q.isError || !q.data) return <ErrorState message="We couldn’t load your details." retry={() => q.refetch()} />;

  const apps = q.data.applications as PartnerApplicationDetail[];
  const editing = editId ? apps.find((a) => a._id === editId && a.status === 'changes_requested') : undefined;
  // Their own details come from their latest application, so they only fill in the car.
  const latest = editing ?? apps[0];
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['asset-partner-dashboard'] });
    toast({ tone: 'success', title: 'Car sent for review', description: 'We’ll contact you to arrange the inspection.' });
    router.push('/vehicles');
  };

  return (
    <ApplicationForm
      mode="vehicle"
      initial={latest}
      reviewNote={editing?.reviewNotes}
      draftKey={editing ? `cd-partner-car-${editing._id}` : 'cd-partner-car'}
      submitLabel={editing ? 'Send again' : 'Send for review'}
      onSubmit={(input) => (editing ? assetPartnerApi.resubmitApplication(editing._id, input) : assetPartnerApi.submitApplication(input)).then(done)}
    />
  );
}

export default function AddCarPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <Link href="/vehicles" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Your vehicles
      </Link>
      <PageHeader eyebrow="Asset Partners" title="Add another car" description="Tell us about the car. CatoDrive reviews it and inspects it before it goes live." />
      <Suspense>
        <AddCar />
      </Suspense>
    </div>
  );
}
