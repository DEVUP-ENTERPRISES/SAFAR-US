import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Check, Clock, ShieldAlert, XCircle } from 'lucide-react-native';
import { Badge, Card, ErrorState, KeyValue, Screen, ScreenHeader, Section, Skeleton, Text, useTheme, radius, space } from '@catodrive/ui';
import { RequireAuth, SecureImage } from '@catodrive/core';
import { claimsApi } from '@catodrive/core/web/features/claims/api';
import { CLAIM_DETAIL_TONE, CLAIM_STATUS_COPY } from '@catodrive/core/web/features/claims/status';
import { formatDate, formatMoney } from '@catodrive/core/web/lib/utils/format';
import { claimBadge } from '@/features/claims/claimTone';

/** The website's /claims/[id]: what was claimed, the evidence and every step of the review. */
function ClaimDetail({ id }: { id: string }) {
  const { c } = useTheme();
  const router = useRouter();
  const { data: x, isPending, isError, refetch, isRefetching } = useQuery({ queryKey: ['claim', id], queryFn: () => claimsApi.get(id) });
  const header = <ScreenHeader title="All claims" onBack={() => (router.canGoBack() ? router.back() : router.replace('/claims'))} />;
  if (isPending) return <Screen header={header}><Skeleton height={200} /></Screen>;
  if (isError || !x) return <Screen header={header}><ErrorState message="Claim not found." /></Screen>;
  const photos = x.evidence.filter((e) => e.kind === 'image');

  return (
    <Screen header={header} onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
          <ShieldAlert size={20} color={c.primary} />
          <View style={{ flex: 1 }}>
            <Text variant="title" style={{ textTransform: 'capitalize' }}>{x.type} claim</Text>
            <Text variant="caption" tone="muted">Filed {formatDate(x.createdAt)}</Text>
          </View>
          <Badge label={x.status} tone={claimBadge(CLAIM_DETAIL_TONE[x.status])} />
        </View>
        <Text tone="muted" style={{ marginTop: space.sm }}>{CLAIM_STATUS_COPY[x.status] ?? ''}</Text>
        <Text variant="label" style={{ marginTop: space.md }}>Details</Text>
        <Text>{x.description}</Text>
        {typeof x.amountClaimed === 'number' && x.amountClaimed > 0 ? <View style={{ marginTop: space.md }}><KeyValue label="Amount claimed" value={formatMoney({ amount: x.amountClaimed, currency: 'USD' })} strong /></View> : null}
        {photos.length ? (
          <View style={{ marginTop: space.md, gap: space.sm }}>
            <Text variant="label">Evidence ({photos.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {photos.map((e, i) => <SecureImage key={i} url={e.url} style={{ width: 140, height: 100, borderRadius: radius.md }} />)}
            </ScrollView>
          </View>
        ) : null}
      </Card>

      <Section title="Progress">
        {(x.timeline ?? []).map((t, i) => {
          const last = i === (x.timeline?.length ?? 0) - 1;
          const Icon = t.status === 'rejected' ? XCircle : ['approved', 'settled', 'closed'].includes(t.status) ? Check : Clock;
          return (
            <View key={i} style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ alignItems: 'center', width: 28 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primarySoft }}>
                  <Icon size={14} color={c.primary} />
                </View>
                {!last ? <View style={{ width: 2, flex: 1, minHeight: 16, backgroundColor: c.border }} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: space.md }}>
                <Text variant="label" style={{ textTransform: 'capitalize' }}>{t.status.replace(/_/g, ' ')}</Text>
                {t.note ? <Text variant="caption">{t.note}</Text> : null}
                <Text variant="caption" tone="muted">{formatDate(t.at)}</Text>
              </View>
            </View>
          );
        })}
      </Section>
    </Screen>
  );
}

export default function ClaimScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireAuth>
      <ClaimDetail id={id} />
    </RequireAuth>
  );
}
