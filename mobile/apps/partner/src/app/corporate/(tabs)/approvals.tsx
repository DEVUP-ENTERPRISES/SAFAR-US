import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Chip, EmptyState, Screen, ScreenHeader, SkeletonList, Text, space, useConfirm, type BadgeTone } from '@catodrive/ui';
import { REQUEST_TONE, corporateApi, type TripRequest } from '@catodrive/core/web/features/corporate/api';
import { formatDateRange, formatMoney } from '@catodrive/core/web/lib/utils/format';

const STATUSES = ['pending', 'approved', 'booked', 'rejected', ''];
const BADGE: Record<string, BadgeTone> = { warning: 'warning', success: 'success', destructive: 'destructive', default: 'primary' };

/** The website's /corporate/approvals: approve or reject employee trip requests against the travel policy, then book them. */
export default function CorporateApprovalsScreen() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [status, setStatus] = useState('pending');
  const requests = useQuery({ queryKey: ['corp-requests', status], queryFn: () => corporateApi.requests(status || undefined) });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['corp-requests'] });
    void qc.invalidateQueries({ queryKey: ['corp-dashboard'] });
  };
  const decide = useMutation({
    mutationFn: ({ id, d, note }: { id: string; d: 'approved' | 'rejected'; note?: string }) => corporateApi.decide(id, d, note),
    onSuccess: invalidate,
  });
  const book = useMutation({ mutationFn: (id: string) => corporateApi.book(id), onSuccess: invalidate });

  const rule = async (r: TripRequest, d: 'approved' | 'rejected') => {
    const approving = d === 'approved';
    const flagged = r.policyFlags.length > 0;
    const cost = formatMoney({ amount: r.estimatedTotal, currency: r.currency });
    const { ok, reason } = await confirm({
      title: approving ? `Approve this trip for ${r.employeeEmail}?` : 'Reject this trip request?',
      description: approving
        ? `Estimated cost ${cost}, billed to the company.${flagged ? ` This request breaches your travel policy (${r.policyFlags.join(', ').replace(/_/g, ' ')}).` : ''}`
        : `${r.employeeEmail} will be told the request was rejected, along with your note.`,
      confirmLabel: approving ? 'Approve trip' : 'Reject request',
      tone: approving && !flagged ? 'default' : 'destructive',
      reason: { label: 'Note to the employee', placeholder: approving ? 'e.g. Approved - keep receipts' : 'e.g. Over budget for this quarter', required: !approving },
    });
    if (ok) decide.mutate({ id: r._id, d, note: reason || undefined });
  };
  const bookTrip = async (r: TripRequest) => {
    const { ok } = await confirm({
      title: 'Book this trip now?',
      description: `This creates a real booking and charges the company ${formatMoney({ amount: r.estimatedTotal, currency: r.currency })}.`,
      confirmLabel: 'Book trip',
    });
    if (ok) book.mutate(r._id);
  };

  return (
    <Screen header={<ScreenHeader large title="Trip approvals" />} onRefresh={() => void requests.refetch()} refreshing={requests.isRefetching}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {STATUSES.map((s) => <Chip key={s || 'all'} label={s ? s[0].toUpperCase() + s.slice(1) : 'All'} selected={status === s} onPress={() => setStatus(s)} />)}
      </ScrollView>
      {requests.isPending ? <SkeletonList rows={3} height={110} /> : null}
      {requests.data && requests.data.length === 0 ? <EmptyState title="No requests" body="Employee trip requests appear here." /> : null}
      {requests.data?.map((r) => (
        <Card key={r._id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{r.employeeEmail}</Text>
            <Badge label={r.status} tone={BADGE[REQUEST_TONE[r.status]]} />
          </View>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>{formatDateRange(r.start, r.end)} · {formatMoney({ amount: r.estimatedTotal, currency: r.currency })}</Text>
          {r.reason ? <Text variant="caption" style={{ marginTop: 4, fontStyle: 'italic' }}>“{r.reason}”</Text> : null}
          {r.policyFlags.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm }}>
              {r.policyFlags.map((f) => <Badge key={f} label={f.replace(/_/g, ' ')} tone="destructive" />)}
            </View>
          ) : null}
          {r.status === 'pending' ? (
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
              <View style={{ flex: 1 }}>
                <Button title="Approve" size="sm" loading={decide.isPending && decide.variables?.id === r._id && decide.variables.d === 'approved'} disabled={decide.isPending} onPress={() => void rule(r, 'approved')} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Reject" size="sm" variant="outline" loading={decide.isPending && decide.variables?.id === r._id && decide.variables.d === 'rejected'} disabled={decide.isPending} onPress={() => void rule(r, 'rejected')} />
              </View>
            </View>
          ) : null}
          {r.status === 'approved' ? <Button title="Book trip" size="sm" loading={book.isPending && book.variables === r._id} style={{ marginTop: space.md }} onPress={() => void bookTrip(r)} /> : null}
          {r.status === 'booked' ? <Text variant="caption" tone="success" style={{ marginTop: space.sm }}>Booked ✓</Text> : null}
        </Card>
      ))}
    </Screen>
  );
}
