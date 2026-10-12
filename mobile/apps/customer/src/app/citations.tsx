import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileWarning, Scale } from 'lucide-react-native';
import { Badge, Button, Card, EmptyState, Screen, ScreenHeader, SkeletonList, Text, useConfirm, useTheme, useToast, space } from '@catodrive/ui';
import { RequireAuth, openInAppBrowser } from '@catodrive/core';
import { violationsApi } from '@catodrive/core/web/features/violations/api';
import { formatDateTime, formatMoney } from '@catodrive/core/web/lib/utils/format';

/** The website's /citations: tickets and tolls from trips, each disputable ("This is not mine"). */
function Citations() {
  const { c } = useTheme();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['my-violations'], queryFn: () => violationsApi.mine(), retry: false });
  const dispute = useMutation({
    meta: { silentError: true },
    mutationFn: ({ id, why }: { id: string; why: string }) => violationsApi.dispute(id, why),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Dispute sent', body: 'The charge is on hold until we review it.' });
      void qc.invalidateQueries({ queryKey: ['my-violations'] });
    },
    onError: () => toast({ tone: 'error', title: 'Could not send that dispute' }),
  });

  if (q.isPending) return <SkeletonList rows={2} height={140} />;
  if (q.isError) return null;
  if (!q.data.length) return <EmptyState icon={<FileWarning size={28} color={c.primary} />} title="No citations" body="Tickets or tolls from your trips would appear here." />;

  return (
    <>
      {q.data.map((v) => {
        const open = v.status === 'reported' || v.status === 'charged';
        return (
          <Card key={v._id}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                  <Text variant="label" style={{ textTransform: 'capitalize' }}>{v.type}</Text>
                  <Badge label={v.status === 'disputed' ? 'Under review' : v.status} tone={v.status === 'waived' || v.status === 'resolved' ? 'success' : v.status === 'disputed' ? 'warning' : 'neutral'} />
                </View>
                <Text variant="caption" tone="muted">{v.issuedBy} · ref {v.citationRef}</Text>
                <Text variant="caption" tone="muted">Occurred {formatDateTime(v.occurredAt)}</Text>
                {v.description ? <Text variant="caption">{v.description}</Text> : null}
              </View>
              <Text variant="heading">{formatMoney({ amount: v.amount, currency: v.currency })}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md, flexWrap: 'wrap' }}>
              {v.evidenceUrl ? <Button title="See the notice" size="sm" variant="ghost" full={false} icon={<ExternalLink size={14} color={c.primary} />} onPress={() => void openInAppBrowser(v.evidenceUrl!)} /> : null}
              {open ? (
                <Button
                  title="This is not mine"
                  size="sm"
                  variant="outline"
                  full={false}
                  icon={<Scale size={14} color={c.foreground} />}
                  loading={dispute.isPending && dispute.variables?.id === v._id}
                  onPress={async () => {
                    const { ok, reason } = await confirm({
                      title: 'Dispute this charge?',
                      description: 'The charge is put on hold while our team reviews it.',
                      confirmLabel: 'Send dispute',
                      reason: { label: 'What is wrong with this charge?', placeholder: 'The more specific, the faster we can settle it.', required: true },
                    });
                    if (ok && reason.length >= 10) dispute.mutate({ id: v._id, why: reason });
                    else if (ok) toast({ tone: 'info', title: 'Please add a little more detail (10 characters or more).' });
                  }}
                />
              ) : null}
            </View>
          </Card>
        );
      })}
    </>
  );
}

export default function CitationsScreen() {
  const router = useRouter();
  return (
    <RequireAuth>
      <Screen header={<ScreenHeader title="Tickets & tolls" subtitle="Charged at cost. If one is not yours, say so and we will hold it." onBack={() => router.back()} />}>
        <Citations />
      </Screen>
    </RequireAuth>
  );
}
