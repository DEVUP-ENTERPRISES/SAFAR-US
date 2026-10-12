import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Car, ChevronRight, FileText, TrendingUp, Wallet, Wrench } from 'lucide-react-native';
import { Badge, BarChart, Button, Card, EmptyState, ErrorState, Screen, ScreenHeader, Section, SkeletonList, StatTile, Text, space, useTheme } from '@catodrive/ui';
import { openInAppBrowser, webUrl } from '@catodrive/core';
import { assetPartnerApi, type PartnerDashboard } from '@catodrive/core/web/features/asset-partners/api';
import { PARTNER_STATUS } from '@catodrive/core/web/features/asset-partners/status';
import { formatDate, formatMoney } from '@catodrive/core/web/lib/utils/format';
import { ApplicationCard } from '@/features/asset-partners/ApplicationCard';
import { PartnerSupport } from '@/features/asset-partners/PartnerSupport';
import { PartnerVehicleCard } from '@/features/asset-partners/PartnerVehicleCard';
import { StatementCard } from '@/features/asset-partners/StatementCard';
import { partnerBadge } from '@/features/asset-partners/tone';

const applyOnWeb = () => void openInAppBrowser(webUrl('/asset-partners/apply'));

/** The website's /asset-partners/dashboard: this month's money, the cars, and where each application stands. */
export default function PartnerDashboardScreen() {
  const dash = useQuery({ queryKey: ['asset-partner-dashboard'], queryFn: () => assetPartnerApi.dashboard() });
  const pending = useQuery({ queryKey: ['asset-partner-maintenance', 'pending'], queryFn: () => assetPartnerApi.maintenance('pending'), retry: false });
  const data = dash.data;
  const isEarning = !!data && data.vehicles.length > 0;
  const hasApplied = !!data && (data.applications.length > 0 || !!data.partner);

  return (
    <Screen
      header={<ScreenHeader large title="Your partner dashboard" subtitle={isEarning ? 'What your vehicles are earning, and when the money reaches you.' : 'Where your application stands, and what happens next.'} />}
      onRefresh={() => {
        void dash.refetch();
        void pending.refetch();
      }}
      refreshing={dash.isRefetching}
    >
      {dash.isPending ? <SkeletonList rows={4} height={110} /> : null}
      {dash.isError && !data ? <ErrorState message="We couldn’t load your partner dashboard." onRetry={() => void dash.refetch()} /> : null}
      {data && !hasApplied ? <NotAppliedYet /> : null}
      {data && hasApplied ? <Applied data={data} isEarning={isEarning} pendingCount={pending.data?.length ?? 0} /> : null}
      {data && hasApplied ? <Button title="Add another vehicle" variant="outline" onPress={applyOnWeb} /> : null}
    </Screen>
  );
}

function NotAppliedYet() {
  const { c } = useTheme();
  return (
    <Card>
      <EmptyState
        icon={<FileText size={28} color={c.primary} />}
        title="No application yet"
        body="Put the car you already own to work. We list it, price it, deliver it, clean it and service it - you keep 80% of every booking."
        actionLabel="Apply to become a partner"
        onAction={applyOnWeb}
      />
      <Button title="Read how it works first" variant="ghost" onPress={() => void openInAppBrowser(webUrl('/asset-partners'))} />
    </Card>
  );
}

function Applied({ data, isEarning, pendingCount }: { data: PartnerDashboard; isEarning: boolean; pendingCount: number }) {
  const { c } = useTheme();
  const router = useRouter();
  const s = data.currentStatement;
  const cur = s?.currency ?? 'USD';
  const money = (v: number) => formatMoney({ amount: v, currency: cur });
  const closed = (data.history ?? []).filter((h) => h.final).slice().reverse();
  const preview = data.vehicles.slice(0, 3);

  return (
    <>
      {pendingCount > 0 ? (
        <Card onPress={() => router.navigate('/asset-partners/maintenance')} style={{ borderColor: c.warning, backgroundColor: c.warningSoft }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Wrench size={20} color={c.warning} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label">
                {pendingCount} maintenance {pendingCount === 1 ? 'request needs' : 'requests need'} your approval
              </Text>
              <Text variant="caption" tone="muted">Work above your approval line doesn’t start until you say so.</Text>
            </View>
            <ChevronRight size={18} color={c.mutedForeground} />
          </View>
        </Card>
      ) : null}

      {isEarning && s ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            <StatTile label="Your net this month" value={money(s.totals.net)} sub={s.final ? 'Final' : 'Still running'} icon={<Wallet size={16} color={c.mutedForeground} />} tone={s.totals.net >= 0 ? 'success' : 'warning'} />
            <StatTile label="Paid on" value={formatDate(s.payoutDate)} sub={`By ${s.payoutMethod}`} icon={<CalendarClock size={16} color={c.mutedForeground} />} />
            <StatTile label="Gross bookings" value={money(s.totals.gross)} sub={`${s.totals.trips} completed trip${s.totals.trips === 1 ? '' : 's'}`} icon={<TrendingUp size={16} color={c.mutedForeground} />} />
            <StatTile
              label="Vehicles"
              value={String(data.vehicles.length)}
              sub={`${s.terms.managementFeeBps / 100}% management fee`}
              icon={<Car size={16} color={c.mutedForeground} />}
              onPress={() => router.navigate('/asset-partners/vehicles')}
            />
          </View>
          <StatementCard statement={s} compact />
          <Button title="See every statement" variant="ghost" onPress={() => router.navigate('/asset-partners/statements')} />
          {closed.length > 0 ? (
            <Card>
              <Text variant="heading" style={{ marginBottom: space.md }}>Your net by month</Text>
              <BarChart data={closed.map((h) => ({ label: h.period.slice(5), value: h.totals.net }))} format={money} />
            </Card>
          ) : null}
          <Section
            title="Your vehicles"
            action={data.vehicles.length > preview.length ? <Button title={`View all ${data.vehicles.length}`} variant="ghost" size="sm" full={false} onPress={() => router.navigate('/asset-partners/vehicles')} /> : undefined}
          >
            {preview.map((v) => <PartnerVehicleCard key={v._id} vehicle={v} currency={cur} />)}
          </Section>
        </>
      ) : null}

      {data.partner ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="small" tone="muted">PROGRAMME STATUS</Text>
              <Text variant="label">
                {data.partner.displayName} · <Text variant="label" tone="muted" style={{ textTransform: 'capitalize' }}>{data.partner.partnerType}</Text>
              </Text>
            </View>
            <Badge label={PARTNER_STATUS[data.partner.status].label} tone={partnerBadge(PARTNER_STATUS[data.partner.status].tone)} />
          </View>
        </Card>
      ) : null}

      {data.applications.length > 0 ? (
        <Section title={data.applications.length === 1 ? 'Your application' : 'Your applications'}>
          {data.applications.map((app) => <ApplicationCard key={app._id} app={app} isEarning={isEarning} />)}
        </Section>
      ) : null}

      <PartnerSupport />
    </>
  );
}
