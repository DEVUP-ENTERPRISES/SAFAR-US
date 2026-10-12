import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldAlert } from 'lucide-react-native';
import { Badge, Button, Card, Chip, EmptyState, Input, Screen, ScreenHeader, SkeletonList, Text, useTheme, space } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { claimsApi } from '@catodrive/core/web/features/claims/api';
import { CLAIM_LIST_TONE } from '@catodrive/core/web/features/claims/status';
import { formatDate } from '@catodrive/core/web/lib/utils/format';
import { claimBadge } from '@/features/claims/claimTone';

type ClaimType = 'damage' | 'insurance' | 'dispute';
const TYPES: { key: ClaimType; label: string }[] = [
  { key: 'damage', label: 'Damage' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'dispute', label: 'Dispute' },
];

/** The website's /claims: file a claim and follow every claim's status. */
function Claims() {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: 'damage' as ClaimType, description: '', bookingId: '' });
  const list = useQuery({ queryKey: ['my-claims'], queryFn: () => claimsApi.list() });
  const create = useMutation({
    mutationFn: () => claimsApi.create({ type: form.type, description: form.description, bookingId: form.bookingId || undefined }),
    onSuccess: () => {
      setOpen(false);
      setForm({ type: 'damage', description: '', bookingId: '' });
      void qc.invalidateQueries({ queryKey: ['my-claims'] });
    },
  });

  return (
    <Screen
      header={<ScreenHeader title="Claims" onBack={() => router.back()} right={<Button title="File a claim" size="sm" full={false} icon={<Plus size={16} color={c.primaryForeground} />} onPress={() => setOpen((v) => !v)} />} />}
      onRefresh={() => void list.refetch()}
      refreshing={list.isRefetching}
    >
      {open ? (
        <Card>
          <Text variant="heading">New claim</Text>
          <View style={{ gap: space.md, marginTop: space.md }}>
            <Text variant="label">Type</Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {TYPES.map((t) => <Chip key={t.key} label={t.label} selected={form.type === t.key} onPress={() => setForm({ ...form, type: t.key })} />)}
            </View>
            <Input label="Booking ID (optional)" value={form.bookingId} onChangeText={(t) => setForm({ ...form, bookingId: t })} autoCapitalize="none" />
            <Input label="Description" value={form.description} onChangeText={(t) => setForm({ ...form, description: t })} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
            <Button title="Submit claim" disabled={form.description.length < 5} loading={create.isPending} onPress={() => create.mutate()} />
          </View>
        </Card>
      ) : null}
      {list.isPending ? <SkeletonList rows={3} height={90} /> : null}
      {list.data && list.data.length === 0 ? <EmptyState icon={<ShieldAlert size={28} color={c.primary} />} title="No claims" body="Filed claims appear here with live status." /> : null}
      {list.data?.map((x) => (
        <Card key={x._id} onPress={() => router.push(`/claims/${x._id}`)}>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" style={{ textTransform: 'capitalize' }}>{x.type} claim</Text>
              <Text variant="caption" tone="muted" numberOfLines={2}>{x.description}</Text>
              <Text variant="caption" tone="muted">Filed {formatDate(x.createdAt)}</Text>
            </View>
            <Badge label={x.status} tone={claimBadge(CLAIM_LIST_TONE[x.status])} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

export default function ClaimsScreen() {
  return (
    <RequireAuth>
      <Claims />
    </RequireAuth>
  );
}
