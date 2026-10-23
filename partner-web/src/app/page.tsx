'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { assetPartnerApi } from '@/features/asset-partners/api';

/** A partner who has finished getting started opens the dashboard; everyone else continues where they left off. */
function PartnerRouter() {
  const router = useRouter();
  const q = useQuery({ queryKey: ['partner-onboarding'], queryFn: () => assetPartnerApi.onboarding() });
  const target = q.data ? (q.data.stage === 'ready' ? '/dashboard' : '/onboarding') : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (q.isError) return <ErrorState message="We couldn’t load your account." retry={() => q.refetch()} />;
  return <Skeleton className="h-48 w-full rounded-lg" />;
}

export default function PartnerHome() {
  return (
    <AuthGuard loginPath="/sign-in">
      <PartnerRouter />
    </AuthGuard>
  );
}
