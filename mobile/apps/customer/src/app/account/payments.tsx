import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Trash2 } from 'lucide-react-native';
import { Badge, Button, Card, EmptyState, Screen, ScreenHeader, Skeleton, Text, useConfirm, useTheme, useToast, space } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { accountApi } from '@catodrive/core/web/features/account/api';
import { usePayments } from '@/features/payments/usePayments';

function Payments() {
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const payments = usePayments();
  const cards = useQuery({ queryKey: ['payment-methods'], queryFn: () => accountApi.paymentMethods() });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['payment-methods'] });
  const remove = useMutation({ mutationFn: (id: string) => accountApi.removePaymentMethod(id), onSuccess: refresh });
  const setDefault = useMutation({ mutationFn: (id: string) => accountApi.setDefaultPaymentMethod(id), onSuccess: refresh });
  const add = useMutation({
    meta: { silentError: true },
    mutationFn: () => payments.saveCard(),
    onSuccess: (r) => {
      if (r.ok) {
        toast({ tone: 'success', title: 'Card saved' });
        refresh();
      } else if (!r.cancelled) toast({ tone: 'error', title: r.message ?? 'That card could not be saved' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof Error ? e.message : 'Could not save that card' }),
  });

  return (
    <Screen
      header={<ScreenHeader title="Payment methods" onBack={() => router.back()} />}
      footer={<Button title="Add a card" icon={<CreditCard size={18} color={c.primaryForeground} />} loading={add.isPending} disabled={!payments.available} onPress={() => add.mutate()} />}
    >
      {!payments.available ? <Text variant="caption" tone="muted">Saving a card isn’t available right now. Please try again in a little while.</Text> : null}
      {cards.isPending ? <Skeleton height={80} /> : null}
      {cards.data && cards.data.length === 0 ? <EmptyState icon={<CreditCard size={28} color={c.primary} />} title="No cards saved" body="Add a card to book in one tap." /> : null}
      {cards.data?.map((card) => (
        <Card key={card._id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <CreditCard size={22} color={c.mutedForeground} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Text variant="label" style={{ textTransform: 'capitalize' }}>{card.brand} •••• {card.last4}</Text>
                {card.isDefault ? <Badge label="Default" tone="success" /> : null}
              </View>
              <Text variant="caption" tone="muted">Expires {card.expMonth}/{card.expYear}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove card ending ${card.last4}`}
              hitSlop={8}
              onPress={async () => {
                const { ok } = await confirm({ title: `Remove card ending ${card.last4}?`, description: 'You will need to re-add it to pay with this card again.', confirmLabel: 'Remove card', tone: 'destructive' });
                if (ok) remove.mutate(card._id);
              }}
            >
              <Trash2 size={20} color={c.mutedForeground} />
            </Pressable>
          </View>
          {!card.isDefault ? <Button title="Set default" size="sm" variant="outline" full={false} style={{ marginTop: space.md }} onPress={() => setDefault.mutate(card._id)} /> : null}
        </Card>
      ))}
    </Screen>
  );
}

export default function PaymentsScreen() {
  return (
    <RequireAuth>
      <Payments />
    </RequireAuth>
  );
}
