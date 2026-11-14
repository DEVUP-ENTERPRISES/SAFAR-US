'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, PauseCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
import { formatDate, formatPlate } from '@/lib/utils/format';
import { carPauseApi, PAUSE_STATUS, pauseSpan, type CarPauseRow } from '@/features/vehicles/pause';
import { PartnersNav } from '~/features/partners/partners-nav';

type Filter = 'pending' | 'open' | 'closed';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'pending', label: 'To review' },
  { value: 'open', label: 'In place' },
  { value: 'closed', label: 'Past' },
];
const EMPTY: Record<Filter, { title: string; description: string }> = {
  pending: { title: 'Nothing to review', description: 'When a partner asks to pause a car, it shows up here and you get an alert.' },
  open: { title: 'No cars paused', description: 'Approved and active pauses show up here.' },
  closed: { title: 'No past pauses', description: 'Ended, declined and cancelled pauses show up here.' },
};

export default function CarPausesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<Filter>('pending');
  const list = useQuery({ queryKey: ['car-pauses', filter], queryFn: () => carPauseApi.requests({ status: filter, limit: 50 }) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['car-pauses'] });

  const approve = useMutation({
    meta: { silentError: true },
    mutationFn: (id: string) => carPauseApi.approve(id),
    onSuccess: () => { toast({ tone: 'success', title: 'Approved', description: 'Those dates are blocked and the partner has been told.' }); refresh(); },
    onError: (e) => toast({ tone: 'error', title: 'Couldn’t approve', description: e instanceof ApiError ? e.message : 'Try again.' }),
  });
  const decline = useMutation({
    meta: { silentError: true },
    mutationFn: ({ id, reason }: { id: string; reason: string }) => carPauseApi.decline(id, reason),
    onSuccess: () => { toast({ tone: 'success', title: 'Declined', description: 'The partner sees your reason.' }); refresh(); },
    onError: (e) => toast({ tone: 'error', title: 'Couldn’t decline', description: e instanceof ApiError ? e.message : 'Try again.' }),
  });

  const askDecline = async (r: CarPauseRow) => {
    const { ok, reason } = await confirm({
      title: `Decline the pause for the ${r.vehicleLabel}?`,
      reason: { label: 'Reason for the partner', placeholder: 'e.g. The car is booked for those dates', required: true },
      confirmLabel: 'Decline',
      tone: 'destructive',
    });
    if (ok) decline.mutate({ id: r._id, reason });
  };

  const busy = (id: string) => (approve.isPending && approve.variables === id) || (decline.isPending && decline.variables?.id === id);

  return (
    <div className="space-y-5">
      <PageHeader title="Car pauses" description="Partner requests to take a car off CatoDrive for some dates, and pauses in place." />
      <PartnersNav />
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</Chip>)}
      </div>
      {list.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
      ) : list.isError ? (
        <ErrorState message="We couldn’t load car pauses." retry={() => void list.refetch()} />
      ) : !list.data?.length ? (
        <EmptyState icon={<PauseCircle className="h-8 w-8" />} title={EMPTY[filter].title} description={EMPTY[filter].description} />
      ) : (
        <ul className="space-y-3">
          {list.data.map((r) => (
            <li key={r._id}>
              <Card>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/ops/listings/${r.vehicleId}`} className="font-semibold hover:underline">{r.vehicleLabel}</Link>
                      {r.plate && <span className="font-mono text-xs text-muted-foreground">{formatPlate(r.plate)}</span>}
                      <Badge tone={PAUSE_STATUS[r.status].tone}>{PAUSE_STATUS[r.status].label}</Badge>
                    </p>
                    <p className="tabular-nums">{pauseSpan(r)}</p>
                    <p className="text-muted-foreground">
                      {r.source === 'partner' ? `${r.partnerName ?? 'Partner'} asked` : 'Paused by the team'} on {formatDate(r.createdAt)}: {r.reason}
                    </p>
                    {r.declineReason && <p className="text-muted-foreground">Declined: {r.declineReason}</p>}
                    {r.endNote && <p className="text-warning">{r.endNote}</p>}
                    {r.status === 'pending' && r.tripsInWindow > 0 && (
                      <p className="flex items-center gap-1.5 font-medium text-warning">
                        <AlertTriangle className="h-4 w-4" aria-hidden /> {r.tripsInWindow} trip{r.tripsInWindow === 1 ? ' is' : 's are'} booked on these dates. Move or cancel {r.tripsInWindow === 1 ? 'it' : 'them'} before approving.
                      </p>
                    )}
                  </div>
                  {r.status === 'pending' && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" disabled={busy(r._id)} onClick={() => void askDecline(r)}>Decline</Button>
                      <Button size="sm" loading={approve.isPending && approve.variables === r._id} disabled={busy(r._id) || r.tripsInWindow > 0} onClick={() => approve.mutate(r._id)}>Approve</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {list.data && list.data.length >= 50 && <p className="text-xs text-muted-foreground">Showing the latest 50.</p>}
    </div>
  );
}
