import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, Input, Screen, ScreenHeader, SkeletonList, Text, space } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { corporateApi } from '@catodrive/core/web/features/corporate/api';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';

/** The website's /corporate/cost-centers: budget buckets for team spend. */
function CostCenters() {
  const router = useRouter();
  const qc = useQueryClient();
  const centers = useQuery({ queryKey: ['corp-cc'], queryFn: () => corporateApi.costCenters() });
  const [form, setForm] = useState({ name: '', code: '', budget: '' });
  const create = useMutation({
    mutationFn: () => corporateApi.createCostCenter(form.name, form.code, Math.round((Number(form.budget) || 0) * 100)),
    onSuccess: () => {
      setForm({ name: '', code: '', budget: '' });
      void qc.invalidateQueries({ queryKey: ['corp-cc'] });
    },
  });
  return (
    <Screen header={<ScreenHeader title="Cost centers" onBack={() => (router.canGoBack() ? router.back() : router.replace('/corporate/menu'))} />} onRefresh={() => void centers.refetch()} refreshing={centers.isRefetching}>
      <Card>
        <Text variant="heading">New cost center</Text>
        <View style={{ gap: space.md, marginTop: space.md }}>
          <Input label="Name" value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} placeholder="Sales team" />
          <Input label="Code" value={form.code} onChangeText={(t) => setForm({ ...form, code: t })} placeholder="SALES" autoCapitalize="characters" />
          <Input label="Budget ($)" keyboardType="decimal-pad" value={form.budget} onChangeText={(t) => setForm({ ...form, budget: t })} />
          <Button title="Create" disabled={!form.name || !form.code} loading={create.isPending} onPress={() => create.mutate()} />
        </View>
      </Card>
      {centers.isPending ? <SkeletonList rows={2} height={72} /> : null}
      {centers.data && centers.data.length === 0 ? <EmptyState title="No cost centers yet" body="Create budget buckets to track team spend." /> : null}
      {centers.data?.map((x) => (
        <Card key={x._id}>
          <Text variant="label">{x.name}</Text>
          <Text variant="caption" tone="muted">{x.code}</Text>
          <Text variant="heading" style={{ marginTop: 4 }}>
            {formatMoney({ amount: x.budget, currency: x.currency })}
            <Text variant="caption" tone="muted"> budget</Text>
          </Text>
        </Card>
      ))}
    </Screen>
  );
}

export default function CostCentersScreen() {
  return (
    <RequireAuth>
      <CostCenters />
    </RequireAuth>
  );
}
