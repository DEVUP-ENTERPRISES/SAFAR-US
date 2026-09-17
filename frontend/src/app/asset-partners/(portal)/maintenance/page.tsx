'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wrench, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { formatMoney, formatDate } from '@/lib/utils/format';
import {
  assetPartnerApi,
  type MaintenanceApproval,
  type MaintenanceRequest,
} from '@/features/asset-partners/api';
import { ApiError } from '@/lib/api/types';

/**
 * Maintenance approvals.
 *
 * The partner agreement: routine work under the agreed line is handled without
 * interrupting the owner; anything above needs their yes/no before it starts.
 * This is the one place in the whole programme a passive owner has to act, so
 * pending requests lead and everything else is history.
 */

const FILTERS: { value: MaintenanceApproval | 'all'; label: string }[] = [
  { value: 'pending', label: 'Needs you' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'not_required', label: 'Routine' },
  { value: 'all', label: 'All' },
];

const TONE: Record<MaintenanceApproval, 'default' | 'success' | 'warning' | 'destructive' | 'muted'> = {
  pending: 'warning',
  approved: 'success',
  declined: 'destructive',
  not_required: 'muted',
};

const LABEL: Record<MaintenanceApproval, string> = {
  pending: 'Needs your approval',
  approved: 'You approved',
  declined: 'You declined',
  not_required: 'Routine — no approval needed',
};

export default function PartnerMaintenancePage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [filter, setFilter] = useState<MaintenanceApproval | 'all'>('pending');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['asset-partner-maintenance', filter],
    queryFn: () => assetPartnerApi.maintenance(filter === 'all' ? undefined : filter),
    retry: false,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['asset-partner-maintenance'] });
    qc.invalidateQueries({ queryKey: ['asset-partner-dashboard'] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => assetPartnerApi.approveMaintenance(id),
    onSuccess: () => {
      invalidate();
      toast({ tone: 'success', title: 'Approved — we’ll get it booked in' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not approve' }),
  });

  const decline = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      assetPartnerApi.declineMaintenance(id, reason),
    onSuccess: () => {
      invalidate();
      toast({ tone: 'success', title: 'Declined — the work won’t go ahead' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not decline' }),
  });

  const onDecline = async (m: MaintenanceRequest) => {
    const { ok, reason } = await confirm({
      title: `Decline this ${m.type}?`,
      description:
        'The work won’t be carried out. If it affects whether the car can safely stay on the road, we’ll be in touch.',
      confirmLabel: 'Decline work',
      tone: 'destructive',
      reason: { label: 'Reason (optional)', placeholder: 'e.g. I’ll handle this myself' },
    });
    if (ok) decline.mutate({ id: m._id, reason });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 py-8">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError && error instanceof ApiError && error.status === 403) {
    return (
      <div className="py-8">
        <EmptyState
          title="You’re not an Asset Partner yet"
          description="Maintenance approvals open once you’re enrolled in the programme."
        />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-8">
        <ErrorState message="We couldn’t load your maintenance requests." retry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6 py-8">
      <PageHeader
        eyebrow="Asset Partners"
        title="Maintenance"
        description="Routine work happens without interrupting you. Anything above your approval line comes here first."
      />

      <div className="hide-scrollbar flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {data.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-8 w-8" />}
          title={filter === 'pending' ? 'Nothing needs you' : 'Nothing here'}
          description={
            filter === 'pending'
              ? 'When work costs more than your approval line, it waits for your decision here.'
              : 'No maintenance in this category yet.'
          }
        />
      ) : (
        <div className="space-y-4">
          {data.map((m) => (
            <Card key={m._id}>
              <CardContent className="space-y-4 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={TONE[m.approval]}>{LABEL[m.approval]}</Badge>
                      <span className="text-xs capitalize text-muted-foreground">{m.type}</span>
                    </div>
                    <p className="display mt-2 text-lg">
                      {typeof m.cost === 'number'
                        ? formatMoney({ amount: m.cost, currency: 'USD' })
                        : 'Cost to be confirmed'}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Scheduled {formatDate(m.scheduledFor)}
                    </p>
                  </div>

                  {m.approval === 'pending' && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        size="sm"
                        loading={approve.isPending}
                        onClick={() => approve.mutate(m._id)}
                      >
                        <CheckCircle2 className="h-4 w-4" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        loading={decline.isPending}
                        onClick={() => onDecline(m)}
                      >
                        <XCircle className="h-4 w-4" /> Decline
                      </Button>
                    </div>
                  )}
                </div>

                {m.notes && <p className="text-sm leading-relaxed text-muted-foreground">{m.notes}</p>}

                {/* Why this one needed asking — the threshold is snapshotted at
                    creation, so it stays true even if the terms change later. */}
                {m.approval === 'pending' && typeof m.approvalThresholdCents === 'number' && (
                  <p className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    Above your{' '}
                    {formatMoney({ amount: m.approvalThresholdCents, currency: 'USD' })} approval
                    line, so it needs your decision before any work starts.
                  </p>
                )}

                {m.declineReason && (
                  <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    <span className="font-semibold">You declined:</span> {m.declineReason}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
