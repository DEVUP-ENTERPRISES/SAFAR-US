import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Plus, Wallet as WalletIcon } from 'lucide-react-native';
import { Button, Card, Chip, Divider, Input, Screen, ScreenHeader, Section, Skeleton, Text, useTheme, useToast, radius, space } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { walletApi } from '@catodrive/core/web/features/wallet/api';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatDate, formatMoney } from '@catodrive/core/web/lib/utils/format';
import { usePayments } from '@/features/payments/usePayments';

const PRESETS = [2500, 5000, 10000, 20000];

/** The website's /wallet: balance, top-up from the saved card, and every movement. */
function Wallet() {
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const payments = usePayments();
  const balance = useQuery({ queryKey: ['wallet', 'balance'], queryFn: () => walletApi.balance() });
  const tx = useQuery({ queryKey: ['wallet', 'transactions'], queryFn: () => walletApi.transactions() });
  const [amount, setAmount] = useState(5000);
  const topup = useMutation({
    meta: { silentError: true },
    mutationFn: () => walletApi.topup(amount),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wallet', 'balance'] });
      void qc.invalidateQueries({ queryKey: ['wallet', 'transactions'] });
      toast({ tone: 'success', title: 'Added to your wallet ✓' });
    },
  });
  const needsCard = topup.error instanceof ApiError && topup.error.code === 'PAYMENT_METHOD_REQUIRED';

  const header = <ScreenHeader title="CatoDrive Wallet" onBack={() => router.back()} />;
  if (balance.isPending || !balance.data) return <Screen header={header}><Skeleton height={140} /></Screen>;

  return (
    <Screen header={header} onRefresh={() => void Promise.all([balance.refetch(), tx.refetch()])} refreshing={balance.isRefetching}>
      <View style={{ backgroundColor: c.ink, borderRadius: radius.xl + 6, padding: space.xl, gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <WalletIcon size={16} color={c.inkForeground} />
          <Text variant="caption" style={{ color: c.inkForeground, opacity: 0.8 }}>Available balance</Text>
        </View>
        <Text variant="display" style={{ color: c.inkForeground }}>{formatMoney({ amount: balance.data.balance, currency: balance.data.currency })}</Text>
        <Text variant="caption" style={{ color: c.inkForeground, opacity: 0.7 }}>Pay instantly at checkout - no card needed.</Text>
      </View>

      <Section title="Add money">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {PRESETS.map((p) => (
            <Chip key={p} label={formatMoney({ amount: p, currency: 'USD' })} selected={amount === p} onPress={() => setAmount(p)} />
          ))}
        </View>
        <Input label="Custom amount (USD)" keyboardType="number-pad" value={String(Math.round(amount / 100))} onChangeText={(t) => setAmount(Math.round(Number(t.replace(/\D/g, '') || 0) * 100))} />
        <Button title={`Add ${formatMoney({ amount, currency: 'USD' })}`} icon={<Plus size={18} color={c.primaryForeground} />} disabled={amount < 100} loading={topup.isPending} onPress={() => topup.mutate()} />
        {topup.isError ? (
          needsCard ? (
            <Card>
              <Text tone="destructive">{(topup.error as ApiError).message}</Text>
              <Button
                title="Add a card"
                variant="outline"
                style={{ marginTop: space.md }}
                onPress={async () => {
                  const r = await payments.saveCard();
                  if (r.ok) topup.reset();
                  else if (!r.cancelled) toast({ tone: 'error', title: r.message ?? 'That card could not be saved' });
                }}
              />
            </Card>
          ) : (
            <Text variant="caption" tone="destructive">{topup.error instanceof ApiError ? topup.error.message : 'Top-up failed. Please try again.'}</Text>
          )
        ) : null}
      </Section>

      <Section title="Transactions">
        {tx.isPending ? <Skeleton height={120} /> : null}
        {tx.data && tx.data.length === 0 ? <Text tone="muted">No transactions yet. Add money to get started.</Text> : null}
        {tx.data?.length ? (
          <Card>
            {tx.data.map((t, i) => {
              const credit = t.direction === 'credit';
              return (
                <View key={t._id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
                    {credit ? <ArrowDownLeft size={18} color={c.success} /> : <ArrowUpRight size={18} color={c.mutedForeground} />}
                    <View style={{ flex: 1 }}>
                      <Text variant="label">{t.description}</Text>
                      <Text variant="caption" tone="muted" style={{ textTransform: 'capitalize' }}>{t.refType.replace(/_/g, ' ')} · {formatDate(t.postedAt)}</Text>
                    </View>
                    <Text variant="label" tone={credit ? 'success' : 'default'}>{credit ? '+' : '−'}{formatMoney({ amount: t.amount, currency: t.currency })}</Text>
                  </View>
                </View>
              );
            })}
          </Card>
        ) : null}
      </Section>
    </Screen>
  );
}

export default function WalletScreen() {
  return (
    <RequireAuth>
      <Wallet />
    </RequireAuth>
  );
}
