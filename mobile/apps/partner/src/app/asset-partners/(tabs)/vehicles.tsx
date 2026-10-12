import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Car } from 'lucide-react-native';
import { Button, Card, EmptyState, ErrorState, Screen, ScreenHeader, SkeletonList, StatTile, space, useTheme } from '@catodrive/ui';
import { openInAppBrowser, webUrl } from '@catodrive/core';
import { assetPartnerApi } from '@catodrive/core/web/features/asset-partners/api';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';
import { NotAPartner } from '@/features/asset-partners/NotAPartner';
import { PartnerVehicleCard } from '@/features/asset-partners/PartnerVehicleCard';
import { isNotEnrolled } from '@/features/asset-partners/notEnrolled';

const currency = 'USD';

/** The website's /asset-partners/vehicles: every car in the programme and what each earned this month. */
export default function PartnerVehiclesScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: ['asset-partner-vehicles'], queryFn: () => assetPartnerApi.vehicles(), retry: false });
  const data = q.data;
  const totals = (data ?? []).reduce((acc, v) => ({ net: acc.net + v.net, gross: acc.gross + v.gross, trips: acc.trips + v.trips }), { net: 0, gross: 0, trips: 0 });
  const live = (data ?? []).filter((v) => v.status === 'listed').length;

  return (
    <Screen
      header={<ScreenHeader large title="Your vehicles" subtitle="Every car in the programme, and what each earned this month." />}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      {q.isPending ? <SkeletonList rows={3} height={220} /> : null}
      {q.isError && isNotEnrolled(q.error) ? <NotAPartner /> : null}
      {q.isError && !isNotEnrolled(q.error) && !data ? <ErrorState message="We couldn’t load your vehicles." onRetry={() => void q.refetch()} /> : null}
      {data && data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Car size={28} color={c.primary} />}
            title="No vehicles yet"
            body="Once onboarding and the inspection are done, your car goes live here and starts earning. We’ll call you to arrange it."
            actionLabel="Check your application status"
            onAction={() => router.navigate('/asset-partners/dashboard')}
          />
        </Card>
      ) : null}
      {data && data.length > 0 ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            <StatTile label="Vehicles" value={String(data.length)} sub={`${live} live`} />
            <StatTile label="Net this month" value={formatMoney({ amount: totals.net, currency })} sub="After fee, insurance, detailing" tone={totals.net >= 0 ? 'success' : 'warning'} />
            <StatTile label="Gross this month" value={formatMoney({ amount: totals.gross, currency })} />
            <StatTile label="Trips this month" value={String(totals.trips)} />
          </View>
          {data.map((v) => <PartnerVehicleCard key={v._id} vehicle={v} currency={currency} />)}
        </>
      ) : null}
      {data ? <Button title="Add another vehicle" variant="outline" onPress={() => void openInAppBrowser(webUrl('/asset-partners/apply'))} /> : null}
    </Screen>
  );
}
