import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, CreditCard, Sparkles } from 'lucide-react-native';
import { Badge, Button, Card, EmptyState, Screen, ScreenHeader, SkeletonList, Text, useConfirm, useTheme, useToast, space } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { describeBenefits, subscriptionApi, type Plan } from '@catodrive/core/web/features/subscriptions/api';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatDate } from '@catodrive/core/web/lib/utils/format';
import { ProgramGate } from '@/features/account/ProgramGate';

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

function PlanCard({ plan, current, disabled, busy, onSubscribe }: { plan: Plan; current: boolean; disabled: boolean; busy: boolean; onSubscribe: () => void }) {
  const { c } = useTheme();
  const benefits = describeBenefits(plan.benefits);
  const free = plan.priceCents === 0;
  return (
    <Card style={current ? { borderColor: c.success, borderWidth: 2 } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text variant="heading" style={{ flex: 1 }}>{plan.name}</Text>
        {current ? <Badge label="Current" tone="success" /> : null}
      </View>
      <Text variant="title">{free ? 'Free' : `${money(plan.priceCents)}/mo`}</Text>
      {plan.description ? <Text variant="caption" tone="muted">{plan.description}</Text> : null}
      <View style={{ gap: 6, marginVertical: space.md }}>
        {benefits.length ? benefits.map((b) => (
          <View key={b} style={{ flexDirection: 'row', gap: space.sm }}>
            <Check size={16} color={c.success} />
            <Text style={{ flex: 1 }}>{b}</Text>
          </View>
        )) : <Text tone="muted">Standard pricing.</Text>}
      </View>
      <Button
        title={current ? 'Your plan' : disabled ? 'Cancel your plan first' : free ? 'Included' : `Join for ${money(plan.priceCents)}/mo`}
        variant={current ? 'outline' : 'primary'}
        disabled={disabled || current || free}
        loading={busy}
        onPress={onSubscribe}
      />
    </Card>
  );
}

/** The website's /membership: plans, joining, your savings, cancelling. */
function Membership() {
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => subscriptionApi.plans() });
  const mine = useQuery({ queryKey: ['my-subscription'], queryFn: () => subscriptionApi.mine(), retry: false });
  const active = mine.data && mine.data.status === 'active' ? mine.data : null;
  const savings = useQuery({ queryKey: ['my-savings'], queryFn: () => subscriptionApi.savings(), enabled: !!active, retry: false });
  const subscribe = useMutation({
    meta: { silentError: true },
    mutationFn: (code: string) => subscriptionApi.subscribe(code),
    onSuccess: () => {
      toast({ tone: 'success', title: 'You are a member', body: 'Your benefits apply from your next booking.' });
      void qc.invalidateQueries({ queryKey: ['my-subscription'] });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not start your membership' }),
  });
  const cancel = useMutation({
    meta: { silentError: true },
    mutationFn: () => subscriptionApi.cancel(),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Membership cancelled' });
      void qc.invalidateQueries({ queryKey: ['my-subscription'] });
    },
    onError: () => toast({ tone: 'error', title: 'Could not cancel' }),
  });
  const list = (plans.data ?? []).filter((p) => p.active).sort((a, b) => a.priceCents - b.priceCents);

  return (
    <Screen header={<ScreenHeader title="Membership" subtitle="Pay monthly, drive cheaper." onBack={() => router.back()} />}>
      <Text tone="muted">Benefits apply automatically at checkout - there is no code to remember.</Text>
      {active ? (
        <Card style={{ borderColor: c.warning }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Sparkles size={18} color={c.warning} />
            <Text variant="heading">{list.find((p) => p.code === active.planCode)?.name ?? active.planCode}</Text>
          </View>
          <Text tone="muted" style={{ marginTop: space.sm }}>
            {savings.data && savings.data.totalCents > 0 ? `You have saved ${money(savings.data.totalCents)} across ${savings.data.trips} ${savings.data.trips === 1 ? 'trip' : 'trips'}.` : 'Your perks apply to every car you book, automatically.'}
          </Text>
          <View style={{ gap: 6, marginVertical: space.md }}>
            {describeBenefits(active.benefitsSnapshot).map((b) => (
              <View key={b} style={{ flexDirection: 'row', gap: space.sm }}>
                <Check size={16} color={c.success} />
                <Text style={{ flex: 1 }}>{b}</Text>
              </View>
            ))}
          </View>
          <Text variant="caption" tone="muted">{money(active.pricePaidCents)}/month · renews {formatDate(active.renewsAt)}</Text>
          <Button
            title="Cancel"
            variant="outline"
            loading={cancel.isPending}
            style={{ marginTop: space.md }}
            onPress={async () => {
              const { ok } = await confirm({ title: 'Cancel your membership?', description: 'You keep every benefit until the end of the period you have already paid for.', confirmLabel: 'Cancel membership', tone: 'destructive' });
              if (ok) cancel.mutate();
            }}
          />
        </Card>
      ) : null}
      {mine.data?.status === 'cancelled' ? (
        <Card>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <AlertTriangle size={18} color={c.warning} />
            <Text style={{ flex: 1 }}>Your membership is cancelled but stays active until {formatDate(mine.data.renewsAt)} - you already paid for it.</Text>
          </View>
        </Card>
      ) : null}
      {plans.isPending ? (
        <SkeletonList rows={2} height={220} />
      ) : list.length === 0 ? (
        <EmptyState title="No plans available" body="Memberships are not open yet. Check back soon." />
      ) : (
        list.map((p) => <PlanCard key={p.code} plan={p} current={active?.planCode === p.code} disabled={!!active} busy={subscribe.isPending} onSubscribe={() => subscribe.mutate(p.code)} />)
      )}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <CreditCard size={16} color={c.mutedForeground} />
        <Text variant="caption" tone="muted" style={{ flex: 1 }}>Charged monthly to your saved card. Cancel any time - you keep your benefits until the period you have paid for ends, and nothing is charged after that.</Text>
      </View>
    </Screen>
  );
}

export default function MembershipScreen() {
  return (
    <RequireAuth>
      <ProgramGate program="membership" name="Membership">
        <Membership />
      </ProgramGate>
    </RequireAuth>
  );
}
