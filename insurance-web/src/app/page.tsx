'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { insurerApi } from '@/features/insurers/api';

/** A company with details on file opens its portal; a new or rejected one fills in its details first. */
export default function InsuranceHome() {
  const router = useRouter();
  const me = useQuery({ queryKey: ['insurer-me'], queryFn: () => insurerApi.me() });
  const insurer = me.data?.insurer;
  const target = me.isSuccess ? (insurer && insurer.status !== 'rejected' ? '/portal' : '/apply') : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (me.isError) return <div className="mx-auto max-w-xl px-4 py-12"><ErrorState message="We couldn’t load your account." retry={() => me.refetch()} /></div>;
  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6"><Skeleton className="h-64 w-full rounded-lg" /></div>;
}
