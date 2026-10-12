import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Gift, Sparkles, TrendingUp } from 'lucide-react-native';
import { Button, Card, Divider, Input, Screen, ScreenHeader, Section, Skeleton, Text, useTheme, useToast, radius, space } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { rewardsApi } from '@catodrive/core/web/features/rewards/api';
import { formatDate, formatMoney } from '@catodrive/core/web/lib/utils/format';
import { ProgramGate } from '@/features/account/ProgramGate';

/** The website's /rewards: tier, balance, perks, redeeming points to wallet credit, and history. */
function Rewards() {
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ['rewards'], queryFn: () => rewardsApi.summary() });
  const [points, setPoints] = useState(100);
  const redeem = useMutation({
    mutationFn: () => rewardsApi.redeem(points),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rewards'] });
      toast({ tone: 'success', title: 'Credited to your wallet ✓' });
    },
  });
  const header = <ScreenHeader title="CatoDrive Rewards" onBack={() => router.back()} />;
  if (isPending || !data) return <Screen header={header}><Skeleton height={180} /></Screen>;
  const pct = data.nextTier ? Math.min(100, Math.round((data.lifetime / data.nextTier.min) * 100)) : 100;

  return (
    <Screen header={header}>
      <View style={{ backgroundColor: c.ink, borderRadius: radius.xl + 6, padding: space.xl, gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Sparkles size={16} color={c.inkForeground} />
          <Text variant="label" style={{ color: c.inkForeground }}>{data.tier.label} member</Text>
        </View>
        <Text variant="display" style={{ color: c.inkForeground }}>{data.balance.toLocaleString()} pts</Text>
        <Text variant="caption" style={{ color: c.inkForeground, opacity: 0.75 }}>≈ {formatMoney({ amount: data.balance * data.pointValueCents, currency: 'USD' })} in credit</Text>
        {data.nextTier ? (
          <View style={{ gap: 6, marginTop: space.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="caption" style={{ color: c.inkForeground }}>{data.lifetime.toLocaleString()} lifetime pts</Text>
              <Text variant="caption" style={{ color: c.inkForeground }}>{data.toNext.toLocaleString()} to {data.nextTier.label}</Text>
            </View>
            <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
              <View style={{ width: `${pct}%`, height: '100%', backgroundColor: c.primary }} />
            </View>
          </View>
        ) : null}
      </View>

      <Section title={`Your ${data.tier.label} perks`} action={<TrendingUp size={18} color={c.primary} />}>
        {data.tier.perks.map((p) => (
          <View key={p} style={{ flexDirection: 'row', gap: space.sm }}>
            <Check size={16} color={c.success} />
            <Text style={{ flex: 1 }}>{p}</Text>
          </View>
        ))}
      </Section>

      <Section title="Redeem points" action={<Gift size={18} color={c.primary} />}>
        <Text variant="caption" tone="muted">100 points = $5 wallet credit. Minimum 100.</Text>
        <Input label="Points to redeem" keyboardType="number-pad" value={String(points)} onChangeText={(t) => setPoints(Number(t.replace(/\D/g, '') || 0))} />
        <Button title={`Redeem ${formatMoney({ amount: points * data.pointValueCents, currency: 'USD' })}`} disabled={points < 100 || points > data.balance} loading={redeem.isPending} onPress={() => redeem.mutate()} />
      </Section>

      <Section title="Points history">
        {data.history.length === 0 ? <Text tone="muted">Take a trip to start earning points.</Text> : null}
        {data.history.length ? (
          <Card>
            {data.history.map((h, i) => (
              <View key={h._id}>
                {i > 0 ? <Divider /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="label">{h.description}</Text>
                    <Text variant="caption" tone="muted">{h.type} · {formatDate(h.createdAt)}</Text>
                  </View>
                  <Text variant="label" tone={h.points >= 0 ? 'success' : 'default'}>{h.points >= 0 ? '+' : ''}{h.points}</Text>
                </View>
              </View>
            ))}
          </Card>
        ) : null}
      </Section>
    </Screen>
  );
}

export default function RewardsScreen() {
  return (
    <RequireAuth>
      <ProgramGate program="rewards" name="Rewards">
        <Rewards />
      </ProgramGate>
    </RequireAuth>
  );
}
