'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ShieldAlert, Check, Clock, XCircle } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { claimsApi } from '@/features/claims/api';

const TONE: Record<string, 'success' | 'warning' | 'destructive' | 'muted' | 'default'> = {
  opened: 'warning',
  investigating: 'warning',
  assigned: 'warning',
  approved: 'success',
  settled: 'success',
  rejected: 'destructive',
  closed: 'muted',
};

/** What each status means, in the claimant's terms. */
const STATUS_COPY: Record<string, string> = {
  opened: 'Filed and waiting for our team to pick it up.',
  investigating: 'Our team is reviewing the evidence.',
  assigned: 'Assigned to a specialist for review.',
  approved: 'Upheld — settlement is being processed.',
  settled: 'Resolved and settled.',
  rejected: 'Reviewed and not upheld.',
  closed: 'Closed.',
};

function ClaimDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: c, isLoading, isError } = useQuery({
    queryKey: ['claim', id],
    queryFn: () => claimsApi.get(id),
  });

  if (isLoading) return <Skeleton className="h-[60vh] w-full rounded-2xl" />;
  if (isError || !c) return <ErrorState message="Claim not found." />;

  const photos = c.evidence.filter((e) => e.kind === 'image');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <button
        onClick={() => router.push('/claims')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All claims
      </button>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold capitalize">
                <ShieldAlert className="h-5 w-5 text-destructive" /> {c.type} claim
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">Filed {formatDate(c.createdAt)}</p>
            </div>
            <Badge tone={TONE[c.status] ?? 'muted'}>{c.status}</Badge>
          </div>

          <p className="rounded-lg bg-subtle p-3 text-sm">{STATUS_COPY[c.status] ?? ''}</p>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</p>
            <p className="mt-1 text-sm">{c.description}</p>
          </div>

          {typeof c.amountClaimed === 'number' && c.amountClaimed > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
              <span className="text-muted-foreground">Amount claimed</span>
              <span className="font-semibold tabular-nums">
                {formatMoney({ amount: c.amountClaimed, currency: 'USD' })}
              </span>
            </div>
          )}

          {photos.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Evidence ({photos.length})
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((e, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={e.url} alt="" className="aspect-square w-full rounded-lg border border-border object-cover" />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timeline — the live status trail an operator moves it through. */}
      <div>
        <h2 className="mb-3 text-sm font-semibold">Progress</h2>
        <ol className="space-y-0">
          {(c.timeline ?? []).map((t, i) => {
            const last = i === (c.timeline?.length ?? 0) - 1;
            const Icon = t.status === 'rejected' ? XCircle : ['approved', 'settled', 'closed'].includes(t.status) ? Check : Clock;
            return (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`grid h-7 w-7 place-items-center rounded-full ${last ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  {!last && <span className="w-px flex-1 bg-border" />}
                </div>
                <div className={`pb-5 ${last ? '' : ''}`}>
                  <p className="text-sm font-medium capitalize">{t.status.replace(/_/g, ' ')}</p>
                  {t.note && <p className="text-sm text-muted-foreground">{t.note}</p>}
                  <p className="text-xs text-muted-foreground">{formatDate(t.at)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

export default function ClaimDetailPage() {
  return (
    <AuthGuard>
      <ClaimDetail />
    </AuthGuard>
  );
}
