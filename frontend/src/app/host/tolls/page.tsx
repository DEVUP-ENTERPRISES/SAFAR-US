'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { hostTollsApi, agencyLabel } from '@/features/host/tolls-api';
import { TollStatusPill } from '@/features/host/components/toll-status';

/** The host's linked toll accounts, like Turo's "Toll accounts". */
export default function TollAccountsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['host-toll-accounts'], queryFn: () => hostTollsApi.accounts() });

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-28">
      <div>
        <h1 className="display text-2xl">Toll accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Link your toll accounts so tolls from each trip are matched to the guest who was driving and charged to them.
        </p>
      </div>

      {isLoading && <Skeleton className="h-28 w-full rounded-2xl" />}
      {!isLoading && !data?.length && (
        <EmptyState title="No toll accounts linked" description="Link your NTTA account to start billing guests for their tolls." />
      )}

      {(data ?? []).map((a) => (
        <Link key={a._id} href={`/host/tolls/${a._id}`} className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <TollStatusPill status={a.status} />
              <p className="text-lg font-bold">{agencyLabel(a.agency)}</p>
              <p className="text-muted-foreground">{a.nickname}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </Link>
      ))}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
        <Link href="/host/tolls/new" className="mx-auto block max-w-2xl">
          <Button size="lg" className="w-full">{data?.length ? 'Link another toll account' : 'Link a toll account'}</Button>
        </Link>
      </div>
    </div>
  );
}
