import { View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Banknote, CheckCircle2, ExternalLink } from 'lucide-react-native';
import { Badge, Button, Card, Skeleton, Text, space, useTheme, useToast } from '@catodrive/ui';
import { openInAppBrowser } from '@catodrive/core';
import { connectApi, humaniseRequirement } from '@catodrive/core/web/features/host/payouts';

/** Connecting a bank account through Stripe's hosted onboarding; status is re-read when the host comes back. */
export function PayoutConnect() {
  const { c } = useTheme();
  const toast = useToast();
  const status = useQuery({ queryKey: ['connect-status'], queryFn: () => connectApi.status(), retry: false });
  const onboard = useMutation({
    meta: { silentError: true },
    mutationFn: () => connectApi.onboard('/host/earnings'),
    onSuccess: async (r) => {
      await openInAppBrowser(r.url);
      void status.refetch();
    },
    onError: (e) => toast({ tone: 'error', title: 'Could not start payout setup', body: e instanceof Error ? e.message : undefined }),
  });
  const dashboard = useMutation({
    meta: { silentError: true },
    mutationFn: () => connectApi.dashboard(),
    onSuccess: (r) => void openInAppBrowser(r.url),
    onError: () => toast({ tone: 'error', title: 'Could not open your Stripe dashboard' }),
  });

  if (status.isPending) return <Skeleton height={80} />;
  if (status.isError || !status.data) return null;
  const s = status.data;

  if (s.connected && s.payoutsEnabled && !s.needsOnboarding) {
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <CheckCircle2 size={18} color={c.success} />
          <Text variant="caption" style={{ flex: 1 }}>
            <Text variant="caption" style={{ fontWeight: '600' }}>Payouts are set up.</Text> Your earnings go to your bank automatically.
          </Text>
          <Button title="Manage" size="sm" variant="outline" full={false} icon={<ExternalLink size={14} color={c.foreground} />} loading={dashboard.isPending} onPress={() => dashboard.mutate()} />
        </View>
      </Card>
    );
  }

  const started = s.connected && s.requirementsDue.length > 0;
  return (
    <Card style={{ borderColor: c.warning }}>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
        {started ? <AlertTriangle size={20} color={c.warning} /> : <Banknote size={20} color={c.primary} />}
        <View style={{ flex: 1, gap: space.sm }}>
          <Text variant="label">{started ? 'Finish setting up payouts' : 'Set up payouts'}</Text>
          <Badge label="Required to get paid" tone="warning" />
          <Text variant="caption" tone="muted">
            {started
              ? 'Stripe still needs a few details before money can reach your bank.'
              : 'Your earnings are being tracked, but nothing can reach your bank until you connect an account. Stripe handles this - your bank details never pass through us.'}
          </Text>
          {s.requirementsDue.length > 0 ? (
            <View style={{ gap: 4 }}>
              {s.requirementsDue.slice(0, 5).map((r) => <Text key={r} variant="caption">• {humaniseRequirement(r)}</Text>)}
              {s.requirementsDue.length > 5 ? <Text variant="caption" tone="muted">…and {s.requirementsDue.length - 5} more</Text> : null}
            </View>
          ) : null}
          <Button title={started ? 'Continue on Stripe' : 'Connect a bank account'} icon={<ExternalLink size={16} color={c.primaryForeground} />} loading={onboard.isPending} onPress={() => onboard.mutate()} />
          <Text variant="caption" tone="muted">Takes about five minutes. You will need your bank details and a photo of your ID.</Text>
        </View>
      </View>
    </Card>
  );
}
