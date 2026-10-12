import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, Screen, ScreenHeader, Skeleton, Text, space } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { corporateApi, policyForm, policyPatch, type PolicyForm } from '@catodrive/core/web/features/corporate/api';

const num = (t: string) => Number(t.replace(/[^\d.]/g, '')) || 0;

/** The website's /corporate/policy: price cap, allowed categories and the approval thresholds. */
function Policy() {
  const router = useRouter();
  const qc = useQueryClient();
  const policy = useQuery({ queryKey: ['corp-policy'], queryFn: () => corporateApi.policy() });
  const [form, setForm] = useState<PolicyForm>({ maxDailyPrice: 0, allowedCategories: '', autoApproveUnder: 0, requireApprovalOver: 0 });
  useEffect(() => {
    if (policy.data) setForm(policyForm(policy.data));
  }, [policy.data]);
  const save = useMutation({ mutationFn: () => corporateApi.setPolicy(policyPatch(form)), onSuccess: () => void qc.invalidateQueries({ queryKey: ['corp-policy'] }) });

  return (
    <Screen
      header={<ScreenHeader title="Travel policy" onBack={() => (router.canGoBack() ? router.back() : router.replace('/corporate/menu'))} />}
      footer={<Button title={save.isSuccess ? 'Saved ✓' : 'Save policy'} loading={save.isPending} disabled={!policy.data} onPress={() => save.mutate()} />}
    >
      {policy.isPending ? <Skeleton height={300} /> : (
        <Card>
          <Text variant="heading">Rules</Text>
          <View style={{ gap: space.md, marginTop: space.md }}>
            <Input label="Max daily price ($, 0 = no cap)" keyboardType="decimal-pad" value={String(form.maxDailyPrice)} onChangeText={(t) => setForm({ ...form, maxDailyPrice: num(t) })} />
            <Input label="Allowed categories (comma, blank = all)" value={form.allowedCategories} onChangeText={(t) => setForm({ ...form, allowedCategories: t })} placeholder="economy, suv" autoCapitalize="none" />
            <Input label="Auto-approve under ($)" hint="Trips at/under this total auto-approve" keyboardType="decimal-pad" value={String(form.autoApproveUnder)} onChangeText={(t) => setForm({ ...form, autoApproveUnder: num(t) })} />
            <Input label="Always require approval over ($)" keyboardType="decimal-pad" value={String(form.requireApprovalOver)} onChangeText={(t) => setForm({ ...form, requireApprovalOver: num(t) })} />
          </View>
        </Card>
      )}
    </Screen>
  );
}

export default function PolicyScreen() {
  return (
    <RequireAuth>
      <Policy />
    </RequireAuth>
  );
}
