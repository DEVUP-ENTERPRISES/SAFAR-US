import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Wrench } from 'lucide-react-native';
import { Badge, Button, Card, Chip, EmptyState, ErrorState, Screen, ScreenHeader, SkeletonList, Text, space, useConfirm, useTheme, useToast } from '@catodrive/ui';
import { assetPartnerApi, type MaintenanceApproval, type MaintenanceRequest } from '@catodrive/core/web/features/asset-partners/api';
import { MAINTENANCE_FILTERS, MAINTENANCE_LABEL, MAINTENANCE_TONE } from '@catodrive/core/web/features/asset-partners/status';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatDay, formatMoney } from '@catodrive/core/web/lib/utils/format';
import { isNotEnrolled } from '@/features/asset-partners/notEnrolled';
import { partnerBadge } from '@/features/asset-partners/tone';

/** The website's /asset-partners/maintenance: routine work for reference, and a yes/no on anything above the approval line. */
export default function PartnerMaintenanceScreen() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [filter, setFilter] = useState<MaintenanceApproval | 'all'>('pending');
  const q = useQuery({
    queryKey: ['asset-partner-maintenance', filter],
    queryFn: () => assetPartnerApi.maintenance(filter === 'all' ? undefined : filter),
    retry: false,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['asset-partner-maintenance'] });
    void qc.invalidateQueries({ queryKey: ['asset-partner-dashboard'] });
  };
  const approve = useMutation({
    meta: { silentError: true },
    mutationFn: (id: string) => assetPartnerApi.approveMaintenance(id),
    onSuccess: () => {
      invalidate();
      toast({ tone: 'success', title: 'Approved - we’ll get it booked in' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not approve' }),
  });
  const decline = useMutation({
    meta: { silentError: true },
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => assetPartnerApi.declineMaintenance(id, reason),
    onSuccess: () => {
      invalidate();
      toast({ tone: 'success', title: 'Declined - the work won’t go ahead' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not decline' }),
  });

  const onDecline = async (m: MaintenanceRequest) => {
    const { ok, reason } = await confirm({
      title: `Decline this ${m.type}?`,
      description: 'The work won’t be carried out. If it affects whether the car can safely stay on the road, we’ll be in touch.',
      confirmLabel: 'Decline work',
      tone: 'destructive',
      reason: { label: 'Reason (optional)', placeholder: 'e.g. I’ll handle this myself' },
    });
    if (ok) decline.mutate({ id: m._id, reason: reason || undefined });
  };

  const data = q.data;
  return (
    <Screen
      header={<ScreenHeader large title="Maintenance" subtitle="Routine work happens without interrupting you. Anything above your approval line comes here first." />}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {MAINTENANCE_FILTERS.map((f) => <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />)}
      </ScrollView>
      {q.isPending ? <SkeletonList rows={3} height={130} /> : null}
      {q.isError && isNotEnrolled(q.error) ? (
        <EmptyState title="You’re not an Asset Partner yet" body="Maintenance approvals open once you’re enrolled in the programme." />
      ) : null}
      {q.isError && !isNotEnrolled(q.error) && !data ? <ErrorState message="We couldn’t load your maintenance requests." onRetry={() => void q.refetch()} /> : null}
      {data && data.length === 0 ? (
        <EmptyState
          icon={<Wrench size={28} color={c.primary} />}
          title={filter === 'pending' ? 'Nothing needs you' : 'Nothing here'}
          body={filter === 'pending' ? 'When work costs more than your approval line, it waits for your decision here.' : 'No maintenance in this category yet.'}
        />
      ) : null}
      {data?.map((m) => (
        <Card key={m._id}>
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
              <Badge label={MAINTENANCE_LABEL[m.approval]} tone={partnerBadge(MAINTENANCE_TONE[m.approval])} />
              <Text variant="caption" tone="muted" style={{ textTransform: 'capitalize' }}>{m.type}</Text>
            </View>
            <Text variant="title">{typeof m.cost === 'number' ? formatMoney({ amount: m.cost, currency: 'USD' }) : 'Cost to be confirmed'}</Text>
            <Text variant="caption" tone="muted">Scheduled {formatDay(m.scheduledFor)}</Text>
            {m.notes ? <Text>{m.notes}</Text> : null}
            {m.approval === 'pending' && typeof m.approvalThresholdCents === 'number' ? (
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                <ShieldCheck size={16} color={c.mutedForeground} style={{ marginTop: 2 }} />
                <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                  Above your {formatMoney({ amount: m.approvalThresholdCents, currency: 'USD' })} approval line, so it needs your decision before any work starts.
                </Text>
              </View>
            ) : null}
            {m.declineReason ? (
              <Text variant="caption" tone="muted">
                <Text variant="caption" style={{ fontWeight: '600' }}>You declined:</Text> {m.declineReason}
              </Text>
            ) : null}
            {m.approval === 'pending' ? (
              <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
                <View style={{ flex: 1 }}>
                  <Button title="Approve" size="sm" loading={approve.isPending && approve.variables === m._id} disabled={approve.isPending || decline.isPending} onPress={() => approve.mutate(m._id)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Decline" size="sm" variant="outline" loading={decline.isPending && decline.variables?.id === m._id} disabled={approve.isPending || decline.isPending} onPress={() => void onDecline(m)} />
                </View>
              </View>
            ) : null}
          </View>
        </Card>
      ))}
    </Screen>
  );
}
