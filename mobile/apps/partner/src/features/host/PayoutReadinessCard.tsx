import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, Building2, ChevronRight, Clock } from 'lucide-react-native';
import { Card, Skeleton, Text, space, useTheme } from '@catodrive/ui';
import { hostApi } from '@catodrive/core/web/features/host/api';
import { formatDate } from '@catodrive/core/web/lib/utils/format';
import { useOpenHref } from '@/features/workspace/useOpenHref';

/** Where the money goes and what is stopping it; every blocker opens the screen that clears it. */
export function PayoutReadinessCard() {
  const { c } = useTheme();
  const openHref = useOpenHref();
  const q = useQuery({ queryKey: ['payout-readiness'], queryFn: () => hostApi.payoutReadiness(), retry: false });
  if (q.isPending) return <Skeleton height={96} />;
  if (q.isError || !q.data) return null;
  const d = q.data;
  const blocking = d.blockers.filter((b) => b.severity === 'blocking');
  const warnings = d.blockers.filter((b) => b.severity === 'warning');

  const title = blocking.length > 0 ? 'Payouts are on hold' : d.destination.platformOwned ? 'House Fleet earnings stay with CatoDrive' : d.destination.configured ? 'You’re set up to get paid' : 'Payouts ready';
  const detail =
    blocking.length > 0
      ? 'Your earnings keep accruing - they just can’t be sent yet.'
      : d.destination.platformOwned
        ? 'These trips are our own cars, so no payout account is needed.'
        : d.nextPayoutAt
          ? `Next payout ${formatDate(d.nextPayoutAt)}.`
          : 'Completed trips are paid out after the hold window.';

  return (
    <Card style={blocking.length ? { borderColor: c.destructive } : undefined}>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
        {blocking.length ? <AlertTriangle size={20} color={c.destructive} /> : <BadgeCheck size={20} color={c.success} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{title}</Text>
          <Text variant="caption" tone="muted">{detail}</Text>
        </View>
      </View>
      {d.destination.configured && !d.destination.platformOwned ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm }}>
          <Building2 size={14} color={c.mutedForeground} />
          <Text variant="caption" tone="muted">
            {d.destination.viaStripe ? 'Stripe' : `${d.destination.bankName ?? 'Bank'}${d.destination.last4 ? ` ••${d.destination.last4}` : ''}`}
          </Text>
          {d.destination.verified ? <BadgeCheck size={14} color={c.success} /> : null}
        </View>
      ) : null}
      {[...blocking, ...warnings].map((b) => (
        <Pressable
          key={`${b.key}-${b.severity}`}
          accessibilityRole="button"
          onPress={() => openHref(b.href)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, padding: space.md, borderRadius: 12, backgroundColor: b.severity === 'blocking' ? c.destructiveSoft : c.warningSoft }}
        >
          {b.severity === 'blocking' ? <AlertTriangle size={16} color={c.destructive} /> : <Clock size={16} color={c.warning} />}
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label">{b.label}</Text>
            <Text variant="caption" tone="muted">{b.detail}</Text>
          </View>
          <ChevronRight size={16} color={c.mutedForeground} />
        </Pressable>
      ))}
    </Card>
  );
}
