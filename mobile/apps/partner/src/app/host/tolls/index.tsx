import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react-native';
import { Badge, Button, Card, EmptyState, Screen, ScreenHeader, SkeletonList, Text, space, useTheme } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { TOLL_STATUS, agencyLabel, hostTollsApi } from '@catodrive/core/web/features/host/tolls-api';

/** The website's /host/tolls: linked toll accounts, so each trip's tolls are billed to the guest who drove. */
function TollAccounts() {
  const { c } = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: ['host-toll-accounts'], queryFn: () => hostTollsApi.accounts() });
  return (
    <Screen
      header={<ScreenHeader title="Toll accounts" onBack={() => (router.canGoBack() ? router.back() : router.replace('/host/menu'))} />}
      footer={<Button title={q.data?.length ? 'Link another toll account' : 'Link a toll account'} onPress={() => router.push('/host/tolls/new')} />}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      <Text tone="muted">Link your toll accounts so tolls from each trip are matched to the guest who was driving and charged to them.</Text>
      {q.isPending ? <SkeletonList rows={2} height={80} /> : null}
      {q.data && q.data.length === 0 ? <EmptyState title="No toll accounts linked" body="Link your NTTA account to start billing guests for their tolls." /> : null}
      {q.data?.map((a) => (
        <Card key={a._id} onPress={() => router.push(`/host/tolls/${a._id}`)} accessibilityLabel={`${agencyLabel(a.agency)}, ${a.nickname}, ${TOLL_STATUS[a.status].label}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Badge label={TOLL_STATUS[a.status].label} tone={TOLL_STATUS[a.status].tone} />
              <Text variant="label">{agencyLabel(a.agency)}</Text>
              <Text variant="caption" tone="muted">{a.nickname}</Text>
            </View>
            <ChevronRight size={18} color={c.mutedForeground} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

export default function TollAccountsScreen() {
  return (
    <RequireAuth>
      <TollAccounts />
    </RequireAuth>
  );
}
